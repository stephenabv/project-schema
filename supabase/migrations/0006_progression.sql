-- Virtual Earn: progression (XP and levels), daily activity, missions and
-- achievements.
--
-- Everything here is VIRTUAL: mission and achievement rewards are virtual
-- coins (VC) with no monetary value. All reward writes happen inside
-- SECURITY DEFINER functions that lock the caller's wallet row first, so every
-- reward for one user is serialized and the wallet always equals the ledger.
--
-- Error contract additions (SQLSTATE -> meaning):
--   VE004  mission already claimed for the current period
--   VE005  mission objective not complete yet
--   VE010  requested mission does not exist or is not available

-- Internal helpers live in a schema the Data API does not expose.
create schema if not exists ve_private;
revoke all on schema ve_private from public;
grant usage on schema ve_private to authenticated;

-- ---------------------------------------------------------------------------
-- Ledger: achievement rewards become a new entry type
-- ---------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (
  type in ('tap_reward', 'mission_reward', 'achievement_reward', 'admin_adjustment')
);

-- ---------------------------------------------------------------------------
-- player_progress: running totals used for levels and achievement criteria
-- ---------------------------------------------------------------------------
create table public.player_progress (
  user_id uuid primary key references public.player_profiles (id) on delete cascade,
  xp_total bigint not null default 0 check (xp_total >= 0),
  total_taps bigint not null default 0 check (total_taps >= 0),
  total_coins_earned bigint not null default 0 check (total_coins_earned >= 0),
  missions_completed integer not null default 0 check (missions_completed >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- daily_activity: one row per user and UTC day (mission progress source)
-- ---------------------------------------------------------------------------
create table public.daily_activity (
  user_id uuid not null references public.player_profiles (id) on delete cascade,
  activity_date date not null,
  tap_count integer not null default 0 check (tap_count >= 0),
  coins_earned bigint not null default 0 check (coins_earned >= 0),
  xp_earned bigint not null default 0 check (xp_earned >= 0),
  missions_completed integer not null default 0 check (missions_completed >= 0),
  duplicate_requests integer not null default 0 check (duplicate_requests >= 0),
  primary key (user_id, activity_date)
);

create index daily_activity_date_idx on public.daily_activity (activity_date);

-- ---------------------------------------------------------------------------
-- tasks (missions) and per-period claims
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 48),
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 280),
  objective_type text not null check (objective_type in ('taps', 'missions')),
  objective_target integer not null check (objective_target between 1 and 1000000),
  reward_coins integer not null check (reward_coins between 1 and 1000000),
  xp_reward integer not null default 0 check (xp_reward between 0 and 1000000),
  frequency text not null check (frequency in ('daily', 'weekly', 'once')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_status_idx on public.tasks (status, sort_order);

-- A claim is recorded once per user, task and period (UTC day, ISO week, or
-- 'once'); the unique key makes double claims impossible even under races.
create table public.task_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.player_profiles (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete restrict,
  period_key text not null check (char_length(period_key) between 4 and 16),
  progress integer not null check (progress >= 0),
  transaction_id uuid not null,
  completed_at timestamptz not null default now(),
  unique (user_id, task_id, period_key)
);

create index task_progress_task_idx on public.task_progress (task_id, completed_at);

-- ---------------------------------------------------------------------------
-- achievements (badges)
-- ---------------------------------------------------------------------------
create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 48),
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 280),
  metric text not null check (metric in ('total_taps', 'total_coins_earned', 'missions_completed', 'level')),
  threshold bigint not null check (threshold between 1 and 1000000000),
  reward_coins integer not null default 0 check (reward_coins between 0 and 1000000),
  xp_reward integer not null default 0 check (xp_reward between 0 and 1000000),
  icon text not null default 'award' check (icon ~ '^[a-z]+(-[a-z]+)*$' and char_length(icon) <= 32),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_achievements (
  user_id uuid not null references public.player_profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete restrict,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ---------------------------------------------------------------------------
-- Pure helpers (no data access): levels and mission periods
-- ---------------------------------------------------------------------------

-- XP required to reach a level: 50 * L * (L - 1)  (L1 = 0, L2 = 100, L3 = 300, ...)
create or replace function ve_private.xp_for_level(p_level integer)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$
  select 50::bigint * greatest(p_level, 1) * (greatest(p_level, 1) - 1);
$$;

create or replace function ve_private.level_for_xp(p_xp bigint)
returns integer
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_level integer := greatest(1, floor((1 + sqrt(1 + 4 * greatest(p_xp, 0)::numeric / 50)) / 2)::integer);
begin
  -- Correct any floating point rounding at exact boundaries.
  while ve_private.xp_for_level(v_level + 1) <= p_xp loop
    v_level := v_level + 1;
  end loop;
  while v_level > 1 and ve_private.xp_for_level(v_level) > p_xp loop
    v_level := v_level - 1;
  end loop;
  return v_level;
end;
$$;

-- The UTC period a mission is claimed in: daily -> 'YYYY-MM-DD',
-- weekly -> ISO week 'IYYY-Www', once -> 'once'. Bounds are UTC dates,
-- start inclusive and end exclusive.
create or replace function ve_private.task_period(p_frequency text, p_at timestamptz)
returns table (period_key text, starts_on date, ends_on date)
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_day date := timezone('utc', p_at)::date;
  v_week_start date := v_day - (extract(isodow from v_day)::integer - 1);
begin
  if p_frequency = 'daily' then
    return query select to_char(v_day, 'YYYY-MM-DD'), v_day, v_day + 1;
  elsif p_frequency = 'weekly' then
    return query select to_char(v_day, 'IYYY-"W"IW'), v_week_start, v_week_start + 7;
  elsif p_frequency = 'once' then
    return query select 'once'::text, date '2000-01-01', date '9999-12-31';
  else
    raise exception 'Unknown mission frequency' using errcode = '22023';
  end if;
end;
$$;

revoke all on function ve_private.xp_for_level(integer) from public;
revoke all on function ve_private.level_for_xp(bigint) from public;
revoke all on function ve_private.task_period(text, timestamptz) from public;
grant execute on function ve_private.xp_for_level(integer) to authenticated;
grant execute on function ve_private.level_for_xp(bigint) to authenticated;
grant execute on function ve_private.task_period(text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Write helpers. Only called from SECURITY DEFINER functions that already
-- hold the caller's wallet row lock. Not executable by API roles.
-- ---------------------------------------------------------------------------

-- Appends a ledger entry and moves the wallet balance by the same amount.
create or replace function ve_private.post_entry(
  p_user_id uuid,
  p_amount bigint,
  p_type text,
  p_source_type text,
  p_source_id text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_transaction_id uuid;
begin
  insert into public.transactions (user_id, amount_coins, type, source_type, source_id, idempotency_key)
  values (p_user_id, p_amount, p_type, p_source_type, p_source_id, p_idempotency_key)
  returning id into v_transaction_id;

  update public.wallets
  set balance_coins = balance_coins + p_amount, updated_at = now()
  where user_id = p_user_id;

  return v_transaction_id;
end;
$$;

-- Adds earnings to today's activity row and to the running totals.
create or replace function ve_private.record_activity(
  p_user_id uuid,
  p_coins bigint,
  p_xp bigint,
  p_taps integer,
  p_missions integer
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.daily_activity as d (user_id, activity_date, tap_count, coins_earned, xp_earned, missions_completed)
  values (p_user_id, timezone('utc', now())::date, p_taps, p_coins, p_xp, p_missions)
  on conflict (user_id, activity_date) do update
  set tap_count = d.tap_count + excluded.tap_count,
      coins_earned = d.coins_earned + excluded.coins_earned,
      xp_earned = d.xp_earned + excluded.xp_earned,
      missions_completed = d.missions_completed + excluded.missions_completed;

  insert into public.player_progress as p (user_id, xp_total, total_taps, total_coins_earned, missions_completed)
  values (p_user_id, p_xp, p_taps, p_coins, p_missions)
  on conflict (user_id) do update
  set xp_total = p.xp_total + excluded.xp_total,
      total_taps = p.total_taps + excluded.total_taps,
      total_coins_earned = p.total_coins_earned + excluded.total_coins_earned,
      missions_completed = p.missions_completed + excluded.missions_completed,
      updated_at = now();
end;
$$;

-- Current value of an achievement metric for a user.
create or replace function ve_private.metric_value(p_user_id uuid, p_metric text)
returns bigint
language sql
stable
set search_path = ''
as $$
  select case p_metric
    when 'total_taps' then coalesce(p.total_taps, 0)
    when 'total_coins_earned' then coalesce(p.total_coins_earned, 0)
    when 'missions_completed' then coalesce(p.missions_completed, 0)::bigint
    when 'level' then ve_private.level_for_xp(coalesce(p.xp_total, 0))::bigint
    else 0
  end
  from (select 1) as one
  left join public.player_progress p on p.user_id = p_user_id;
$$;

-- Unlocks every active achievement whose criterion is met and pays its
-- reward. Rewards can raise the level, which can unlock more achievements,
-- so this repeats until nothing new unlocks. Returns the unlocked badges.
create or replace function ve_private.evaluate_achievements(p_user_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_unlocked jsonb := '[]'::jsonb;
  v_achievement public.achievements%rowtype;
  v_found boolean;
begin
  loop
    v_found := false;
    for v_achievement in
      select a.*
      from public.achievements a
      where a.is_active
        and not exists (
          select 1 from public.user_achievements ua
          where ua.user_id = p_user_id and ua.achievement_id = a.id
        )
      order by a.sort_order, a.threshold
    loop
      if ve_private.metric_value(p_user_id, v_achievement.metric) >= v_achievement.threshold then
        insert into public.user_achievements (user_id, achievement_id)
        values (p_user_id, v_achievement.id);

        if v_achievement.reward_coins > 0 then
          perform ve_private.post_entry(
            p_user_id, v_achievement.reward_coins, 'achievement_reward', 'achievement',
            v_achievement.id::text, gen_random_uuid()
          );
        end if;
        perform ve_private.record_activity(p_user_id, v_achievement.reward_coins, v_achievement.xp_reward, 0, 0);

        v_unlocked := v_unlocked || jsonb_build_object(
          'slug', v_achievement.slug,
          'title', v_achievement.title,
          'icon', v_achievement.icon,
          'rewardCoins', v_achievement.reward_coins,
          'xpReward', v_achievement.xp_reward
        );
        v_found := true;
      end if;
    end loop;
    exit when not v_found;
  end loop;

  return v_unlocked;
end;
$$;

-- Snapshot returned after every reward: XP, level and balance.
create or replace function ve_private.progress_snapshot(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'xpTotal', coalesce(p.xp_total, 0),
    'level', ve_private.level_for_xp(coalesce(p.xp_total, 0)),
    'balanceCoins', w.balance_coins
  )
  from public.wallets w
  left join public.player_progress p on p.user_id = w.user_id
  where w.user_id = p_user_id;
$$;

revoke all on function ve_private.post_entry(uuid, bigint, text, text, text, uuid) from public;
revoke all on function ve_private.record_activity(uuid, bigint, bigint, integer, integer) from public;
revoke all on function ve_private.metric_value(uuid, text) from public;
revoke all on function ve_private.evaluate_achievements(uuid) from public;
revoke all on function ve_private.progress_snapshot(uuid) from public;

-- ---------------------------------------------------------------------------
-- Tap policy gains XP per tap
-- ---------------------------------------------------------------------------
create or replace function public.tap_policy()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'rewardCoins', 10,
    'cooldownMs', 1000,
    'dailyLimit', 1000,
    'xpPerTap', 1
  );
$$;

-- ---------------------------------------------------------------------------
-- process_tap: same contract as before, plus XP, level and unlocked badges
-- ---------------------------------------------------------------------------
create or replace function public.process_tap(p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy constant jsonb := public.tap_policy();
  v_reward constant bigint := (v_policy ->> 'rewardCoins')::bigint;
  v_xp constant bigint := (v_policy ->> 'xpPerTap')::bigint;
  v_cooldown constant interval := make_interval(secs => (v_policy ->> 'cooldownMs')::numeric / 1000);
  v_daily_limit constant integer := (v_policy ->> 'dailyLimit')::integer;
  v_user_id uuid;
  v_balance bigint;
  v_now timestamptz := now();
  v_today date := timezone('utc', now())::date;
  v_state public.tap_state%rowtype;
  v_existing public.transactions%rowtype;
  v_transaction_id uuid;
  v_unlocked jsonb;
  v_snapshot jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;

  -- The wallet row lock serializes all reward processing for this user.
  select w.balance_coins into v_balance
  from public.wallets w
  where w.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  -- Idempotent replay: return the original outcome without a new reward.
  select t.* into v_existing
  from public.transactions t
  where t.user_id = v_user_id
    and t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.type <> 'tap_reward' then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;

    insert into public.daily_activity as d (user_id, activity_date, duplicate_requests)
    values (v_user_id, v_today, 1)
    on conflict (user_id, activity_date) do update set duplicate_requests = d.duplicate_requests + 1;

    v_snapshot := ve_private.progress_snapshot(v_user_id);
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'transactionId', v_existing.id,
      'rewardCoins', v_existing.amount_coins,
      'balanceCoins', v_balance,
      'tapsToday', (select s.taps_today from public.tap_state s where s.user_id = v_user_id),
      'xpEarned', 0,
      'xpTotal', v_snapshot -> 'xpTotal',
      'level', v_snapshot -> 'level',
      'unlockedAchievements', '[]'::jsonb,
      'currency', 'VC',
      'redeemable', false
    );
  end if;

  insert into public.tap_state (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select s.* into v_state
  from public.tap_state s
  where s.user_id = v_user_id
  for update;

  -- New UTC day: reset the daily counter and the cooldown.
  if v_state.activity_date <> v_today then
    update public.tap_state
    set activity_date = v_today, taps_today = 0, last_tap_at = null
    where user_id = v_user_id;
    v_state.taps_today := 0;
    v_state.last_tap_at := null;
  end if;

  if v_state.taps_today >= v_daily_limit then
    raise exception 'Daily tap limit reached' using errcode = 'VE002';
  end if;

  if v_state.last_tap_at is not null
     and v_now < v_state.last_tap_at + v_cooldown then
    raise exception 'Tap cooldown active' using errcode = 'VE001';
  end if;

  v_transaction_id := ve_private.post_entry(v_user_id, v_reward, 'tap_reward', 'tap', null, p_idempotency_key);

  update public.tap_state
  set last_tap_at = v_now,
      activity_date = v_today,
      taps_today = taps_today + 1
  where user_id = v_user_id;

  perform ve_private.record_activity(v_user_id, v_reward, v_xp, 1, 0);
  v_unlocked := ve_private.evaluate_achievements(v_user_id);
  v_snapshot := ve_private.progress_snapshot(v_user_id);

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'transactionId', v_transaction_id,
    'rewardCoins', v_reward,
    'balanceCoins', v_snapshot -> 'balanceCoins',
    'tapsToday', v_state.taps_today + 1,
    'xpEarned', v_xp,
    'xpTotal', v_snapshot -> 'xpTotal',
    'level', v_snapshot -> 'level',
    'unlockedAchievements', v_unlocked,
    'currency', 'VC',
    'redeemable', false
  );
end;
$$;

revoke all on function public.process_tap(uuid) from public, anon;
grant execute on function public.process_tap(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- claim_task: validate a mission's objective for the current period and pay
-- its reward exactly once per period.
-- ---------------------------------------------------------------------------
create or replace function public.claim_task(p_task_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_existing public.transactions%rowtype;
  v_period record;
  v_progress bigint;
  v_transaction_id uuid;
  v_unlocked jsonb;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_task_id is null or p_idempotency_key is null then
    raise exception 'Mission and idempotency key required' using errcode = '22023';
  end if;

  perform 1 from public.wallets w where w.user_id = v_user_id for update;
  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  select t.* into v_existing
  from public.transactions t
  where t.user_id = v_user_id
    and t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.type <> 'mission_reward' or v_existing.source_id is distinct from p_task_id::text then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;
    v_snapshot := ve_private.progress_snapshot(v_user_id);
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'transactionId', v_existing.id,
      'taskId', p_task_id,
      'rewardCoins', v_existing.amount_coins,
      'xpReward', coalesce((select t.xp_reward from public.tasks t where t.id = p_task_id), 0),
      'balanceCoins', v_snapshot -> 'balanceCoins',
      'xpTotal', v_snapshot -> 'xpTotal',
      'level', v_snapshot -> 'level',
      'unlockedAchievements', '[]'::jsonb,
      'currency', 'VC',
      'redeemable', false
    );
  end if;

  select t.* into v_task
  from public.tasks t
  where t.id = p_task_id and t.status = 'published';

  if not found then
    raise exception 'Mission not available' using errcode = 'VE010';
  end if;

  select * into v_period from ve_private.task_period(v_task.frequency, now());

  if exists (
    select 1 from public.task_progress tp
    where tp.user_id = v_user_id and tp.task_id = v_task.id and tp.period_key = v_period.period_key
  ) then
    raise exception 'Mission already claimed for this period' using errcode = 'VE004';
  end if;

  select coalesce(sum(case v_task.objective_type
                        when 'taps' then d.tap_count
                        when 'missions' then d.missions_completed
                      end), 0)
  into v_progress
  from public.daily_activity d
  where d.user_id = v_user_id
    and d.activity_date >= v_period.starts_on
    and d.activity_date < v_period.ends_on;

  if v_progress < v_task.objective_target then
    raise exception 'Mission objective not complete' using errcode = 'VE005';
  end if;

  v_transaction_id := ve_private.post_entry(
    v_user_id, v_task.reward_coins, 'mission_reward', 'task', v_task.id::text, p_idempotency_key
  );

  insert into public.task_progress (user_id, task_id, period_key, progress, transaction_id)
  values (v_user_id, v_task.id, v_period.period_key, least(v_progress, 2147483647)::integer, v_transaction_id);

  perform ve_private.record_activity(v_user_id, v_task.reward_coins, v_task.xp_reward, 0, 1);
  v_unlocked := ve_private.evaluate_achievements(v_user_id);
  v_snapshot := ve_private.progress_snapshot(v_user_id);

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'transactionId', v_transaction_id,
    'taskId', v_task.id,
    'rewardCoins', v_task.reward_coins,
    'xpReward', v_task.xp_reward,
    'balanceCoins', v_snapshot -> 'balanceCoins',
    'xpTotal', v_snapshot -> 'xpTotal',
    'level', v_snapshot -> 'level',
    'unlockedAchievements', v_unlocked,
    'currency', 'VC',
    'redeemable', false
  );
end;
$$;

revoke all on function public.claim_task(uuid, uuid) from public, anon;
grant execute on function public.claim_task(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Signup provisioning also creates the progress row
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  fallback text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  new_username text;
begin
  if requested is not null
     and requested ~ '^[A-Za-z0-9_]{3,24}$'
     and not exists (
       select 1 from public.player_profiles p where lower(p.username) = lower(requested)
     ) then
    new_username := requested;
  else
    new_username := fallback;
  end if;

  begin
    insert into public.player_profiles (id, username) values (new.id, new_username);
  exception when unique_violation then
    -- Lost a race for the requested name: fall back to the generated one.
    insert into public.player_profiles (id, username) values (new.id, fallback);
  end;

  insert into public.wallets (user_id, balance_coins) values (new.id, 0);
  insert into public.tap_state (user_id) values (new.id);
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  insert into public.player_progress (user_id) values (new.id);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill progress and daily activity from the existing ledger (taps only
-- existed before this migration; 1 XP per historical tap).
-- ---------------------------------------------------------------------------
insert into public.daily_activity (user_id, activity_date, tap_count, coins_earned, xp_earned)
select t.user_id,
       timezone('utc', t.created_at)::date,
       count(*) filter (where t.type = 'tap_reward'),
       coalesce(sum(t.amount_coins) filter (where t.amount_coins > 0), 0),
       count(*) filter (where t.type = 'tap_reward')
from public.transactions t
group by t.user_id, timezone('utc', t.created_at)::date
on conflict (user_id, activity_date) do nothing;

insert into public.player_progress (user_id, xp_total, total_taps, total_coins_earned)
select p.id,
       coalesce(sum(d.xp_earned), 0),
       coalesce(sum(d.tap_count), 0),
       coalesce(sum(d.coins_earned), 0)
from public.player_profiles p
left join public.daily_activity d on d.user_id = p.id
group by p.id
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Default missions and achievements (product configuration, editable by
-- admins). Not sample data: rewards come only from recorded activity.
-- ---------------------------------------------------------------------------
insert into public.tasks (slug, title, description, objective_type, objective_target, reward_coins, xp_reward, frequency, status, sort_order)
values
  ('first-steps', 'First Steps', 'Complete your first accepted tap.', 'taps', 1, 25, 10, 'once', 'published', 0),
  ('tap-starter', 'Tap Starter', 'Complete 10 accepted taps today.', 'taps', 10, 50, 20, 'daily', 'published', 10),
  ('tap-sprinter', 'Tap Sprinter', 'Complete 100 accepted taps today.', 'taps', 100, 150, 50, 'daily', 'published', 20),
  ('tap-marathon', 'Tap Marathon', 'Complete 500 accepted taps today.', 'taps', 500, 400, 120, 'daily', 'published', 30),
  ('weekly-grind', 'Weekly Grind', 'Complete 2,000 accepted taps this week.', 'taps', 2000, 1000, 300, 'weekly', 'published', 40),
  ('mission-master', 'Mission Master', 'Claim 10 missions this week.', 'missions', 10, 800, 250, 'weekly', 'published', 50)
on conflict (slug) do nothing;

insert into public.achievements (slug, title, description, metric, threshold, reward_coins, xp_reward, icon, sort_order)
values
  ('first-tap', 'First Tap', 'Complete your first accepted tap.', 'total_taps', 1, 10, 5, 'hand', 0),
  ('hundred-taps', 'Century', 'Complete 100 accepted taps.', 'total_taps', 100, 100, 25, 'mouse-pointer-click', 10),
  ('thousand-taps', 'Tap Veteran', 'Complete 1,000 accepted taps.', 'total_taps', 1000, 500, 100, 'zap', 20),
  ('ten-thousand-taps', 'Tap Legend', 'Complete 10,000 accepted taps.', 'total_taps', 10000, 2000, 400, 'crown', 30),
  ('first-mission', 'On a Mission', 'Claim your first mission.', 'missions_completed', 1, 50, 20, 'target', 40),
  ('mission-veteran', 'Mission Veteran', 'Claim 25 missions.', 'missions_completed', 25, 500, 150, 'medal', 50),
  ('coin-collector', 'Coin Collector', 'Earn 1,000 virtual coins in total.', 'total_coins_earned', 1000, 100, 30, 'coins', 60),
  ('coin-hoarder', 'Coin Hoarder', 'Earn 10,000 virtual coins in total.', 'total_coins_earned', 10000, 1000, 200, 'gem', 70),
  ('level-five', 'Rising Star', 'Reach level 5.', 'level', 5, 250, 0, 'star', 80),
  ('level-ten', 'Seasoned Player', 'Reach level 10.', 'level', 10, 1000, 0, 'trophy', 90)
on conflict (slug) do nothing;

-- Pre-existing players get the achievements their history already earns.
do $$
declare
  v_user uuid;
begin
  for v_user in select p.user_id from public.player_progress p loop
    perform ve_private.evaluate_achievements(v_user);
  end loop;
end;
$$;
