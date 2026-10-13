-- Virtual Earn: operations and advanced features (feature flags, maintenance
-- mode, idle generator, scheduled mission publishing, economy and retention
-- analytics).
--
-- Feature flags and maintenance mode are enforced by a trigger on the ledger,
-- so no reward path (tap, mission, bonus, purchase, generator) can bypass
-- them. Admin adjustments are exempt so support can still fix balances.
--
-- Error contract additions (SQLSTATE -> meaning):
--   VE007  maintenance mode: earning and spending are paused
--   VE014  feature turned off by an admin
--   VE015  nothing to collect from the generator yet

-- ---------------------------------------------------------------------------
-- Ledger types
-- ---------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (
  type in (
    'tap_reward', 'mission_reward', 'achievement_reward', 'daily_bonus', 'shop_purchase',
    'idle_reward', 'generator_upgrade', 'admin_adjustment'
  )
);

-- ---------------------------------------------------------------------------
-- Feature flags and maintenance mode
-- ---------------------------------------------------------------------------
create or replace function public.feature_flags()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('dailyBonus', true, 'leaderboard', true, 'shop', true, 'idleGenerator', true)
         || coalesce((select s.value from public.app_settings s where s.key = 'feature_flags'), '{}'::jsonb);
$$;

create or replace function public.maintenance_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('enabled', false, 'message', '')
         || coalesce((select s.value from public.app_settings s where s.key = 'maintenance'), '{}'::jsonb);
$$;

-- What the player UI needs to know: which features are on and whether
-- earning is paused.
create or replace function public.get_app_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('flags', public.feature_flags(), 'maintenance', public.maintenance_status());
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
  if new.type = 'admin_adjustment' then
    return new;
  end if;

  if (public.maintenance_status() ->> 'enabled')::boolean then
    raise exception 'Maintenance in progress' using errcode = 'VE007';
  end if;

  v_flag := case new.type
    when 'daily_bonus' then 'dailyBonus'
    when 'shop_purchase' then 'shop'
    when 'idle_reward' then 'idleGenerator'
    when 'generator_upgrade' then 'idleGenerator'
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

-- Fires after transactions_block_suspended (triggers run in name order).
create trigger transactions_guard_availability
  before insert on public.transactions
  for each row execute function ve_private.guard_ledger_availability();

revoke all on function ve_private.guard_ledger_availability() from public;

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
        <> array['dailyBonus', 'idleGenerator', 'leaderboard', 'shop']
     or exists (select 1 from jsonb_each(p_flags) as e where jsonb_typeof(e.value) <> 'boolean') then
    raise exception 'Flags must contain exactly dailyBonus, idleGenerator, leaderboard and shop as booleans'
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

create or replace function public.ve_admin_set_maintenance(p_enabled boolean, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_before jsonb := public.maintenance_status();
  v_message text := btrim(coalesce(p_message, ''));
  v_after jsonb;
begin
  if p_enabled is null or char_length(v_message) > 200 then
    raise exception 'Give enabled and a message of at most 200 characters' using errcode = '22023';
  end if;

  v_after := jsonb_build_object('enabled', p_enabled, 'message', v_message);
  insert into public.app_settings (key, value, updated_by, updated_at)
  values ('maintenance', v_after, v_admin, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  perform ve_private.audit(v_admin, case when p_enabled then 'settings.maintenance_on' else 'settings.maintenance_off' end,
    'setting', 'maintenance', jsonb_build_object('before', v_before, 'after', v_after));

  return public.maintenance_status();
end;
$$;

create or replace function public.ve_admin_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ve_private.require_admin();
  return jsonb_build_object(
    'tapPolicy', public.tap_policy(),
    'tapPolicyUpdatedAt', (select s.updated_at from public.app_settings s where s.key = 'tap_policy'),
    'tapPolicyUpdatedBy', (
      select p.username from public.app_settings s
      join public.player_profiles p on p.id = s.updated_by
      where s.key = 'tap_policy'
    ),
    'featureFlags', public.feature_flags(),
    'maintenance', public.maintenance_status()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Idle generator: earns virtual coins over time, up to a storage cap; the
-- player collects them and can upgrade the rate with virtual coins.
-- ---------------------------------------------------------------------------
create table public.player_generators (
  user_id uuid primary key references public.player_profiles (id) on delete cascade,
  level integer not null check (level between 1 and 100),
  last_claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.player_generators enable row level security;
revoke all on public.player_generators from anon, authenticated;
grant select on public.player_generators to authenticated;

create policy "player_generators_select_own"
  on public.player_generators for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.generator_policy()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('coinsPerLevelPerHour', 6, 'capHours', 8, 'maxLevel', 10, 'baseUpgradeCost', 150);
$$;

-- Cost to reach p_level (level 1 buys the generator).
create or replace function ve_private.generator_cost(p_level integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (public.generator_policy() ->> 'baseUpgradeCost')::integer * p_level * p_level;
$$;

-- Coins accrued since the last collection, capped at the storage limit.
create or replace function ve_private.generator_pending(p_level integer, p_since timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select floor(
    (public.generator_policy() ->> 'coinsPerLevelPerHour')::numeric * p_level
    * least(greatest(extract(epoch from now() - p_since), 0), (public.generator_policy() ->> 'capHours')::numeric * 3600)
    / 3600
  )::integer;
$$;

revoke all on function ve_private.generator_cost(integer) from public;
revoke all on function ve_private.generator_pending(integer, timestamptz) from public;
grant execute on function ve_private.generator_cost(integer) to authenticated;
grant execute on function ve_private.generator_pending(integer, timestamptz) to authenticated;

create or replace function public.get_generator_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy jsonb := public.generator_policy();
  v_generator public.player_generators%rowtype;
  v_level integer;
  v_max integer := (v_policy ->> 'maxLevel')::integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select g.* into v_generator from public.player_generators g where g.user_id = v_user_id;
  v_level := coalesce(v_generator.level, 0);

  return jsonb_build_object(
    'level', v_level,
    'maxLevel', v_max,
    'coinsPerHour', (v_policy ->> 'coinsPerLevelPerHour')::integer * v_level,
    'capHours', (v_policy ->> 'capHours')::integer,
    'pendingCoins', case when v_level > 0 then ve_private.generator_pending(v_level, v_generator.last_claimed_at) else 0 end,
    'lastCollectedAt', v_generator.last_claimed_at,
    'fullAt', case when v_level > 0
                   then v_generator.last_claimed_at + make_interval(hours => (v_policy ->> 'capHours')::integer) end,
    'nextUpgradeCost', case when v_level < v_max then ve_private.generator_cost(v_level + 1) end,
    'nextCoinsPerHour', case when v_level < v_max
                             then (v_policy ->> 'coinsPerLevelPerHour')::integer * (v_level + 1) end,
    'balanceCoins', coalesce((select w.balance_coins from public.wallets w where w.user_id = v_user_id), 0),
    'currency', 'VC',
    'redeemable', false
  );
end;
$$;

create or replace function public.collect_generator(p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_generator public.player_generators%rowtype;
  v_existing public.transactions%rowtype;
  v_amount integer;
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
    if v_existing.type <> 'idle_reward' then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;
    v_snapshot := ve_private.progress_snapshot(v_user_id);
    return jsonb_build_object(
      'success', true, 'duplicate', true, 'transactionId', v_existing.id, 'collectedCoins', v_existing.amount_coins,
      'balanceCoins', v_snapshot -> 'balanceCoins', 'xpTotal', v_snapshot -> 'xpTotal', 'level', v_snapshot -> 'level',
      'unlockedAchievements', '[]'::jsonb, 'currency', 'VC', 'redeemable', false
    );
  end if;

  select g.* into v_generator from public.player_generators g where g.user_id = v_user_id for update;
  if not found then
    raise exception 'No generator yet' using errcode = 'VE012';
  end if;

  v_amount := ve_private.generator_pending(v_generator.level, v_generator.last_claimed_at);
  if v_amount < 1 then
    raise exception 'Nothing to collect yet' using errcode = 'VE015';
  end if;

  v_transaction_id := ve_private.post_entry(
    v_user_id, v_amount, 'idle_reward', 'generator', v_generator.level::text, p_idempotency_key
  );

  update public.player_generators g
  set last_claimed_at = now(), updated_at = now()
  where g.user_id = v_user_id;

  perform ve_private.record_activity(v_user_id, v_amount, 0, 0, 0);
  v_unlocked := ve_private.evaluate_achievements(v_user_id);
  v_snapshot := ve_private.progress_snapshot(v_user_id);

  return jsonb_build_object(
    'success', true, 'duplicate', false, 'transactionId', v_transaction_id, 'collectedCoins', v_amount,
    'balanceCoins', v_snapshot -> 'balanceCoins', 'xpTotal', v_snapshot -> 'xpTotal', 'level', v_snapshot -> 'level',
    'unlockedAchievements', v_unlocked, 'currency', 'VC', 'redeemable', false
  );
end;
$$;

-- Buys the generator (level 1) or raises its level. Coins already accrued
-- keep accruing and are paid at the new rate on the next collection.
create or replace function public.upgrade_generator(p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance bigint;
  v_existing public.transactions%rowtype;
  v_level integer;
  v_cost integer;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;

  select w.balance_coins into v_balance from public.wallets w where w.user_id = v_user_id for update;
  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  select t.* into v_existing
  from public.transactions t
  where t.user_id = v_user_id and t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.type <> 'generator_upgrade' then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;
    return jsonb_build_object(
      'success', true, 'duplicate', true, 'transactionId', v_existing.id,
      'generatorLevel', v_existing.source_id::integer, 'costCoins', -v_existing.amount_coins,
      'balanceCoins', v_balance, 'currency', 'VC', 'redeemable', false
    );
  end if;

  select g.level into v_level from public.player_generators g where g.user_id = v_user_id for update;
  v_level := coalesce(v_level, 0);

  if v_level >= (public.generator_policy() ->> 'maxLevel')::integer then
    raise exception 'Generator is at the maximum level' using errcode = 'VE011';
  end if;

  v_cost := ve_private.generator_cost(v_level + 1);
  if v_balance < v_cost then
    raise exception 'Not enough virtual coins' using errcode = 'VE008';
  end if;

  v_transaction_id := ve_private.post_entry(
    v_user_id, -v_cost, 'generator_upgrade', 'generator', (v_level + 1)::text, p_idempotency_key
  );

  insert into public.player_generators as g (user_id, level)
  values (v_user_id, 1)
  on conflict (user_id) do update set level = g.level + 1, updated_at = now();

  perform ve_private.notify(
    v_user_id, 'shop',
    case when v_level = 0 then 'Generator built' else 'Generator upgraded to level ' || (v_level + 1) end,
    'It now makes ' || ((public.generator_policy() ->> 'coinsPerLevelPerHour')::integer * (v_level + 1))
      || ' virtual coins per hour.',
    '/generator'
  );

  return jsonb_build_object(
    'success', true, 'duplicate', false, 'transactionId', v_transaction_id,
    'generatorLevel', v_level + 1, 'costCoins', v_cost, 'balanceCoins', v_balance - v_cost,
    'currency', 'VC', 'redeemable', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled publishing: a published mission is live only inside its window.
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column publish_at timestamptz,
  add column unpublish_at timestamptz,
  add constraint tasks_schedule_order check (publish_at is null or unpublish_at is null or unpublish_at > publish_at);

create or replace function ve_private.task_is_live(p_task public.tasks)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_task.status = 'published'
     and (p_task.publish_at is null or p_task.publish_at <= now())
     and (p_task.unpublish_at is null or p_task.unpublish_at > now());
$$;

revoke all on function ve_private.task_is_live(public.tasks) from public;
grant execute on function ve_private.task_is_live(public.tasks) to authenticated;

create or replace function public.list_missions()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return coalesce((
    select jsonb_agg(m.mission order by m.sort_order, m.title)
    from (
      select t.sort_order, t.title, jsonb_build_object(
        'id', t.id,
        'slug', t.slug,
        'title', t.title,
        'description', t.description,
        'objectiveType', t.objective_type,
        'target', t.objective_target,
        'progress', least(progress.value, t.objective_target),
        'rewardCoins', t.reward_coins,
        'xpReward', t.xp_reward,
        'frequency', t.frequency,
        'periodKey', period.period_key,
        'periodEndsAt', case when t.frequency = 'once' then null
                             else (period.ends_on::timestamp at time zone 'utc') end,
        'claimed', claim.id is not null,
        'claimedAt', claim.completed_at,
        'availableUntil', t.unpublish_at
      ) as mission
      from public.tasks t
      cross join lateral ve_private.task_period(t.frequency, now()) as period
      left join lateral (
        select coalesce(sum(case t.objective_type
                              when 'taps' then d.tap_count
                              when 'missions' then d.missions_completed
                            end), 0)::bigint as value
        from public.daily_activity d
        where d.user_id = v_user_id
          and d.activity_date >= period.starts_on
          and d.activity_date < period.ends_on
      ) as progress on true
      left join public.task_progress claim
        on claim.user_id = v_user_id and claim.task_id = t.id and claim.period_key = period.period_key
      where ve_private.task_is_live(t)
    ) m
  ), '[]'::jsonb);
end;
$$;

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
  where t.id = p_task_id and ve_private.task_is_live(t);

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

create or replace function ve_private.task_json(p_task public.tasks)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_task.id,
    'slug', p_task.slug,
    'title', p_task.title,
    'description', p_task.description,
    'objectiveType', p_task.objective_type,
    'target', p_task.objective_target,
    'rewardCoins', p_task.reward_coins,
    'xpReward', p_task.xp_reward,
    'frequency', p_task.frequency,
    'status', p_task.status,
    'sortOrder', p_task.sort_order,
    'publishAt', p_task.publish_at,
    'unpublishAt', p_task.unpublish_at,
    'live', ve_private.task_is_live(p_task),
    'createdAt', p_task.created_at,
    'updatedAt', p_task.updated_at,
    'claimsTotal', (select count(*) from public.task_progress tp where tp.task_id = p_task.id),
    'claimsLast7Days', (
      select count(*) from public.task_progress tp
      where tp.task_id = p_task.id and tp.completed_at >= now() - interval '7 days'
    )
  );
$$;

-- Sets (or clears, with nulls) a mission's publishing window.
create or replace function public.ve_admin_schedule_task(
  p_task_id uuid,
  p_publish_at timestamptz,
  p_unpublish_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_before public.tasks%rowtype;
  v_task public.tasks%rowtype;
begin
  if p_task_id is null then
    raise exception 'Mission required' using errcode = '22023';
  end if;
  if p_publish_at is not null and p_unpublish_at is not null and p_unpublish_at <= p_publish_at then
    raise exception 'The end must be after the start' using errcode = '22023';
  end if;

  select t.* into v_before from public.tasks t where t.id = p_task_id for update;
  if not found then
    raise exception 'Mission not found' using errcode = 'VE012';
  end if;

  update public.tasks t
  set publish_at = p_publish_at, unpublish_at = p_unpublish_at, updated_at = now()
  where t.id = p_task_id
  returning t.* into v_task;

  perform ve_private.audit(v_admin, 'task.schedule', 'task', p_task_id::text, jsonb_build_object(
    'before', jsonb_build_object('publishAt', v_before.publish_at, 'unpublishAt', v_before.unpublish_at),
    'after', jsonb_build_object('publishAt', v_task.publish_at, 'unpublishAt', v_task.unpublish_at)
  ));

  return ve_private.task_json(v_task);
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics: virtual economy flows and signup cohorts
-- ---------------------------------------------------------------------------
create or replace function public.ve_admin_economy_series(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start date;
begin
  perform ve_private.require_admin();
  if p_days is null or p_days not between 1 and 90 then
    raise exception 'Days must be between 1 and 90' using errcode = '22023';
  end if;
  v_start := timezone('utc', now())::date - (p_days - 1);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'day', day.d,
             'tapCoins', coalesce(sums.tap, 0),
             'missionCoins', coalesce(sums.mission, 0),
             'badgeCoins', coalesce(sums.badge, 0),
             'bonusCoins', coalesce(sums.bonus, 0),
             'idleCoins', coalesce(sums.idle, 0),
             'spentCoins', coalesce(sums.spent, 0),
             'adjustmentCoins', coalesce(sums.adjustment, 0)
           ) order by day.d)
    from (
      select g::date as d
      from generate_series(v_start::timestamp, timezone('utc', now())::date::timestamp, interval '1 day') as g
    ) day
    left join (
      select timezone('utc', t.created_at)::date as d,
             sum(t.amount_coins) filter (where t.type = 'tap_reward') as tap,
             sum(t.amount_coins) filter (where t.type = 'mission_reward') as mission,
             sum(t.amount_coins) filter (where t.type = 'achievement_reward') as badge,
             sum(t.amount_coins) filter (where t.type = 'daily_bonus') as bonus,
             sum(t.amount_coins) filter (where t.type = 'idle_reward') as idle,
             -sum(t.amount_coins) filter (where t.type in ('shop_purchase', 'generator_upgrade')) as spent,
             sum(t.amount_coins) filter (where t.type = 'admin_adjustment') as adjustment
      from public.transactions t
      where t.created_at >= v_start::timestamp at time zone 'utc'
      group by 1
    ) sums on sums.d = day.d
  ), '[]'::jsonb);
end;
$$;

-- Weekly signup cohorts (ISO weeks, UTC): size, and the share active on the
-- day after signup and during days 7-13 after signup.
create or replace function public.ve_admin_retention(p_weeks integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_first_week date;
begin
  perform ve_private.require_admin();
  if p_weeks is null or p_weeks not between 1 and 26 then
    raise exception 'Weeks must be between 1 and 26' using errcode = '22023';
  end if;
  v_first_week := date_trunc('week', timezone('utc', now()))::date - 7 * (p_weeks - 1);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'weekStart', c.week_start,
             'players', c.players,
             'day1Active', c.day1,
             'week2Active', c.week2
           ) order by c.week_start)
    from (
      select date_trunc('week', timezone('utc', p.created_at))::date as week_start,
             count(*) as players,
             count(*) filter (where exists (
               select 1 from public.daily_activity d
               where d.user_id = p.id and d.activity_date = timezone('utc', p.created_at)::date + 1
             )) as day1,
             count(*) filter (where exists (
               select 1 from public.daily_activity d
               where d.user_id = p.id
                 and d.activity_date between timezone('utc', p.created_at)::date + 7
                                         and timezone('utc', p.created_at)::date + 13
             )) as week2
      from public.player_profiles p
      where p.created_at >= v_first_week::timestamp at time zone 'utc'
      group by 1
    ) c
  ), '[]'::jsonb);
end;
$$;

-- Adoption of the engagement features.
create or replace function public.ve_admin_engagement_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := timezone('utc', now())::date;
begin
  perform ve_private.require_admin();
  return jsonb_build_object(
    'bonusClaimsToday', (select count(*) from public.player_progress p where p.last_bonus_on = v_today),
    'activeStreaks', (select count(*) from public.player_progress p
                      where p.current_streak >= 2 and p.last_bonus_on >= v_today - 1),
    'longestStreak', (select coalesce(max(p.longest_streak), 0) from public.player_progress p),
    'itemsOwned', (select count(*) from public.user_inventory),
    'generators', (select count(*) from public.player_generators),
    'averageGeneratorLevel', (select coalesce(round(avg(g.level), 1), 0) from public.player_generators g),
    'leaderboardOptOuts', (select count(*) from public.player_profiles p where p.leaderboard_opt_out),
    'topItems', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'owners', x.owners) order by x.owners desc, x.name)
      from (
        select i.name, count(*) as owners
        from public.user_inventory ui join public.shop_items i on i.id = ui.item_id
        group by i.name
        order by count(*) desc, i.name
        limit 5
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.feature_flags() from public, anon;
revoke all on function public.maintenance_status() from public, anon;
revoke all on function public.get_app_config() from public, anon;
revoke all on function public.ve_admin_update_feature_flags(jsonb) from public, anon;
revoke all on function public.ve_admin_set_maintenance(boolean, text) from public, anon;
revoke all on function public.generator_policy() from public, anon;
revoke all on function public.get_generator_status() from public, anon;
revoke all on function public.collect_generator(uuid) from public, anon;
revoke all on function public.upgrade_generator(uuid) from public, anon;
revoke all on function public.ve_admin_schedule_task(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.ve_admin_economy_series(integer) from public, anon;
revoke all on function public.ve_admin_retention(integer) from public, anon;
revoke all on function public.ve_admin_engagement_summary() from public, anon;

grant execute on function public.feature_flags() to authenticated;
grant execute on function public.maintenance_status() to authenticated;
grant execute on function public.get_app_config() to authenticated;
grant execute on function public.ve_admin_update_feature_flags(jsonb) to authenticated;
grant execute on function public.ve_admin_set_maintenance(boolean, text) to authenticated;
grant execute on function public.generator_policy() to authenticated;
grant execute on function public.get_generator_status() to authenticated;
grant execute on function public.collect_generator(uuid) to authenticated;
grant execute on function public.upgrade_generator(uuid) to authenticated;
grant execute on function public.ve_admin_schedule_task(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.ve_admin_economy_series(integer) to authenticated;
grant execute on function public.ve_admin_retention(integer) to authenticated;
grant execute on function public.ve_admin_engagement_summary() to authenticated;
