-- Virtual Earn: robot workers (shop, generator, passive earnings) and the tap
-- rebalance.
--
-- Robots are bought with virtual coins and, while active, earn virtual coins
-- per hour. Accrual is computed only from server timestamps: the database
-- stores when each robot started earning, and collecting pays what accrued by
-- now() under the wallet row lock, then moves that timestamp forward. Page
-- refreshes, extra tabs, replays and server restarts therefore cannot pay the
-- same time twice.
--
-- Error contract additions (SQLSTATE -> meaning):
--   VE016  tap rate limit (too many taps in a minute)
--   VE017  robot limit reached (owned per robot, owned in total, or active)
--   (reuses VE008 not enough coins, VE009 level required, VE011 not allowed,
--    VE012 not found, VE014 feature off, VE015 nothing to collect)

-- ---------------------------------------------------------------------------
-- Ledger types: robot spending and output are separately identifiable from
-- tap rewards. Conversion holds and releases are added here so the ledger
-- guards below can be written once (see 0012).
-- ---------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (
  type in (
    'tap_reward', 'mission_reward', 'achievement_reward', 'daily_bonus', 'shop_purchase',
    'idle_reward', 'generator_upgrade', 'robot_purchase', 'robot_earning',
    'conversion_hold', 'conversion_release', 'admin_adjustment'
  )
);

create index if not exists transactions_type_created_idx on public.transactions (type, created_at desc);

-- ---------------------------------------------------------------------------
-- Feature flags gain "robots"
-- ---------------------------------------------------------------------------
create or replace function public.feature_flags()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('dailyBonus', true, 'leaderboard', true, 'shop', true, 'idleGenerator', true, 'robots', true)
         || coalesce((select s.value from public.app_settings s where s.key = 'feature_flags'), '{}'::jsonb);
$$;

create or replace function public.ve_admin_update_feature_flags(p_flags jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_before jsonb := public.feature_flags();
  v_after jsonb;
begin
  if p_flags is null or jsonb_typeof(p_flags) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_flags) as k)
        <> array['dailyBonus', 'idleGenerator', 'leaderboard', 'robots', 'shop']
     or exists (select 1 from jsonb_each(p_flags) as e where jsonb_typeof(e.value) <> 'boolean') then
    raise exception 'Flags must contain exactly dailyBonus, idleGenerator, leaderboard, robots and shop as booleans'
      using errcode = '22023';
  end if;

  v_after := p_flags;
  insert into public.app_settings (key, value, updated_by, updated_at)
  values ('feature_flags', v_after, v_admin, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  perform ve_private.audit(v_admin, 'settings.feature_flags', 'setting', 'feature_flags',
    jsonb_build_object('before', v_before, 'after', v_after));

  return public.feature_flags();
end;
$$;

-- ---------------------------------------------------------------------------
-- Redemption switch. Off by default: converting virtual coins is refused by
-- the ledger itself until an admin turns it on (see 0012 for the rest of the
-- policy). Defined here because the ledger guard reads it.
-- ---------------------------------------------------------------------------
create or replace function public.redemption_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'enabled', false,
           'minConversionCoins', 10000,
           'maxConversionCoins', 1000000,
           'minPayoutCentavos', 10000,
           'maxPayoutCentavos', 5000000,
           'processingDays', 7
         )
         || coalesce((select s.value from public.app_settings s where s.key = 'redemption_policy'), '{}'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- Ledger guards. Releases of reserved coins must always succeed (a rejected
-- or cancelled conversion returns the player's coins even while the account
-- is suspended or the game is in maintenance).
-- ---------------------------------------------------------------------------
create or replace function ve_private.block_suspended_rewards()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type not in ('admin_adjustment', 'conversion_release') and exists (
    select 1 from public.player_profiles p where p.id = new.user_id and p.suspended_at is not null
  ) then
    raise exception 'Account suspended' using errcode = 'VE006';
  end if;
  return new;
end;
$$;

create or replace function ve_private.guard_ledger_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_flags jsonb;
  v_flag text;
begin
  if new.type in ('admin_adjustment', 'conversion_release') then
    return new;
  end if;

  if (public.maintenance_status() ->> 'enabled')::boolean then
    raise exception 'Maintenance in progress' using errcode = 'VE007';
  end if;

  if new.type = 'conversion_hold' then
    if not coalesce((public.redemption_policy() ->> 'enabled')::boolean, false) then
      raise exception 'Conversions are turned off' using errcode = 'VE014';
    end if;
    return new;
  end if;

  v_flag := case new.type
    when 'daily_bonus' then 'dailyBonus'
    when 'shop_purchase' then 'shop'
    when 'idle_reward' then 'idleGenerator'
    when 'generator_upgrade' then 'idleGenerator'
    when 'robot_purchase' then 'robots'
    when 'robot_earning' then 'robots'
  end;
  if v_flag is not null then
    v_flags := public.feature_flags();
    if not coalesce((v_flags ->> v_flag)::boolean, true) then
      raise exception 'Feature turned off' using errcode = 'VE014';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tap rebalance: tapping becomes a supplementary source. Lower reward, lower
-- daily cap and a per-minute burst limit against automated tapping.
-- ---------------------------------------------------------------------------
alter table public.tap_state
  add column minute_window_start timestamptz,
  add column minute_taps integer not null default 0 check (minute_taps >= 0);

create or replace function public.tap_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('rewardCoins', 2, 'cooldownMs', 1000, 'dailyLimit', 500, 'xpPerTap', 1, 'perMinuteLimit', 40)
         || coalesce((select s.value from public.app_settings s where s.key = 'tap_policy'), '{}'::jsonb);
$$;

-- An existing admin override keeps its cooldown, limit and XP but takes the
-- new, lower reward. Recorded in the audit log as a system change.
insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
select null, 'settings.tap_policy', 'setting', 'tap_policy',
       jsonb_build_object('before', s.value, 'after', s.value || '{"rewardCoins": 2, "perMinuteLimit": 40}'::jsonb,
                          'reason', 'Tap rebalance: robots become the main source of virtual coins')
from public.app_settings s
where s.key = 'tap_policy';

update public.app_settings
set value = value || '{"rewardCoins": 2, "perMinuteLimit": 40}'::jsonb, updated_at = now()
where key = 'tap_policy';

create or replace function public.ve_admin_update_tap_policy(p_policy jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_before jsonb := public.tap_policy();
  v_after jsonb;
begin
  if p_policy is null or jsonb_typeof(p_policy) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_policy) as k)
        <> array['cooldownMs', 'dailyLimit', 'perMinuteLimit', 'rewardCoins', 'xpPerTap'] then
    raise exception 'Policy must contain exactly rewardCoins, cooldownMs, dailyLimit, perMinuteLimit and xpPerTap'
      using errcode = '22023';
  end if;

  v_after := jsonb_build_object(
    'rewardCoins', ve_private.int_field(p_policy, 'rewardCoins', 1, 1000),
    'cooldownMs', ve_private.int_field(p_policy, 'cooldownMs', 250, 60000),
    'dailyLimit', ve_private.int_field(p_policy, 'dailyLimit', 1, 100000),
    'xpPerTap', ve_private.int_field(p_policy, 'xpPerTap', 0, 100),
    'perMinuteLimit', ve_private.int_field(p_policy, 'perMinuteLimit', 1, 240)
  );

  insert into public.app_settings (key, value, updated_by, updated_at)
  values ('tap_policy', v_after, v_admin, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  perform ve_private.audit(v_admin, 'settings.tap_policy', 'setting', 'tap_policy',
    jsonb_build_object('before', v_before, 'after', v_after));

  return public.tap_policy();
end;
$$;

-- Same contract as before, plus the per-minute burst limit (VE016).
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
  v_minute_limit constant integer := coalesce((v_policy ->> 'perMinuteLimit')::integer, 60);
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

  -- Rolling one-minute window for bursts.
  if v_state.minute_window_start is null or v_now >= v_state.minute_window_start + interval '1 minute' then
    v_state.minute_window_start := v_now;
    v_state.minute_taps := 0;
  end if;

  if v_state.minute_taps >= v_minute_limit then
    raise exception 'Too many taps this minute' using errcode = 'VE016';
  end if;

  v_transaction_id := ve_private.post_entry(v_user_id, v_reward, 'tap_reward', 'tap', null, p_idempotency_key);

  update public.tap_state
  set last_tap_at = v_now,
      activity_date = v_today,
      taps_today = v_state.taps_today + 1,
      minute_window_start = v_state.minute_window_start,
      minute_taps = v_state.minute_taps + 1
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

-- ---------------------------------------------------------------------------
-- Robot catalog
-- ---------------------------------------------------------------------------
create table public.robots (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 48),
  name text not null check (char_length(name) between 2 and 40),
  description text not null default '' check (char_length(description) <= 200),
  tier text not null check (tier in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  -- Illustration key interpreted by the app from a fixed whitelist.
  image_key text not null check (image_key in ('scout', 'worker', 'forge', 'titan', 'nova', 'drone', 'mech')),
  price_coins bigint not null check (price_coins between 1 and 1000000000),
  coins_per_hour integer not null check (coins_per_hour between 1 and 1000000),
  max_per_user integer not null default 1 check (max_per_user between 1 and 100),
  level_required integer not null default 1 check (level_required between 1 and 1000),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index robots_status_idx on public.robots (status, sort_order);

-- Robots a player owns. The earning rate is a snapshot taken at purchase, so a
-- later catalog change never alters what an owned robot was sold as.
-- earning_since is set exactly while the robot is active.
create table public.user_robots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.player_profiles (id) on delete cascade,
  robot_id uuid not null references public.robots (id) on delete restrict,
  coins_per_hour integer not null check (coins_per_hour between 1 and 1000000),
  price_paid_coins bigint not null check (price_paid_coins > 0),
  is_active boolean not null default false,
  earning_since timestamptz,
  total_earned_coins bigint not null default 0 check (total_earned_coins >= 0),
  purchase_transaction_id uuid not null unique,
  purchased_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_robots_active_since check (is_active = (earning_since is not null))
);

create index user_robots_user_idx on public.user_robots (user_id, purchased_at);
create index user_robots_robot_idx on public.user_robots (robot_id);
create index user_robots_active_idx on public.user_robots (user_id) where is_active;

-- One row per robot per payout: the robot's earning history.
create table public.robot_earnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.player_profiles (id) on delete cascade,
  user_robot_id uuid not null references public.user_robots (id) on delete cascade,
  coins bigint not null check (coins > 0),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end >= period_start),
  transaction_id uuid not null,
  reason text not null check (reason in ('collect', 'deactivate')),
  created_at timestamptz not null default now()
);

create index robot_earnings_robot_idx on public.robot_earnings (user_robot_id, created_at desc);
create index robot_earnings_user_idx on public.robot_earnings (user_id, created_at desc);
create index robot_earnings_tx_idx on public.robot_earnings (transaction_id);

create or replace function ve_private.prevent_history_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

revoke all on function ve_private.prevent_history_change() from public;

create trigger robot_earnings_append_only
  before update on public.robot_earnings
  for each row execute function ve_private.prevent_history_change();

alter table public.robots enable row level security;
alter table public.user_robots enable row level security;
alter table public.robot_earnings enable row level security;
revoke all on public.robots from anon, authenticated;
revoke all on public.user_robots from anon, authenticated;
revoke all on public.robot_earnings from anon, authenticated;
grant select on public.robots to authenticated;
grant select on public.user_robots to authenticated;
grant select on public.robot_earnings to authenticated;

create policy "robots_select_listed"
  on public.robots for select to authenticated
  using (status = 'active');

create policy "user_robots_select_own"
  on public.user_robots for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "robot_earnings_select_own"
  on public.robot_earnings for select to authenticated
  using ((select auth.uid()) = user_id);

-- Balanced progression: every tier costs more and earns more, and a better
-- rate always costs more (enforced on every admin save). Payback shortens
-- slightly with each tier (about 50h down to 36h) so upgrading stays worth it.
insert into public.robots (slug, name, description, tier, image_key, price_coins, coins_per_hour, max_per_user, level_required, status, sort_order)
values
  ('scout-bot', 'Scout Bot', 'A small starter robot that gathers virtual coins around the clock.', 'common', 'scout', 500, 10, 5, 1, 'active', 10),
  ('worker-bot', 'Worker Bot', 'A dependable worker with four times the Scout''s output.', 'uncommon', 'worker', 2000, 45, 5, 2, 'active', 20),
  ('forge-bot', 'Forge Bot', 'Forges virtual coins at an industrial pace.', 'rare', 'forge', 7500, 180, 3, 4, 'active', 30),
  ('titan-bot', 'Titan Bot', 'A heavy-duty robot for seasoned players.', 'epic', 'titan', 25000, 650, 2, 6, 'active', 40),
  ('nova-bot', 'Nova Bot', 'The top of the line. Only one per player.', 'legendary', 'nova', 80000, 2200, 1, 8, 'active', 50)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Robot policy and accrual
-- ---------------------------------------------------------------------------
create or replace function public.robot_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('maxOwned', 15, 'maxActive', 5, 'accrualCapHours', 24)
         || coalesce((select s.value from public.app_settings s where s.key = 'robot_policy'), '{}'::jsonb);
$$;

-- Whole coins accrued between p_since and p_now at p_rate per hour, capped at
-- p_cap_hours, and the timestamp to resume from. Fractions of a coin are kept
-- by advancing the start only by the time that was paid for; once the cap is
-- reached the robot has stopped and resumes from p_now.
create or replace function ve_private.robot_accrual(
  p_rate integer,
  p_since timestamptz,
  p_cap_hours integer,
  p_now timestamptz
)
returns table (coins bigint, resume_from timestamptz, capped boolean)
language sql
immutable
set search_path = ''
as $$
  with e as (
    select greatest(extract(epoch from p_now - p_since), 0)::numeric as elapsed,
           (p_cap_hours * 3600)::numeric as cap
  ),
  c as (
    select floor(p_rate::numeric * least(e.elapsed, e.cap) / 3600)::bigint as coins,
           e.elapsed >= e.cap as capped
    from e
  )
  select c.coins,
         case when c.capped then p_now
              else p_since + make_interval(secs => c.coins::numeric * 3600 / p_rate) end,
         c.capped
  from c;
$$;

revoke all on function ve_private.robot_accrual(integer, timestamptz, integer, timestamptz) from public;
grant execute on function ve_private.robot_accrual(integer, timestamptz, integer, timestamptz) to authenticated;

create or replace function ve_private.robot_pending(p_robot public.user_robots, p_now timestamptz)
returns bigint
language sql
stable
set search_path = ''
as $$
  select case when p_robot.is_active then
    (select a.coins from ve_private.robot_accrual(
       p_robot.coins_per_hour, p_robot.earning_since,
       (public.robot_policy() ->> 'accrualCapHours')::integer, p_now) a)
  else 0 end;
$$;

revoke all on function ve_private.robot_pending(public.user_robots, timestamptz) from public;
grant execute on function ve_private.robot_pending(public.user_robots, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Player read models
-- ---------------------------------------------------------------------------
create or replace function public.list_robot_shop()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy jsonb := public.robot_policy();
  v_level integer;
  v_owned integer;
  v_active integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_level := ve_private.level_for_xp(coalesce((select p.xp_total from public.player_progress p where p.user_id = v_user_id), 0));
  select count(*), count(*) filter (where ur.is_active) into v_owned, v_active
  from public.user_robots ur where ur.user_id = v_user_id;

  return jsonb_build_object(
    'balanceCoins', coalesce((select w.balance_coins from public.wallets w where w.user_id = v_user_id), 0),
    'level', v_level,
    'ownedCount', v_owned,
    'activeCount', v_active,
    'maxOwned', (v_policy ->> 'maxOwned')::integer,
    'maxActive', (v_policy ->> 'maxActive')::integer,
    'accrualCapHours', (v_policy ->> 'accrualCapHours')::integer,
    'robots', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'slug', r.slug, 'name', r.name, 'description', r.description, 'tier', r.tier,
               'imageKey', r.image_key, 'priceCoins', r.price_coins, 'coinsPerHour', r.coins_per_hour,
               'coinsPer24h', r.coins_per_hour * 24, 'maxPerUser', r.max_per_user,
               'levelRequired', r.level_required, 'ownedCount', coalesce(mine.owned, 0),
               'activeCount', coalesce(mine.active, 0),
               'status', case when coalesce(mine.active, 0) > 0 then 'active'
                              when coalesce(mine.owned, 0) > 0 then 'owned'
                              else 'available' end,
               'blocker', case when r.status <> 'active' then 'unlisted'
                               when coalesce(mine.owned, 0) >= r.max_per_user then 'robot_limit'
                               when v_owned >= (v_policy ->> 'maxOwned')::integer then 'total_limit'
                               when v_level < r.level_required then 'level' end
             ) order by r.sort_order, r.price_coins)
      from public.robots r
      left join (
        select ur.robot_id, count(*) as owned, count(*) filter (where ur.is_active) as active
        from public.user_robots ur where ur.user_id = v_user_id group by ur.robot_id
      ) mine on mine.robot_id = r.id
      where r.status = 'active' or mine.owned > 0
    ), '[]'::jsonb),
    'currency', 'VC',
    'redeemable', false
  );
end;
$$;

create or replace function public.get_robot_generator()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy jsonb := public.robot_policy();
  v_now timestamptz := now();
  v_today_start timestamptz := timezone('utc', now())::date::timestamp at time zone 'utc';
  v_robots jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ur.id, 'robotId', r.id, 'name', r.name, 'tier', r.tier, 'imageKey', r.image_key,
           'coinsPerHour', ur.coins_per_hour, 'isActive', ur.is_active, 'earningSince', ur.earning_since,
           'pendingCoins', ve_private.robot_pending(ur, v_now),
           'fullAt', case when ur.is_active
                          then ur.earning_since + make_interval(hours => (v_policy ->> 'accrualCapHours')::integer) end,
           'totalEarnedCoins', ur.total_earned_coins, 'purchasedAt', ur.purchased_at,
           'pricePaidCoins', ur.price_paid_coins,
           'recentEarnings', coalesce((
             select jsonb_agg(jsonb_build_object('coins', e.coins, 'periodStart', e.period_start,
                                                'periodEnd', e.period_end, 'reason', e.reason) order by e.created_at desc)
             from (select * from public.robot_earnings re where re.user_robot_id = ur.id
                   order by re.created_at desc limit 5) e
           ), '[]'::jsonb)
         ) order by ur.is_active desc, ur.coins_per_hour desc, ur.purchased_at), '[]'::jsonb)
  into v_robots
  from public.user_robots ur
  join public.robots r on r.id = ur.robot_id
  where ur.user_id = v_user_id;

  return jsonb_build_object(
    'serverTime', v_now,
    'maxActive', (v_policy ->> 'maxActive')::integer,
    'maxOwned', (v_policy ->> 'maxOwned')::integer,
    'accrualCapHours', (v_policy ->> 'accrualCapHours')::integer,
    'robots', v_robots,
    'totals', (
      select jsonb_build_object(
        'ownedCount', count(*),
        'activeCount', count(*) filter (where ur.is_active),
        'coinsPerHour', coalesce(sum(ur.coins_per_hour) filter (where ur.is_active), 0),
        'pendingCoins', coalesce(sum(ve_private.robot_pending(ur, v_now)), 0),
        'totalEarnedCoins', coalesce(sum(ur.total_earned_coins), 0),
        'earnedTodayCoins', coalesce((select sum(t.amount_coins) from public.transactions t
                                      where t.user_id = v_user_id and t.type = 'robot_earning'
                                        and t.created_at >= v_today_start), 0)
      )
      from public.user_robots ur where ur.user_id = v_user_id
    ),
    'balanceCoins', coalesce((select w.balance_coins from public.wallets w where w.user_id = v_user_id), 0),
    'currency', 'VC',
    'redeemable', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Player actions
-- ---------------------------------------------------------------------------
create or replace function public.purchase_robot(p_robot_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy jsonb := public.robot_policy();
  v_balance bigint;
  v_robot public.robots%rowtype;
  v_existing public.transactions%rowtype;
  v_level integer;
  v_owned integer;
  v_owned_this integer;
  v_active integer;
  v_transaction_id uuid;
  v_user_robot public.user_robots%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_robot_id is null or p_idempotency_key is null then
    raise exception 'Robot and idempotency key required' using errcode = '22023';
  end if;

  select w.balance_coins into v_balance from public.wallets w where w.user_id = v_user_id for update;
  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  select t.* into v_existing
  from public.transactions t
  where t.user_id = v_user_id and t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.type <> 'robot_purchase' or v_existing.source_id is distinct from p_robot_id::text then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;
    select ur.* into v_user_robot from public.user_robots ur where ur.purchase_transaction_id = v_existing.id;
    return jsonb_build_object(
      'success', true, 'duplicate', true, 'transactionId', v_existing.id, 'robotId', p_robot_id,
      'userRobotId', v_user_robot.id, 'activated', coalesce(v_user_robot.is_active, false),
      'priceCoins', -v_existing.amount_coins, 'balanceCoins', v_balance, 'currency', 'VC', 'redeemable', false
    );
  end if;

  select r.* into v_robot from public.robots r where r.id = p_robot_id and r.status = 'active';
  if not found then
    raise exception 'Robot not available' using errcode = 'VE012';
  end if;

  v_level := ve_private.level_for_xp(coalesce((select p.xp_total from public.player_progress p where p.user_id = v_user_id), 0));
  if v_level < v_robot.level_required then
    raise exception 'Level requirement not met' using errcode = 'VE009';
  end if;

  select count(*), count(*) filter (where ur.robot_id = p_robot_id), count(*) filter (where ur.is_active)
  into v_owned, v_owned_this, v_active
  from public.user_robots ur where ur.user_id = v_user_id;

  if v_owned_this >= v_robot.max_per_user or v_owned >= (v_policy ->> 'maxOwned')::integer then
    raise exception 'Robot limit reached' using errcode = 'VE017';
  end if;

  if v_balance < v_robot.price_coins then
    raise exception 'Not enough virtual coins' using errcode = 'VE008';
  end if;

  v_transaction_id := ve_private.post_entry(
    v_user_id, -v_robot.price_coins, 'robot_purchase', 'robot', v_robot.id::text, p_idempotency_key
  );

  -- A free active slot puts the new robot to work straight away.
  insert into public.user_robots (user_id, robot_id, coins_per_hour, price_paid_coins, is_active, earning_since,
                                  purchase_transaction_id)
  values (v_user_id, v_robot.id, v_robot.coins_per_hour, v_robot.price_coins,
          v_active < (v_policy ->> 'maxActive')::integer,
          case when v_active < (v_policy ->> 'maxActive')::integer then now() end,
          v_transaction_id)
  returning * into v_user_robot;

  perform ve_private.notify(v_user_id, 'shop', 'You bought ' || v_robot.name,
    case when v_user_robot.is_active then 'It is earning ' || v_robot.coins_per_hour || ' virtual coins per hour.'
         else 'Activate it in the generator when a slot is free.' end,
    '/generator');

  return jsonb_build_object(
    'success', true, 'duplicate', false, 'transactionId', v_transaction_id, 'robotId', v_robot.id,
    'userRobotId', v_user_robot.id, 'activated', v_user_robot.is_active,
    'priceCoins', v_robot.price_coins, 'balanceCoins', v_balance - v_robot.price_coins,
    'currency', 'VC', 'redeemable', false
  );
end;
$$;

-- Pays every active robot's accrued coins as one ledger entry, with one
-- earning record per robot. Idempotent per key.
create or replace function public.collect_robot_earnings(p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cap integer := (public.robot_policy() ->> 'accrualCapHours')::integer;
  v_now timestamptz := now();
  v_existing public.transactions%rowtype;
  v_total bigint := 0;
  v_paid_count integer := 0;
  v_transaction_id uuid;
  v_unlocked jsonb;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;

  perform 1 from public.wallets w where w.user_id = v_user_id for update;
  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  select t.* into v_existing
  from public.transactions t
  where t.user_id = v_user_id and t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.type <> 'robot_earning' then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;
    v_snapshot := ve_private.progress_snapshot(v_user_id);
    return jsonb_build_object(
      'success', true, 'duplicate', true, 'transactionId', v_existing.id, 'collectedCoins', v_existing.amount_coins,
      'robotsPaid', (select count(*) from public.robot_earnings e where e.transaction_id = v_existing.id),
      'balanceCoins', v_snapshot -> 'balanceCoins', 'xpTotal', v_snapshot -> 'xpTotal', 'level', v_snapshot -> 'level',
      'unlockedAchievements', '[]'::jsonb, 'currency', 'VC', 'redeemable', false
    );
  end if;

  -- Lock the active robots; with v_now fixed, every computation below sees
  -- the same accrual.
  perform 1 from public.user_robots ur where ur.user_id = v_user_id and ur.is_active for update;

  select coalesce(sum(a.coins), 0), count(*) filter (where a.coins > 0) into v_total, v_paid_count
  from public.user_robots ur
  cross join lateral ve_private.robot_accrual(ur.coins_per_hour, ur.earning_since, v_cap, v_now) a
  where ur.user_id = v_user_id and ur.is_active;

  if v_total < 1 then
    raise exception 'Nothing to collect yet' using errcode = 'VE015';
  end if;

  v_transaction_id := ve_private.post_entry(v_user_id, v_total, 'robot_earning', 'robots', null, p_idempotency_key);

  insert into public.robot_earnings (user_id, user_robot_id, coins, period_start, period_end, transaction_id, reason)
  select v_user_id, ur.id, a.coins, ur.earning_since, a.resume_from, v_transaction_id, 'collect'
  from public.user_robots ur
  cross join lateral ve_private.robot_accrual(ur.coins_per_hour, ur.earning_since, v_cap, v_now) a
  where ur.user_id = v_user_id and ur.is_active and a.coins > 0;

  update public.user_robots ur
  set earning_since = e.period_end, total_earned_coins = ur.total_earned_coins + e.coins, updated_at = v_now
  from public.robot_earnings e
  where e.transaction_id = v_transaction_id and ur.id = e.user_robot_id;

  perform ve_private.record_activity(v_user_id, v_total, 0, 0, 0);
  v_unlocked := ve_private.evaluate_achievements(v_user_id);
  v_snapshot := ve_private.progress_snapshot(v_user_id);

  return jsonb_build_object(
    'success', true, 'duplicate', false, 'transactionId', v_transaction_id, 'collectedCoins', v_total,
    'robotsPaid', v_paid_count,
    'balanceCoins', v_snapshot -> 'balanceCoins', 'xpTotal', v_snapshot -> 'xpTotal', 'level', v_snapshot -> 'level',
    'unlockedAchievements', v_unlocked, 'currency', 'VC', 'redeemable', false
  );
end;
$$;

-- Activates or deactivates an owned robot. Deactivating first pays what it
-- accrued (under p_idempotency_key) so no earned time is lost or paid twice.
-- Repeating the same request is a no-op that returns the current state.
create or replace function public.set_robot_active(p_user_robot_id uuid, p_active boolean, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy jsonb := public.robot_policy();
  v_now timestamptz := now();
  v_robot public.user_robots%rowtype;
  v_existing public.transactions%rowtype;
  v_accrual record;
  v_paid bigint := 0;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_user_robot_id is null or p_active is null or p_idempotency_key is null then
    raise exception 'Robot, state and idempotency key required' using errcode = '22023';
  end if;

  perform 1 from public.wallets w where w.user_id = v_user_id for update;
  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  select t.* into v_existing
  from public.transactions t
  where t.user_id = v_user_id and t.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.type <> 'robot_earning' or v_existing.source_id is distinct from p_user_robot_id::text then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;
    -- Replay of a deactivation that paid out: report the current state only.
    return jsonb_build_object(
      'success', true, 'userRobotId', p_user_robot_id,
      'isActive', (select ur.is_active from public.user_robots ur where ur.id = p_user_robot_id),
      'paidCoins', v_existing.amount_coins,
      'balanceCoins', (select w.balance_coins from public.wallets w where w.user_id = v_user_id),
      'currency', 'VC', 'redeemable', false
    );
  end if;

  select ur.* into v_robot from public.user_robots ur
  where ur.id = p_user_robot_id and ur.user_id = v_user_id
  for update;
  if not found then
    raise exception 'Robot not found' using errcode = 'VE012';
  end if;

  if v_robot.is_active <> p_active then
    if p_active then
      if not coalesce((public.feature_flags() ->> 'robots')::boolean, true) then
        raise exception 'Feature turned off' using errcode = 'VE014';
      end if;
      if (public.maintenance_status() ->> 'enabled')::boolean then
        raise exception 'Maintenance in progress' using errcode = 'VE007';
      end if;
      if (select count(*) from public.user_robots ur where ur.user_id = v_user_id and ur.is_active)
         >= (v_policy ->> 'maxActive')::integer then
        raise exception 'Active robot limit reached' using errcode = 'VE017';
      end if;
      update public.user_robots ur set is_active = true, earning_since = v_now, updated_at = v_now
      where ur.id = v_robot.id returning * into v_robot;
    else
      select * into v_accrual from ve_private.robot_accrual(
        v_robot.coins_per_hour, v_robot.earning_since, (v_policy ->> 'accrualCapHours')::integer, v_now);
      if v_accrual.coins > 0 then
        v_transaction_id := ve_private.post_entry(
          v_user_id, v_accrual.coins, 'robot_earning', 'robot', v_robot.id::text, p_idempotency_key);
        insert into public.robot_earnings (user_id, user_robot_id, coins, period_start, period_end, transaction_id, reason)
        values (v_user_id, v_robot.id, v_accrual.coins, v_robot.earning_since, v_accrual.resume_from, v_transaction_id, 'deactivate');
        perform ve_private.record_activity(v_user_id, v_accrual.coins, 0, 0, 0);
        perform ve_private.evaluate_achievements(v_user_id);
        v_paid := v_accrual.coins;
      end if;
      update public.user_robots ur
      set is_active = false, earning_since = null, total_earned_coins = ur.total_earned_coins + v_paid, updated_at = v_now
      where ur.id = v_robot.id returning * into v_robot;
    end if;
  end if;

  return jsonb_build_object(
    'success', true, 'userRobotId', v_robot.id, 'isActive', v_robot.is_active, 'paidCoins', v_paid,
    'balanceCoins', (select w.balance_coins from public.wallets w where w.user_id = v_user_id),
    'currency', 'VC', 'redeemable', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: robot catalog, robot policy and robot activity
-- ---------------------------------------------------------------------------
create or replace function ve_private.robot_json(p_robot public.robots)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_robot.id, 'slug', p_robot.slug, 'name', p_robot.name, 'description', p_robot.description,
    'tier', p_robot.tier, 'imageKey', p_robot.image_key, 'priceCoins', p_robot.price_coins,
    'coinsPerHour', p_robot.coins_per_hour, 'maxPerUser', p_robot.max_per_user,
    'levelRequired', p_robot.level_required, 'status', p_robot.status, 'sortOrder', p_robot.sort_order,
    'createdAt', p_robot.created_at, 'updatedAt', p_robot.updated_at,
    'unitsOwned', (select count(*) from public.user_robots ur where ur.robot_id = p_robot.id),
    'unitsActive', (select count(*) from public.user_robots ur where ur.robot_id = p_robot.id and ur.is_active),
    'owners', (select count(distinct ur.user_id) from public.user_robots ur where ur.robot_id = p_robot.id),
    'totalEarnedCoins', (select coalesce(sum(ur.total_earned_coins), 0) from public.user_robots ur where ur.robot_id = p_robot.id)
  );
$$;

revoke all on function ve_private.robot_json(public.robots) from public;

create or replace function public.ve_admin_list_robots()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ve_private.require_admin();
  return jsonb_build_object(
    'robots', coalesce((
      select jsonb_agg(ve_private.robot_json(r) order by case r.status when 'archived' then 1 else 0 end, r.sort_order, r.price_coins)
      from public.robots r
    ), '[]'::jsonb),
    'policy', public.robot_policy()
  );
end;
$$;

-- Creates (p_id null) or updates a robot listing. Owned robots keep the rate
-- they were bought at. Among listings that are not archived, a higher rate
-- must always have a higher price.
create or replace function public.ve_admin_save_robot(p_id uuid, p_robot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_existing public.robots%rowtype;
  v_row public.robots%rowtype;
  v_slug text;
  v_name text;
  v_description text;
  v_tier text;
  v_image text;
  v_price bigint;
  v_rate bigint;
  v_max bigint;
  v_level bigint;
  v_status text;
  v_sort bigint;
begin
  if p_robot is null or jsonb_typeof(p_robot) <> 'object' then
    raise exception 'Robot details required' using errcode = '22023';
  end if;

  v_slug := lower(ve_private.text_field(p_robot, 'slug', 3, 48));
  v_name := ve_private.text_field(p_robot, 'name', 2, 40);
  v_description := ve_private.text_field(p_robot, 'description', 0, 200);
  v_tier := ve_private.text_field(p_robot, 'tier', 1, 16);
  v_image := ve_private.text_field(p_robot, 'imageKey', 1, 16);
  v_price := ve_private.int_field(p_robot, 'priceCoins', 1, 1000000000);
  v_rate := ve_private.int_field(p_robot, 'coinsPerHour', 1, 1000000);
  v_max := ve_private.int_field(p_robot, 'maxPerUser', 1, 100);
  v_level := ve_private.int_field(p_robot, 'levelRequired', 1, 1000);
  v_status := ve_private.text_field(p_robot, 'status', 1, 16);
  v_sort := ve_private.int_field(p_robot, 'sortOrder', -100000, 100000);

  if v_status <> 'archived' and exists (
    select 1 from public.robots r
    where r.status <> 'archived' and r.id is distinct from p_id
      and ((r.coins_per_hour > v_rate and r.price_coins <= v_price)
        or (r.coins_per_hour < v_rate and r.price_coins >= v_price))
  ) then
    raise exception 'A robot that earns more must cost more than every robot that earns less' using errcode = 'VE011';
  end if;

  if p_id is null then
    insert into public.robots (slug, name, description, tier, image_key, price_coins, coins_per_hour, max_per_user,
                               level_required, status, sort_order)
    values (v_slug, v_name, v_description, v_tier, v_image, v_price, v_rate, v_max, v_level, v_status, v_sort)
    returning * into v_row;

    perform ve_private.audit(v_admin, 'robot.create', 'robot', v_row.id::text,
      jsonb_build_object('slug', v_row.slug, 'status', v_row.status, 'priceCoins', v_row.price_coins,
                         'coinsPerHour', v_row.coins_per_hour));
  else
    select r.* into v_existing from public.robots r where r.id = p_id for update;
    if not found then
      raise exception 'Robot not found' using errcode = 'VE012';
    end if;

    update public.robots r
    set slug = v_slug, name = v_name, description = v_description, tier = v_tier, image_key = v_image,
        price_coins = v_price, coins_per_hour = v_rate, max_per_user = v_max, level_required = v_level,
        status = v_status, sort_order = v_sort, updated_at = now()
    where r.id = p_id
    returning * into v_row;

    perform ve_private.audit(v_admin,
      case when v_existing.status <> v_row.status then 'robot.status' else 'robot.update' end,
      'robot', v_row.id::text,
      jsonb_build_object(
        'slug', v_row.slug,
        'before', jsonb_build_object('status', v_existing.status, 'priceCoins', v_existing.price_coins,
                                     'coinsPerHour', v_existing.coins_per_hour, 'maxPerUser', v_existing.max_per_user,
                                     'levelRequired', v_existing.level_required),
        'after', jsonb_build_object('status', v_row.status, 'priceCoins', v_row.price_coins,
                                    'coinsPerHour', v_row.coins_per_hour, 'maxPerUser', v_row.max_per_user,
                                    'levelRequired', v_row.level_required)
      ));
  end if;

  return ve_private.robot_json(v_row);
end;
$$;

create or replace function public.ve_admin_update_robot_policy(p_policy jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_before jsonb := public.robot_policy();
  v_after jsonb;
begin
  if p_policy is null or jsonb_typeof(p_policy) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_policy) as k)
        <> array['accrualCapHours', 'maxActive', 'maxOwned'] then
    raise exception 'Policy must contain exactly maxOwned, maxActive and accrualCapHours' using errcode = '22023';
  end if;

  v_after := jsonb_build_object(
    'maxOwned', ve_private.int_field(p_policy, 'maxOwned', 1, 500),
    'maxActive', ve_private.int_field(p_policy, 'maxActive', 1, 100),
    'accrualCapHours', ve_private.int_field(p_policy, 'accrualCapHours', 1, 168)
  );
  if (v_after ->> 'maxActive')::integer > (v_after ->> 'maxOwned')::integer then
    raise exception 'Active robots cannot exceed owned robots' using errcode = '22023';
  end if;

  insert into public.app_settings (key, value, updated_by, updated_at)
  values ('robot_policy', v_after, v_admin, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  perform ve_private.audit(v_admin, 'settings.robot_policy', 'setting', 'robot_policy',
    jsonb_build_object('before', v_before, 'after', v_after));

  return public.robot_policy();
end;
$$;

-- Recent robot purchases and earning payouts across all players.
create or replace function public.ve_admin_robot_activity(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ve_private.require_admin();
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'Invalid limit' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'purchases', coalesce((
      select jsonb_agg(x.row_data order by x.purchased_at desc)
      from (
        select ur.purchased_at, jsonb_build_object(
          'userRobotId', ur.id, 'userId', ur.user_id, 'username', p.username, 'robotName', r.name,
          'priceCoins', ur.price_paid_coins, 'coinsPerHour', ur.coins_per_hour, 'isActive', ur.is_active,
          'totalEarnedCoins', ur.total_earned_coins, 'purchasedAt', ur.purchased_at,
          'transactionId', ur.purchase_transaction_id
        ) as row_data
        from public.user_robots ur
        join public.robots r on r.id = ur.robot_id
        join public.player_profiles p on p.id = ur.user_id
        order by ur.purchased_at desc
        limit p_limit
      ) x
    ), '[]'::jsonb),
    'earnings', coalesce((
      select jsonb_agg(x.row_data order by x.created_at desc)
      from (
        select e.created_at, jsonb_build_object(
          'id', e.id, 'userId', e.user_id, 'username', p.username, 'robotName', r.name, 'coins', e.coins,
          'periodStart', e.period_start, 'periodEnd', e.period_end, 'reason', e.reason,
          'transactionId', e.transaction_id, 'createdAt', e.created_at
        ) as row_data
        from public.robot_earnings e
        join public.user_robots ur on ur.id = e.user_robot_id
        join public.robots r on r.id = ur.robot_id
        join public.player_profiles p on p.id = e.user_id
        order by e.created_at desc
        limit p_limit
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.redemption_policy() from public, anon;
revoke all on function public.robot_policy() from public, anon;
revoke all on function public.list_robot_shop() from public, anon;
revoke all on function public.get_robot_generator() from public, anon;
revoke all on function public.purchase_robot(uuid, uuid) from public, anon;
revoke all on function public.collect_robot_earnings(uuid) from public, anon;
revoke all on function public.set_robot_active(uuid, boolean, uuid) from public, anon;
revoke all on function public.ve_admin_list_robots() from public, anon;
revoke all on function public.ve_admin_save_robot(uuid, jsonb) from public, anon;
revoke all on function public.ve_admin_update_robot_policy(jsonb) from public, anon;
revoke all on function public.ve_admin_robot_activity(integer) from public, anon;

grant execute on function public.redemption_policy() to authenticated;
grant execute on function public.robot_policy() to authenticated;
grant execute on function public.list_robot_shop() to authenticated;
grant execute on function public.get_robot_generator() to authenticated;
grant execute on function public.purchase_robot(uuid, uuid) to authenticated;
grant execute on function public.collect_robot_earnings(uuid) to authenticated;
grant execute on function public.set_robot_active(uuid, boolean, uuid) to authenticated;
grant execute on function public.ve_admin_list_robots() to authenticated;
grant execute on function public.ve_admin_save_robot(uuid, jsonb) to authenticated;
grant execute on function public.ve_admin_update_robot_policy(jsonb) to authenticated;
grant execute on function public.ve_admin_robot_activity(integer) to authenticated;
