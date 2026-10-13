-- Virtual Earn: admin console (roles, suspensions, configurable tap policy,
-- task and badge management, balance adjustments, analytics, audit log).
--
-- Every admin entry point is a SECURITY DEFINER function that starts with
-- ve_private.require_admin(), so authorization is enforced in the database
-- even if an application check is bypassed. Every admin write appends an
-- audit_logs row in the same transaction.
--
-- Admin functions are named ve_admin_* because this database is shared with
-- another application that already owns public.admin_* functions.
--
-- Error contract additions (SQLSTATE -> meaning):
--   VE006  account suspended (rewards blocked)
--   VE008  adjustment would make the balance negative
--   VE011  action not allowed for that account or record
--   VE012  record not found

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
alter table public.player_profiles
  add column suspended_at timestamptz,
  add column suspension_reason text check (suspension_reason is null or char_length(suspension_reason) between 3 and 280);

create index player_profiles_suspended_idx on public.player_profiles (suspended_at) where suspended_at is not null;

create table public.app_settings (
  key text primary key check (key ~ '^[a-z_]{3,48}$'),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- actor_id is not a foreign key on purpose: the trail outlives deleted accounts.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)*$' and char_length(action) <= 64),
  target_type text not null check (target_type ~ '^[a-z_]{2,32}$'),
  target_id text check (char_length(target_id) <= 64),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8192),
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc, id desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_id, created_at desc);

-- The audit trail is append-only, even for privileged roles.
create or replace function ve_private.prevent_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function ve_private.prevent_audit_change();

alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;
revoke all on public.app_settings from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;
-- No policies: both tables are reachable only through the functions below.

-- ---------------------------------------------------------------------------
-- Suspended accounts cannot receive rewards (taps, missions, badges).
-- Enforced on the ledger itself so every reward path is covered.
-- ---------------------------------------------------------------------------
create or replace function ve_private.block_suspended_rewards()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type <> 'admin_adjustment' and exists (
    select 1 from public.player_profiles p where p.id = new.user_id and p.suspended_at is not null
  ) then
    raise exception 'Account suspended' using errcode = 'VE006';
  end if;
  return new;
end;
$$;

create trigger transactions_block_suspended
  before insert on public.transactions
  for each row execute function ve_private.block_suspended_rewards();

revoke all on function ve_private.prevent_audit_change() from public;
revoke all on function ve_private.block_suspended_rewards() from public;

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
create or replace function ve_private.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r where r.user_id = p_user_id and r.role = 'admin'
  );
$$;

-- Returns the calling admin's id, or raises 28000 / 42501.
create or replace function ve_private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not ve_private.is_admin(v_user_id) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;
  return v_user_id;
end;
$$;

create or replace function ve_private.audit(
  p_actor_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_actor_id, p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Escapes LIKE wildcards in user-supplied search text.
create or replace function ve_private.like_escape(p_text text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- Validated text from a jsonb field: trimmed, required, within length bounds.
create or replace function ve_private.text_field(p_input jsonb, p_key text, p_min integer, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text;
begin
  if p_input -> p_key is null or jsonb_typeof(p_input -> p_key) <> 'string' then
    raise exception 'Field % is required', p_key using errcode = '22023';
  end if;
  v_value := btrim(p_input ->> p_key);
  if char_length(v_value) not between p_min and p_max then
    raise exception 'Field % has an invalid length', p_key using errcode = '22023';
  end if;
  return v_value;
end;
$$;

-- Validated integer from a jsonb field.
create or replace function ve_private.int_field(p_input jsonb, p_key text, p_min bigint, p_max bigint)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value numeric;
begin
  if p_input -> p_key is null or jsonb_typeof(p_input -> p_key) <> 'number' then
    raise exception 'Field % must be a number', p_key using errcode = '22023';
  end if;
  v_value := (p_input ->> p_key)::numeric;
  if v_value <> trunc(v_value) or v_value < p_min or v_value > p_max then
    raise exception 'Field % is out of range', p_key using errcode = '22023';
  end if;
  return v_value::bigint;
end;
$$;

revoke all on function ve_private.is_admin(uuid) from public;
revoke all on function ve_private.require_admin() from public;
revoke all on function ve_private.audit(uuid, text, text, text, jsonb) from public;
revoke all on function ve_private.like_escape(text) from public;
revoke all on function ve_private.text_field(jsonb, text, integer, integer) from public;
revoke all on function ve_private.int_field(jsonb, text, bigint, bigint) from public;

-- ---------------------------------------------------------------------------
-- Account status for the signed-in player (role and suspension)
-- ---------------------------------------------------------------------------
create or replace function public.get_account_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.player_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.* into v_profile from public.player_profiles p where p.id = v_user_id;

  return jsonb_build_object(
    'isAdmin', ve_private.is_admin(v_user_id),
    'suspended', v_profile.suspended_at is not null,
    'suspendedAt', v_profile.suspended_at,
    'suspensionReason', v_profile.suspension_reason
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Tap policy is now configurable; defaults apply to any key not overridden.
-- ---------------------------------------------------------------------------
create or replace function public.tap_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('rewardCoins', 10, 'cooldownMs', 1000, 'dailyLimit', 1000, 'xpPerTap', 1)
         || coalesce((select s.value from public.app_settings s where s.key = 'tap_policy'), '{}'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------
create or replace function public.ve_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := timezone('utc', now())::date;
  v_today_start timestamptz := timezone('utc', now())::date::timestamp at time zone 'utc';
begin
  perform ve_private.require_admin();

  return jsonb_build_object(
    'totalPlayers', (select count(*) from public.player_profiles),
    'newPlayersToday', (select count(*) from public.player_profiles p where p.created_at >= v_today_start),
    'activeToday', (select count(*) from public.daily_activity d where d.activity_date = v_today and d.tap_count > 0),
    'tapsToday', (select coalesce(sum(d.tap_count), 0) from public.daily_activity d where d.activity_date = v_today),
    'coinsIssuedToday', (
      select coalesce(sum(t.amount_coins), 0) from public.transactions t
      where t.created_at >= v_today_start and t.amount_coins > 0 and t.type <> 'admin_adjustment'
    ),
    'missionsClaimedToday', (select count(*) from public.task_progress tp where tp.completed_at >= v_today_start),
    'duplicateRequestsToday', (
      select coalesce(sum(d.duplicate_requests), 0) from public.daily_activity d where d.activity_date = v_today
    ),
    'coinsInCirculation', (select coalesce(sum(w.balance_coins), 0) from public.wallets w),
    'suspendedPlayers', (select count(*) from public.player_profiles p where p.suspended_at is not null),
    'admins', (select count(*) from public.user_roles r where r.role = 'admin'),
    'publishedMissions', (select count(*) from public.tasks t where t.status = 'published'),
    'currency', 'VC',
    'redeemable', false
  );
end;
$$;

create or replace function public.ve_admin_activity_series(p_days integer default 30)
returns table (
  day date,
  active_players bigint,
  new_players bigint,
  taps bigint,
  coins_issued bigint,
  missions_claimed bigint,
  duplicate_requests bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := timezone('utc', now())::date;
begin
  perform ve_private.require_admin();

  if p_days is null or p_days not between 1 and 90 then
    raise exception 'Unsupported range' using errcode = '22023';
  end if;

  return query
  select s.day::date,
         coalesce(a.active, 0),
         coalesce(n.signups, 0),
         coalesce(a.taps, 0),
         coalesce(a.coins, 0),
         coalesce(a.missions, 0),
         coalesce(a.duplicates, 0)
  from generate_series((v_today - (p_days - 1))::timestamp, v_today::timestamp, interval '1 day') as s (day)
  left join (
    select d.activity_date,
           count(*) filter (where d.tap_count > 0) as active,
           sum(d.tap_count)::bigint as taps,
           sum(d.coins_earned)::bigint as coins,
           sum(d.missions_completed)::bigint as missions,
           sum(d.duplicate_requests)::bigint as duplicates
    from public.daily_activity d
    where d.activity_date >= v_today - (p_days - 1)
    group by d.activity_date
  ) a on a.activity_date = s.day::date
  left join (
    select timezone('utc', p.created_at)::date as signup_day, count(*) as signups
    from public.player_profiles p
    where p.created_at >= (v_today - (p_days - 1))::timestamp at time zone 'utc'
    group by 1
  ) n on n.signup_day = s.day::date
  order by s.day;
end;
$$;

-- Players with replayed requests or days at the daily cap, most suspicious first.
create or replace function public.ve_admin_suspicious_activity(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since date := timezone('utc', now())::date - (p_days - 1);
  v_limit integer := (public.tap_policy() ->> 'dailyLimit')::integer;
begin
  perform ve_private.require_admin();

  if p_days is null or p_days not between 1 and 90 then
    raise exception 'Unsupported range' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(row_data order by (row_data ->> 'duplicateRequests')::bigint desc,
                                       (row_data ->> 'daysAtLimit')::bigint desc)
    from (
      select jsonb_build_object(
        'userId', p.id,
        'username', p.username,
        'duplicateRequests', sum(d.duplicate_requests),
        'daysAtLimit', count(*) filter (where d.tap_count >= v_limit),
        'taps', sum(d.tap_count),
        'lastActiveOn', max(d.activity_date),
        'suspended', p.suspended_at is not null
      ) as row_data
      from public.daily_activity d
      join public.player_profiles p on p.id = d.user_id
      where d.activity_date >= v_since
      group by p.id
      having sum(d.duplicate_requests) > 0 or count(*) filter (where d.tap_count >= v_limit) > 0
      order by sum(d.duplicate_requests) desc, count(*) filter (where d.tap_count >= v_limit) desc
      limit 25
    ) flagged
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create or replace function public.ve_admin_list_users(
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_pattern text;
  v_total bigint;
  v_items jsonb;
begin
  perform ve_private.require_admin();

  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000
     or char_length(coalesce(v_search, '')) > 254 then
    raise exception 'Invalid paging or search' using errcode = '22023';
  end if;

  v_pattern := '%' || ve_private.like_escape(coalesce(v_search, '')) || '%';

  with matched as (
    select p.id, p.username, p.created_at, p.suspended_at, p.suspension_reason, u.email
    from public.player_profiles p
    join auth.users u on u.id = p.id
    where v_search is null
       or p.username ilike v_pattern
       or u.email ilike v_pattern
       or p.id::text = lower(v_search)
  )
  select (select count(*) from matched),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'username', m.username,
           'email', m.email,
           'role', coalesce(r.role, 'user'),
           'balanceCoins', coalesce(w.balance_coins, 0),
           'xpTotal', coalesce(pp.xp_total, 0),
           'level', ve_private.level_for_xp(coalesce(pp.xp_total, 0)),
           'totalTaps', coalesce(pp.total_taps, 0),
           'missionsCompleted', coalesce(pp.missions_completed, 0),
           'suspendedAt', m.suspended_at,
           'suspensionReason', m.suspension_reason,
           'createdAt', m.created_at,
           'lastActiveOn', (select max(d.activity_date) from public.daily_activity d where d.user_id = m.id)
         ) order by m.created_at desc, m.id), '[]'::jsonb)
  into v_total, v_items
  from (select * from matched order by created_at desc, id limit p_limit offset p_offset) m
  left join public.user_roles r on r.user_id = m.id
  left join public.wallets w on w.user_id = m.id
  left join public.player_progress pp on pp.user_id = m.id;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

create or replace function public.ve_admin_set_suspension(p_user_id uuid, p_suspended boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_profile public.player_profiles%rowtype;
begin
  if p_user_id is null or p_suspended is null then
    raise exception 'User and state required' using errcode = '22023';
  end if;
  if p_suspended and (v_reason is null or char_length(v_reason) not between 3 and 280) then
    raise exception 'A reason of 3-280 characters is required' using errcode = '22023';
  end if;
  if p_user_id = v_admin then
    raise exception 'You cannot suspend or restore your own account' using errcode = 'VE011';
  end if;
  if p_suspended and ve_private.is_admin(p_user_id) then
    raise exception 'Remove the admin role before suspending' using errcode = 'VE011';
  end if;

  update public.player_profiles p
  set suspended_at = case when p_suspended then coalesce(p.suspended_at, now()) else null end,
      suspension_reason = case when p_suspended then v_reason else null end
  where p.id = p_user_id
  returning p.* into v_profile;

  if not found then
    raise exception 'User not found' using errcode = 'VE012';
  end if;

  perform ve_private.audit(
    v_admin,
    case when p_suspended then 'user.suspend' else 'user.restore' end,
    'user', p_user_id::text,
    case when p_suspended then jsonb_build_object('reason', v_reason) else '{}'::jsonb end
  );

  return jsonb_build_object(
    'userId', v_profile.id,
    'suspendedAt', v_profile.suspended_at,
    'suspensionReason', v_profile.suspension_reason
  );
end;
$$;

create or replace function public.ve_admin_set_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_previous text;
begin
  if p_user_id is null or p_role is null or p_role not in ('user', 'admin') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  if p_user_id = v_admin and p_role <> 'admin' then
    raise exception 'You cannot remove your own admin role' using errcode = 'VE011';
  end if;

  perform 1 from public.player_profiles p where p.id = p_user_id;
  if not found then
    raise exception 'User not found' using errcode = 'VE012';
  end if;

  if p_role = 'admin' and exists (
    select 1 from public.player_profiles p where p.id = p_user_id and p.suspended_at is not null
  ) then
    raise exception 'Restore the account before granting admin' using errcode = 'VE011';
  end if;

  select r.role into v_previous from public.user_roles r where r.user_id = p_user_id for update;

  insert into public.user_roles (user_id, role) values (p_user_id, p_role)
  on conflict (user_id) do update set role = excluded.role;

  if coalesce(v_previous, 'user') <> p_role then
    perform ve_private.audit(
      v_admin, 'user.role', 'user', p_user_id::text,
      jsonb_build_object('from', coalesce(v_previous, 'user'), 'to', p_role)
    );
  end if;

  return jsonb_build_object('userId', p_user_id, 'role', p_role);
end;
$$;

-- Credits or debits virtual coins with a reason. Idempotent per target user.
create or replace function public.ve_admin_adjust_balance(
  p_user_id uuid,
  p_amount bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_balance bigint;
  v_existing public.transactions%rowtype;
  v_transaction_id uuid;
begin
  if p_user_id is null or p_idempotency_key is null or p_amount is null
     or p_amount = 0 or abs(p_amount) > 1000000
     or char_length(v_reason) not between 3 and 280 then
    raise exception 'Invalid adjustment' using errcode = '22023';
  end if;

  select w.balance_coins into v_balance from public.wallets w where w.user_id = p_user_id for update;
  if not found then
    raise exception 'User not found' using errcode = 'VE012';
  end if;

  select t.* into v_existing
  from public.transactions t
  where t.user_id = p_user_id and t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.type <> 'admin_adjustment' then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;
    return jsonb_build_object(
      'duplicate', true,
      'transactionId', v_existing.id,
      'userId', p_user_id,
      'amountCoins', v_existing.amount_coins,
      'balanceCoins', v_balance,
      'currency', 'VC',
      'redeemable', false
    );
  end if;

  if v_balance + p_amount < 0 then
    raise exception 'Adjustment would make the balance negative' using errcode = 'VE008';
  end if;

  v_transaction_id := ve_private.post_entry(
    p_user_id, p_amount, 'admin_adjustment', 'admin', v_admin::text, p_idempotency_key
  );

  perform ve_private.audit(
    v_admin, 'wallet.adjust', 'user', p_user_id::text,
    jsonb_build_object('amountCoins', p_amount, 'reason', v_reason, 'transactionId', v_transaction_id)
  );

  return jsonb_build_object(
    'duplicate', false,
    'transactionId', v_transaction_id,
    'userId', p_user_id,
    'amountCoins', p_amount,
    'balanceCoins', v_balance + p_amount,
    'currency', 'VC',
    'redeemable', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Missions
-- ---------------------------------------------------------------------------
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
    'createdAt', p_task.created_at,
    'updatedAt', p_task.updated_at,
    'claimsTotal', (select count(*) from public.task_progress tp where tp.task_id = p_task.id),
    'claimsLast7Days', (
      select count(*) from public.task_progress tp
      where tp.task_id = p_task.id and tp.completed_at >= now() - interval '7 days'
    )
  );
$$;

revoke all on function ve_private.task_json(public.tasks) from public;

create or replace function public.ve_admin_list_tasks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ve_private.require_admin();
  return coalesce((
    select jsonb_agg(ve_private.task_json(t) order by
      case t.status when 'published' then 0 when 'draft' then 1 else 2 end, t.sort_order, t.title)
    from public.tasks t
  ), '[]'::jsonb);
end;
$$;

-- Creates (p_task_id null) or updates a mission. Objective and frequency are
-- locked once a mission has claims, so past claims keep their meaning.
create or replace function public.ve_admin_save_task(p_task_id uuid, p_task jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_existing public.tasks%rowtype;
  v_task public.tasks%rowtype;
  v_slug text;
  v_title text;
  v_description text;
  v_objective text;
  v_target bigint;
  v_reward bigint;
  v_xp bigint;
  v_frequency text;
  v_status text;
  v_sort bigint;
begin
  if p_task is null or jsonb_typeof(p_task) <> 'object' then
    raise exception 'Mission details required' using errcode = '22023';
  end if;

  v_slug := lower(ve_private.text_field(p_task, 'slug', 3, 48));
  v_title := ve_private.text_field(p_task, 'title', 3, 80);
  v_description := ve_private.text_field(p_task, 'description', 0, 280);
  v_objective := ve_private.text_field(p_task, 'objectiveType', 1, 16);
  v_target := ve_private.int_field(p_task, 'target', 1, 1000000);
  v_reward := ve_private.int_field(p_task, 'rewardCoins', 1, 1000000);
  v_xp := ve_private.int_field(p_task, 'xpReward', 0, 1000000);
  v_frequency := ve_private.text_field(p_task, 'frequency', 1, 16);
  v_status := ve_private.text_field(p_task, 'status', 1, 16);
  v_sort := ve_private.int_field(p_task, 'sortOrder', -100000, 100000);

  if p_task_id is null then
    insert into public.tasks (slug, title, description, objective_type, objective_target, reward_coins, xp_reward,
                              frequency, status, sort_order)
    values (v_slug, v_title, v_description, v_objective, v_target, v_reward, v_xp, v_frequency, v_status, v_sort)
    returning * into v_task;

    perform ve_private.audit(v_admin, 'task.create', 'task', v_task.id::text,
      jsonb_build_object('slug', v_task.slug, 'status', v_task.status, 'rewardCoins', v_task.reward_coins));
  else
    select t.* into v_existing from public.tasks t where t.id = p_task_id for update;
    if not found then
      raise exception 'Mission not found' using errcode = 'VE012';
    end if;

    if (v_existing.objective_type <> v_objective or v_existing.frequency <> v_frequency)
       and exists (select 1 from public.task_progress tp where tp.task_id = p_task_id) then
      raise exception 'Objective and frequency cannot change after claims exist' using errcode = 'VE011';
    end if;

    update public.tasks t
    set slug = v_slug, title = v_title, description = v_description, objective_type = v_objective,
        objective_target = v_target, reward_coins = v_reward, xp_reward = v_xp, frequency = v_frequency,
        status = v_status, sort_order = v_sort, updated_at = now()
    where t.id = p_task_id
    returning * into v_task;

    perform ve_private.audit(v_admin,
      case when v_existing.status <> v_task.status then 'task.status' else 'task.update' end,
      'task', v_task.id::text,
      jsonb_build_object(
        'slug', v_task.slug,
        'before', jsonb_build_object('status', v_existing.status, 'rewardCoins', v_existing.reward_coins,
                                     'xpReward', v_existing.xp_reward, 'target', v_existing.objective_target),
        'after', jsonb_build_object('status', v_task.status, 'rewardCoins', v_task.reward_coins,
                                    'xpReward', v_task.xp_reward, 'target', v_task.objective_target)
      ));
  end if;

  return ve_private.task_json(v_task);
end;
$$;

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------
create or replace function ve_private.achievement_json(p_achievement public.achievements)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_achievement.id,
    'slug', p_achievement.slug,
    'title', p_achievement.title,
    'description', p_achievement.description,
    'metric', p_achievement.metric,
    'threshold', p_achievement.threshold,
    'rewardCoins', p_achievement.reward_coins,
    'xpReward', p_achievement.xp_reward,
    'icon', p_achievement.icon,
    'sortOrder', p_achievement.sort_order,
    'isActive', p_achievement.is_active,
    'unlockedCount', (select count(*) from public.user_achievements ua where ua.achievement_id = p_achievement.id)
  );
$$;

revoke all on function ve_private.achievement_json(public.achievements) from public;

create or replace function public.ve_admin_list_achievements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ve_private.require_admin();
  return coalesce((
    select jsonb_agg(ve_private.achievement_json(a) order by a.sort_order, a.threshold)
    from public.achievements a
  ), '[]'::jsonb);
end;
$$;

-- Creates (p_id null) or updates a badge. The metric is locked once unlocked.
create or replace function public.ve_admin_save_achievement(p_id uuid, p_achievement jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_existing public.achievements%rowtype;
  v_row public.achievements%rowtype;
  v_slug text;
  v_title text;
  v_description text;
  v_metric text;
  v_threshold bigint;
  v_reward bigint;
  v_xp bigint;
  v_icon text;
  v_sort bigint;
  v_active boolean;
begin
  if p_achievement is null or jsonb_typeof(p_achievement) <> 'object'
     or jsonb_typeof(p_achievement -> 'isActive') is distinct from 'boolean' then
    raise exception 'Badge details required' using errcode = '22023';
  end if;

  v_slug := lower(ve_private.text_field(p_achievement, 'slug', 3, 48));
  v_title := ve_private.text_field(p_achievement, 'title', 3, 80);
  v_description := ve_private.text_field(p_achievement, 'description', 0, 280);
  v_metric := ve_private.text_field(p_achievement, 'metric', 1, 32);
  v_threshold := ve_private.int_field(p_achievement, 'threshold', 1, 1000000000);
  v_reward := ve_private.int_field(p_achievement, 'rewardCoins', 0, 1000000);
  v_xp := ve_private.int_field(p_achievement, 'xpReward', 0, 1000000);
  v_icon := ve_private.text_field(p_achievement, 'icon', 1, 32);
  v_sort := ve_private.int_field(p_achievement, 'sortOrder', -100000, 100000);
  v_active := (p_achievement ->> 'isActive')::boolean;

  if p_id is null then
    insert into public.achievements (slug, title, description, metric, threshold, reward_coins, xp_reward, icon,
                                     sort_order, is_active)
    values (v_slug, v_title, v_description, v_metric, v_threshold, v_reward, v_xp, v_icon, v_sort, v_active)
    returning * into v_row;

    perform ve_private.audit(v_admin, 'achievement.create', 'achievement', v_row.id::text,
      jsonb_build_object('slug', v_row.slug, 'rewardCoins', v_row.reward_coins));
  else
    select a.* into v_existing from public.achievements a where a.id = p_id for update;
    if not found then
      raise exception 'Badge not found' using errcode = 'VE012';
    end if;

    if v_existing.metric <> v_metric
       and exists (select 1 from public.user_achievements ua where ua.achievement_id = p_id) then
      raise exception 'The metric cannot change after players unlocked the badge' using errcode = 'VE011';
    end if;

    update public.achievements a
    set slug = v_slug, title = v_title, description = v_description, metric = v_metric, threshold = v_threshold,
        reward_coins = v_reward, xp_reward = v_xp, icon = v_icon, sort_order = v_sort, is_active = v_active
    where a.id = p_id
    returning * into v_row;

    perform ve_private.audit(v_admin, 'achievement.update', 'achievement', v_row.id::text,
      jsonb_build_object(
        'slug', v_row.slug,
        'before', jsonb_build_object('threshold', v_existing.threshold, 'rewardCoins', v_existing.reward_coins,
                                     'xpReward', v_existing.xp_reward, 'isActive', v_existing.is_active),
        'after', jsonb_build_object('threshold', v_row.threshold, 'rewardCoins', v_row.reward_coins,
                                    'xpReward', v_row.xp_reward, 'isActive', v_row.is_active)
      ));
  end if;

  return ve_private.achievement_json(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
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
    )
  );
end;
$$;

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
        <> array['cooldownMs', 'dailyLimit', 'rewardCoins', 'xpPerTap'] then
    raise exception 'Policy must contain exactly rewardCoins, cooldownMs, dailyLimit and xpPerTap'
      using errcode = '22023';
  end if;

  v_after := jsonb_build_object(
    'rewardCoins', ve_private.int_field(p_policy, 'rewardCoins', 1, 1000),
    'cooldownMs', ve_private.int_field(p_policy, 'cooldownMs', 250, 60000),
    'dailyLimit', ve_private.int_field(p_policy, 'dailyLimit', 1, 100000),
    'xpPerTap', ve_private.int_field(p_policy, 'xpPerTap', 0, 100)
  );

  insert into public.app_settings (key, value, updated_by, updated_at)
  values ('tap_policy', v_after, v_admin, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  perform ve_private.audit(v_admin, 'settings.tap_policy', 'setting', 'tap_policy',
    jsonb_build_object('before', v_before, 'after', v_after));

  return public.tap_policy();
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log (keyset pagination, newest first)
-- ---------------------------------------------------------------------------
create or replace function public.ve_admin_list_audit_logs(
  p_action text default null,
  p_target_id text default null,
  p_actor_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_action text := nullif(btrim(coalesce(p_action, '')), '');
  v_target text := nullif(btrim(coalesce(p_target_id, '')), '');
  v_rows jsonb;
begin
  perform ve_private.require_admin();

  if p_limit is null or p_limit not between 1 and 200
     or char_length(coalesce(v_action, '')) > 64 or char_length(coalesce(v_target, '')) > 64
     or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception 'Invalid filter or cursor' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id,
           'actorId', l.actor_id,
           'actorUsername', p.username,
           'action', l.action,
           'targetType', l.target_type,
           'targetId', l.target_id,
           'metadata', l.metadata,
           'createdAt', l.created_at
         ) order by l.created_at desc, l.id desc), '[]'::jsonb)
  into v_rows
  from (
    select a.*
    from public.audit_logs a
    where (v_action is null or a.action like ve_private.like_escape(v_action) || '%')
      and (v_target is null or a.target_id = v_target)
      and (p_actor_id is null or a.actor_id = p_actor_id)
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at < p_to)
      and (p_before_created_at is null or (a.created_at, a.id) < (p_before_created_at, p_before_id))
    order by a.created_at desc, a.id desc
    limit p_limit + 1
  ) l
  left join public.player_profiles p on p.id = l.actor_id;

  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
              from jsonb_array_elements(v_rows) with ordinality as x(e, ord) where ord <= p_limit),
    'hasMore', jsonb_array_length(v_rows) > p_limit
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: callable by signed-in users; each function checks the role.
-- ---------------------------------------------------------------------------
revoke all on function public.get_account_status() from public, anon;
revoke all on function public.ve_admin_overview() from public, anon;
revoke all on function public.ve_admin_activity_series(integer) from public, anon;
revoke all on function public.ve_admin_suspicious_activity(integer) from public, anon;
revoke all on function public.ve_admin_list_users(text, integer, integer) from public, anon;
revoke all on function public.ve_admin_set_suspension(uuid, boolean, text) from public, anon;
revoke all on function public.ve_admin_set_role(uuid, text) from public, anon;
revoke all on function public.ve_admin_adjust_balance(uuid, bigint, text, uuid) from public, anon;
revoke all on function public.ve_admin_list_tasks() from public, anon;
revoke all on function public.ve_admin_save_task(uuid, jsonb) from public, anon;
revoke all on function public.ve_admin_list_achievements() from public, anon;
revoke all on function public.ve_admin_save_achievement(uuid, jsonb) from public, anon;
revoke all on function public.ve_admin_get_settings() from public, anon;
revoke all on function public.ve_admin_update_tap_policy(jsonb) from public, anon;
revoke all on function public.ve_admin_list_audit_logs(text, text, uuid, timestamptz, timestamptz, timestamptz, uuid, integer)
  from public, anon;

grant execute on function public.get_account_status() to authenticated;
grant execute on function public.ve_admin_overview() to authenticated;
grant execute on function public.ve_admin_activity_series(integer) to authenticated;
grant execute on function public.ve_admin_suspicious_activity(integer) to authenticated;
grant execute on function public.ve_admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.ve_admin_set_suspension(uuid, boolean, text) to authenticated;
grant execute on function public.ve_admin_set_role(uuid, text) to authenticated;
grant execute on function public.ve_admin_adjust_balance(uuid, bigint, text, uuid) to authenticated;
grant execute on function public.ve_admin_list_tasks() to authenticated;
grant execute on function public.ve_admin_save_task(uuid, jsonb) to authenticated;
grant execute on function public.ve_admin_list_achievements() to authenticated;
grant execute on function public.ve_admin_save_achievement(uuid, jsonb) to authenticated;
grant execute on function public.ve_admin_get_settings() to authenticated;
grant execute on function public.ve_admin_update_tap_policy(jsonb) to authenticated;
grant execute on function public.ve_admin_list_audit_logs(text, text, uuid, timestamptz, timestamptz, timestamptz, uuid, integer)
  to authenticated;
