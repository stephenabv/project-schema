-- Virtual Earn: VC-to-PHP exchange rates, conversion requests and payout
-- requests.
--
-- IMPORTANT: redemption is OFF by default (public.redemption_policy()). Until
-- an admin switches it on, no conversion can be submitted (the ledger guard in
-- 0011 refuses 'conversion_hold') and no payout can be requested. Nothing in
-- this schema talks to a payment provider: a payout is marked paid only by an
-- admin who records the external payment reference after verifying it.
--
-- Money rules
--   * Virtual coins stay integers. Pesos are stored as integer centavos.
--   * A rate is "rate_coins VC = rate_centavos centavos". A conversion is worth
--     floor(coins * rate_centavos / rate_coins) centavos (rounded down to the
--     centavo), computed here from the rate snapshot stored on the request.
--   * Submitting a conversion moves the coins out of the spendable balance
--     into wallets.reserved_coins with a 'conversion_hold' ledger entry, so
--     they cannot be spent or converted twice. Rejecting or cancelling returns
--     them with a 'conversion_release' entry. Completing consumes the
--     reservation and credits the peso amount to the player's payout balance.
--   * Peso balances move only through php_ledger rows (available, reserved and
--     paid deltas), one row per event and at most one of each kind per request.
--
-- Error contract additions (SQLSTATE -> meaning):
--   VE018  the exchange rate changed since the player saw it
--   VE019  amount outside the configured limits (minimum/maximum)
--   VE020  request is not in a state that allows that action
--   VE021  a large rate change needs explicit confirmation
--   VE022  redemption is not configured (no rate or no payout method)

-- ---------------------------------------------------------------------------
-- Reserved coins
-- ---------------------------------------------------------------------------
alter table public.wallets
  add column reserved_coins bigint not null default 0 check (reserved_coins >= 0);

-- ---------------------------------------------------------------------------
-- Exchange rates (append-only history; the latest effective one applies)
-- ---------------------------------------------------------------------------
create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  rate_coins bigint not null check (rate_coins between 1 and 1000000000),
  rate_centavos bigint not null check (rate_centavos between 1 and 1000000000),
  effective_at timestamptz not null default now(),
  reason text not null check (char_length(reason) between 3 and 280),
  created_by uuid,
  created_at timestamptz not null default now(),
  -- Sanity bound: never more than one peso per virtual coin.
  constraint exchange_rates_sane check (rate_centavos <= rate_coins * 100)
);

create index exchange_rates_effective_idx on public.exchange_rates (effective_at desc, created_at desc);

create trigger exchange_rates_append_only
  before update or delete on public.exchange_rates
  for each row execute function ve_private.prevent_history_change();

create or replace function ve_private.current_rate()
returns public.exchange_rates
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.exchange_rates r
  where r.effective_at <= now()
  order by r.effective_at desc, r.created_at desc
  limit 1;
$$;

create or replace function ve_private.coins_to_centavos(p_coins bigint, p_rate_coins bigint, p_rate_centavos bigint)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$
  select floor(p_coins::numeric * p_rate_centavos / p_rate_coins)::bigint;
$$;

revoke all on function ve_private.current_rate() from public;
revoke all on function ve_private.coins_to_centavos(bigint, bigint, bigint) from public;

-- ---------------------------------------------------------------------------
-- Payout methods (admin-managed)
-- ---------------------------------------------------------------------------
create table public.payout_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,32}$'),
  name text not null check (char_length(name) between 2 and 40),
  account_label text not null check (char_length(account_label) between 2 and 60),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payout_methods (code, name, account_label, sort_order)
values
  ('gcash', 'GCash', 'GCash mobile number', 10),
  ('maya', 'Maya', 'Maya mobile number', 20),
  ('bank_transfer', 'Bank transfer', 'Bank name and account number', 30)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Peso balances and their ledger
-- ---------------------------------------------------------------------------
create table public.php_wallets (
  user_id uuid primary key references public.player_profiles (id) on delete cascade,
  available_centavos bigint not null default 0 check (available_centavos >= 0),
  reserved_centavos bigint not null default 0 check (reserved_centavos >= 0),
  paid_centavos bigint not null default 0 check (paid_centavos >= 0),
  updated_at timestamptz not null default now()
);

create table public.php_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.player_profiles (id) on delete cascade,
  entry_type text not null check (entry_type in (
    'conversion_credit', 'payout_hold', 'payout_release', 'payout_paid', 'payout_refund'
  )),
  available_delta bigint not null default 0,
  reserved_delta bigint not null default 0,
  paid_delta bigint not null default 0,
  reference_type text not null check (reference_type in ('conversion', 'payout')),
  reference_id uuid not null,
  actor_id uuid,
  created_at timestamptz not null default now(),
  constraint php_ledger_nonzero check (available_delta <> 0 or reserved_delta <> 0 or paid_delta <> 0),
  -- Each kind of event happens at most once per request.
  unique (reference_id, entry_type)
);

create index php_ledger_user_idx on public.php_ledger (user_id, created_at desc);

create trigger php_ledger_append_only
  before update or delete on public.php_ledger
  for each row execute function ve_private.prevent_history_change();

create or replace function ve_private.post_php_entry(
  p_user_id uuid,
  p_entry_type text,
  p_available bigint,
  p_reserved bigint,
  p_paid bigint,
  p_reference_type text,
  p_reference_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.php_ledger (user_id, entry_type, available_delta, reserved_delta, paid_delta,
                                 reference_type, reference_id, actor_id)
  values (p_user_id, p_entry_type, p_available, p_reserved, p_paid, p_reference_type, p_reference_id, p_actor_id)
  returning id into v_id;

  insert into public.php_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  update public.php_wallets
  set available_centavos = available_centavos + p_available,
      reserved_centavos = reserved_centavos + p_reserved,
      paid_centavos = paid_centavos + p_paid,
      updated_at = now()
  where user_id = p_user_id;

  return v_id;
end;
$$;

revoke all on function ve_private.post_php_entry(uuid, text, bigint, bigint, bigint, text, uuid, uuid) from public;

create or replace function ve_private.new_reference(p_prefix text)
returns text
language sql
volatile
set search_path = ''
as $$
  select p_prefix || '-' || to_char(timezone('utc', now()), 'YYMMDD') || '-'
         || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

revoke all on function ve_private.new_reference(text) from public;

-- ---------------------------------------------------------------------------
-- Conversion requests
-- ---------------------------------------------------------------------------
create table public.conversion_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^CNV-[0-9]{6}-[0-9A-F]{8}$'),
  user_id uuid not null references public.player_profiles (id) on delete cascade,
  coins bigint not null check (coins > 0),
  rate_id uuid not null references public.exchange_rates (id),
  rate_coins bigint not null check (rate_coins > 0),
  rate_centavos bigint not null check (rate_centavos > 0),
  php_centavos bigint not null check (php_centavos > 0),
  status text not null default 'pending' check (status in (
    'pending', 'under_review', 'approved', 'rejected', 'cancelled', 'completed'
  )),
  idempotency_key uuid not null,
  hold_transaction_id uuid not null,
  release_transaction_id uuid,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) between 3 and 280),
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create index conversion_requests_user_idx on public.conversion_requests (user_id, created_at desc);
create index conversion_requests_status_idx on public.conversion_requests (status, created_at desc);

create table public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  conversion_id uuid not null references public.conversion_requests (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index conversion_events_request_idx on public.conversion_events (conversion_id, created_at);

create trigger conversion_events_append_only
  before update on public.conversion_events
  for each row execute function ve_private.prevent_history_change();

-- ---------------------------------------------------------------------------
-- Payout requests
-- ---------------------------------------------------------------------------
create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^PAY-[0-9]{6}-[0-9A-F]{8}$'),
  user_id uuid not null references public.player_profiles (id) on delete cascade,
  method_id uuid not null references public.payout_methods (id),
  amount_centavos bigint not null check (amount_centavos > 0),
  status text not null default 'pending' check (status in (
    'pending', 'under_review', 'approved', 'processing', 'paid', 'rejected', 'failed', 'refunded', 'cancelled'
  )),
  -- Encrypted by the application server (AES-256-GCM, key outside the
  -- database). Never granted to players; admins read it through
  -- ve_admin_get_payout, which audits every read.
  account_details text not null check (account_details ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
                                       and char_length(account_details) <= 2048),
  account_hint text not null check (char_length(account_hint) between 1 and 40),
  idempotency_key uuid not null,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) between 3 and 280),
  payment_reference text check (payment_reference is null or char_length(payment_reference) between 3 and 100),
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (user_id, idempotency_key)
);

create index payout_requests_user_idx on public.payout_requests (user_id, created_at desc);
create index payout_requests_status_idx on public.payout_requests (status, created_at desc);

create table public.payout_events (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payout_requests (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index payout_events_request_idx on public.payout_events (payout_id, created_at);

create trigger payout_events_append_only
  before update on public.payout_events
  for each row execute function ve_private.prevent_history_change();

-- ---------------------------------------------------------------------------
-- Row level security: players read only their own rows (and never the
-- encrypted payout details); every write goes through the functions below.
-- ---------------------------------------------------------------------------
alter table public.exchange_rates enable row level security;
alter table public.payout_methods enable row level security;
alter table public.php_wallets enable row level security;
alter table public.php_ledger enable row level security;
alter table public.conversion_requests enable row level security;
alter table public.conversion_events enable row level security;
alter table public.payout_requests enable row level security;
alter table public.payout_events enable row level security;

revoke all on public.exchange_rates from anon, authenticated;
revoke all on public.payout_methods from anon, authenticated;
revoke all on public.php_wallets from anon, authenticated;
revoke all on public.php_ledger from anon, authenticated;
revoke all on public.conversion_requests from anon, authenticated;
revoke all on public.conversion_events from anon, authenticated;
revoke all on public.payout_requests from anon, authenticated;
revoke all on public.payout_events from anon, authenticated;

grant select on public.payout_methods to authenticated;
grant select on public.php_wallets to authenticated;
grant select on public.php_ledger to authenticated;
grant select on public.conversion_requests to authenticated;
grant select on public.conversion_events to authenticated;
grant select (id, reference, user_id, method_id, amount_centavos, status, account_hint, review_note, rejection_reason,
              payment_reference, created_at, updated_at, paid_at)
  on public.payout_requests to authenticated;
grant select on public.payout_events to authenticated;

create policy "payout_methods_select_active" on public.payout_methods for select to authenticated using (is_active);
create policy "php_wallets_select_own" on public.php_wallets for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "php_ledger_select_own" on public.php_ledger for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "conversion_requests_select_own" on public.conversion_requests for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "conversion_events_select_own" on public.conversion_events for select to authenticated
  using (exists (select 1 from public.conversion_requests c where c.id = conversion_id and c.user_id = (select auth.uid())));
create policy "payout_requests_select_own" on public.payout_requests for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "payout_events_select_own" on public.payout_events for select to authenticated
  using (exists (select 1 from public.payout_requests p where p.id = payout_id and p.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- JSON shapes
-- ---------------------------------------------------------------------------
create or replace function ve_private.rate_json(p_rate public.exchange_rates)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when p_rate.id is null then null else jsonb_build_object(
    'id', p_rate.id, 'rateCoins', p_rate.rate_coins, 'rateCentavos', p_rate.rate_centavos,
    'effectiveAt', p_rate.effective_at, 'reason', p_rate.reason, 'createdAt', p_rate.created_at,
    'createdBy', (select p.username from public.player_profiles p where p.id = p_rate.created_by)
  ) end;
$$;

create or replace function ve_private.conversion_json(p_row public.conversion_requests, p_admin boolean default false)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_row.id, 'reference', p_row.reference, 'coins', p_row.coins,
    'rateCoins', p_row.rate_coins, 'rateCentavos', p_row.rate_centavos, 'phpCentavos', p_row.php_centavos,
    'status', p_row.status, 'reviewNote', p_row.review_note, 'rejectionReason', p_row.rejection_reason,
    'createdAt', p_row.created_at, 'updatedAt', p_row.updated_at, 'completedAt', p_row.completed_at,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('fromStatus', e.from_status, 'toStatus', e.to_status, 'note', e.note,
                                          'createdAt', e.created_at) order by e.created_at, e.id)
      from public.conversion_events e where e.conversion_id = p_row.id
    ), '[]'::jsonb)
  ) || case when p_admin then jsonb_build_object(
    'userId', p_row.user_id,
    'username', (select p.username from public.player_profiles p where p.id = p_row.user_id),
    'rateId', p_row.rate_id, 'holdTransactionId', p_row.hold_transaction_id,
    'releaseTransactionId', p_row.release_transaction_id,
    'reviewedBy', (select p.username from public.player_profiles p where p.id = p_row.reviewed_by)
  ) else '{}'::jsonb end;
$$;

create or replace function ve_private.payout_json(p_row public.payout_requests, p_admin boolean default false)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_row.id, 'reference', p_row.reference, 'amountCentavos', p_row.amount_centavos,
    'status', p_row.status, 'methodCode', m.code, 'methodName', m.name, 'accountHint', p_row.account_hint,
    'reviewNote', p_row.review_note, 'rejectionReason', p_row.rejection_reason,
    'paymentReference', p_row.payment_reference, 'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at, 'paidAt', p_row.paid_at,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('fromStatus', e.from_status, 'toStatus', e.to_status, 'note', e.note,
                                          'createdAt', e.created_at) order by e.created_at, e.id)
      from public.payout_events e where e.payout_id = p_row.id
    ), '[]'::jsonb)
  ) || case when p_admin then jsonb_build_object(
    'userId', p_row.user_id,
    'username', (select p.username from public.player_profiles p where p.id = p_row.user_id),
    'reviewedBy', (select p.username from public.player_profiles p where p.id = p_row.reviewed_by)
  ) else '{}'::jsonb end
  from public.payout_methods m where m.id = p_row.method_id;
$$;

revoke all on function ve_private.rate_json(public.exchange_rates) from public;
revoke all on function ve_private.conversion_json(public.conversion_requests, boolean) from public;
revoke all on function ve_private.payout_json(public.payout_requests, boolean) from public;

-- ---------------------------------------------------------------------------
-- Player read models
-- ---------------------------------------------------------------------------
create or replace function public.get_redemption_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy jsonb := public.redemption_policy();
  v_rate public.exchange_rates;
  v_wallet public.wallets%rowtype;
  v_php public.php_wallets%rowtype;
  v_min bigint := (v_policy ->> 'minConversionCoins')::bigint;
  v_max bigint := (v_policy ->> 'maxConversionCoins')::bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_rate := ve_private.current_rate();
  select w.* into v_wallet from public.wallets w where w.user_id = v_user_id;
  select p.* into v_php from public.php_wallets p where p.user_id = v_user_id;

  return jsonb_build_object(
    'enabled', coalesce((v_policy ->> 'enabled')::boolean, false),
    'policy', v_policy - 'enabled',
    'rate', ve_private.rate_json(v_rate),
    'coins', jsonb_build_object(
      'availableCoins', coalesce(v_wallet.balance_coins, 0),
      'reservedCoins', coalesce(v_wallet.reserved_coins, 0),
      'eligibleCoins', case when coalesce(v_wallet.balance_coins, 0) >= v_min
                            then least(v_wallet.balance_coins, v_max) else 0 end
    ),
    'php', jsonb_build_object(
      'availableCentavos', coalesce(v_php.available_centavos, 0),
      'reservedCentavos', coalesce(v_php.reserved_centavos, 0),
      'paidCentavos', coalesce(v_php.paid_centavos, 0)
    ),
    'openConversions', (select count(*) from public.conversion_requests c
                        where c.user_id = v_user_id and c.status in ('pending', 'under_review', 'approved')),
    'openPayouts', (select count(*) from public.payout_requests p
                    where p.user_id = v_user_id and p.status in ('pending', 'under_review', 'approved', 'processing')),
    'methods', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'code', m.code, 'name', m.name, 'accountLabel', m.account_label)
                       order by m.sort_order, m.name)
      from public.payout_methods m where m.is_active
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_my_conversions(p_limit integer default 50)
returns jsonb
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
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid limit' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(ve_private.conversion_json(c) order by c.created_at desc)
    from (select * from public.conversion_requests c where c.user_id = v_user_id
          order by c.created_at desc limit p_limit) c
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_my_payouts(p_limit integer default 50)
returns jsonb
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
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid limit' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(ve_private.payout_json(p) order by p.created_at desc)
    from (select * from public.payout_requests p where p.user_id = v_user_id
          order by p.created_at desc limit p_limit) p
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Player actions
-- ---------------------------------------------------------------------------

-- Reserves p_coins at the current rate. p_expected_rate_id is the rate the
-- player reviewed; if the rate changed in between, VE018 asks them to review
-- the new amount instead of silently using it.
create or replace function public.request_conversion(p_coins bigint, p_expected_rate_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy jsonb := public.redemption_policy();
  v_rate public.exchange_rates;
  v_balance bigint;
  v_existing public.conversion_requests%rowtype;
  v_id uuid := gen_random_uuid();
  v_centavos bigint;
  v_transaction_id uuid;
  v_row public.conversion_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_coins is null or p_coins < 1 or p_expected_rate_id is null or p_idempotency_key is null then
    raise exception 'Amount, rate and idempotency key required' using errcode = '22023';
  end if;

  select w.balance_coins into v_balance from public.wallets w where w.user_id = v_user_id for update;
  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  select c.* into v_existing from public.conversion_requests c
  where c.user_id = v_user_id and c.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.coins <> p_coins then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;
    return ve_private.conversion_json(v_existing) || jsonb_build_object('duplicate', true);
  end if;
  if exists (select 1 from public.transactions t where t.user_id = v_user_id and t.idempotency_key = p_idempotency_key) then
    raise exception 'Idempotency key already used' using errcode = 'VE003';
  end if;

  if not coalesce((v_policy ->> 'enabled')::boolean, false) then
    raise exception 'Conversions are turned off' using errcode = 'VE014';
  end if;

  v_rate := ve_private.current_rate();
  if v_rate.id is null then
    raise exception 'No exchange rate is set' using errcode = 'VE022';
  end if;
  if v_rate.id <> p_expected_rate_id then
    raise exception 'The exchange rate changed' using errcode = 'VE018';
  end if;

  if p_coins < (v_policy ->> 'minConversionCoins')::bigint or p_coins > (v_policy ->> 'maxConversionCoins')::bigint then
    raise exception 'Amount outside the conversion limits' using errcode = 'VE019';
  end if;
  if v_balance < p_coins then
    raise exception 'Not enough virtual coins' using errcode = 'VE008';
  end if;

  v_centavos := ve_private.coins_to_centavos(p_coins, v_rate.rate_coins, v_rate.rate_centavos);
  if v_centavos < 1 then
    raise exception 'Amount is worth less than one centavo' using errcode = 'VE019';
  end if;

  v_transaction_id := ve_private.post_entry(
    v_user_id, -p_coins, 'conversion_hold', 'conversion', v_id::text, p_idempotency_key
  );
  update public.wallets w set reserved_coins = w.reserved_coins + p_coins where w.user_id = v_user_id;

  insert into public.conversion_requests (id, reference, user_id, coins, rate_id, rate_coins, rate_centavos,
                                          php_centavos, idempotency_key, hold_transaction_id)
  values (v_id, ve_private.new_reference('CNV'), v_user_id, p_coins, v_rate.id, v_rate.rate_coins,
          v_rate.rate_centavos, v_centavos, p_idempotency_key, v_transaction_id)
  returning * into v_row;

  insert into public.conversion_events (conversion_id, from_status, to_status, actor_id, note)
  values (v_row.id, null, 'pending', v_user_id, 'Submitted; virtual coins reserved');

  return ve_private.conversion_json(v_row) || jsonb_build_object('duplicate', false);
end;
$$;

-- Releases the reserved coins of a conversion (reject or cancel). The caller
-- holds the wallet and request locks.
create or replace function ve_private.release_conversion(p_row public.conversion_requests)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_transaction_id uuid;
begin
  v_transaction_id := ve_private.post_entry(
    p_row.user_id, p_row.coins, 'conversion_release', 'conversion', p_row.id::text, gen_random_uuid()
  );
  update public.wallets w set reserved_coins = w.reserved_coins - p_row.coins where w.user_id = p_row.user_id;
  return v_transaction_id;
end;
$$;

revoke all on function ve_private.release_conversion(public.conversion_requests) from public;

create or replace function public.cancel_conversion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.conversion_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_id is null then
    raise exception 'Request required' using errcode = '22023';
  end if;

  perform 1 from public.wallets w where w.user_id = v_user_id for update;
  select c.* into v_row from public.conversion_requests c where c.id = p_id and c.user_id = v_user_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'VE012';
  end if;

  if v_row.status = 'cancelled' then
    return ve_private.conversion_json(v_row) || jsonb_build_object('duplicate', true);
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Only pending requests can be cancelled' using errcode = 'VE020';
  end if;

  update public.conversion_requests c
  set status = 'cancelled', release_transaction_id = ve_private.release_conversion(v_row), updated_at = now()
  where c.id = p_id returning * into v_row;

  insert into public.conversion_events (conversion_id, from_status, to_status, actor_id, note)
  values (p_id, 'pending', 'cancelled', v_user_id, 'Cancelled by the player; virtual coins returned');

  return ve_private.conversion_json(v_row) || jsonb_build_object('duplicate', false);
end;
$$;

-- Holds p_amount_centavos of the approved peso balance for a payout.
-- p_account_details is ciphertext produced by the application server.
create or replace function public.request_payout(
  p_method_id uuid,
  p_amount_centavos bigint,
  p_account_details text,
  p_account_hint text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy jsonb := public.redemption_policy();
  v_php public.php_wallets%rowtype;
  v_existing public.payout_requests%rowtype;
  v_id uuid := gen_random_uuid();
  v_row public.payout_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_method_id is null or p_amount_centavos is null or p_amount_centavos < 1 or p_idempotency_key is null
     or p_account_details is null or p_account_hint is null then
    raise exception 'Method, amount, account and idempotency key required' using errcode = '22023';
  end if;

  perform 1 from public.wallets w where w.user_id = v_user_id for update;
  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  select p.* into v_existing from public.payout_requests p
  where p.user_id = v_user_id and p.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.amount_centavos <> p_amount_centavos or v_existing.method_id <> p_method_id then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;
    return ve_private.payout_json(v_existing) || jsonb_build_object('duplicate', true);
  end if;

  if not coalesce((v_policy ->> 'enabled')::boolean, false) then
    raise exception 'Payouts are turned off' using errcode = 'VE014';
  end if;
  if (public.maintenance_status() ->> 'enabled')::boolean then
    raise exception 'Maintenance in progress' using errcode = 'VE007';
  end if;
  if exists (select 1 from public.player_profiles p where p.id = v_user_id and p.suspended_at is not null) then
    raise exception 'Account suspended' using errcode = 'VE006';
  end if;
  if not exists (select 1 from public.payout_methods m where m.id = p_method_id and m.is_active) then
    raise exception 'Payout method not available' using errcode = 'VE012';
  end if;
  if p_amount_centavos < (v_policy ->> 'minPayoutCentavos')::bigint
     or p_amount_centavos > (v_policy ->> 'maxPayoutCentavos')::bigint then
    raise exception 'Amount outside the payout limits' using errcode = 'VE019';
  end if;

  insert into public.php_wallets (user_id) values (v_user_id) on conflict (user_id) do nothing;
  select p.* into v_php from public.php_wallets p where p.user_id = v_user_id for update;
  if v_php.available_centavos < p_amount_centavos then
    raise exception 'Not enough approved balance' using errcode = 'VE008';
  end if;

  insert into public.payout_requests (id, reference, user_id, method_id, amount_centavos, account_details,
                                      account_hint, idempotency_key)
  values (v_id, ve_private.new_reference('PAY'), v_user_id, p_method_id, p_amount_centavos, p_account_details,
          left(btrim(p_account_hint), 40), p_idempotency_key)
  returning * into v_row;

  perform ve_private.post_php_entry(v_user_id, 'payout_hold', -p_amount_centavos, p_amount_centavos, 0,
                                    'payout', v_id, v_user_id);

  insert into public.payout_events (payout_id, from_status, to_status, actor_id, note)
  values (v_id, null, 'pending', v_user_id, 'Submitted; amount reserved from the approved balance');

  return ve_private.payout_json(v_row) || jsonb_build_object('duplicate', false);
end;
$$;

create or replace function public.cancel_payout(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.payout_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_id is null then
    raise exception 'Request required' using errcode = '22023';
  end if;

  perform 1 from public.wallets w where w.user_id = v_user_id for update;
  select p.* into v_row from public.payout_requests p where p.id = p_id and p.user_id = v_user_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'VE012';
  end if;
  if v_row.status = 'cancelled' then
    return ve_private.payout_json(v_row) || jsonb_build_object('duplicate', true);
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Only pending requests can be cancelled' using errcode = 'VE020';
  end if;

  perform ve_private.post_php_entry(v_user_id, 'payout_release', v_row.amount_centavos, -v_row.amount_centavos, 0,
                                    'payout', p_id, v_user_id);
  update public.payout_requests p set status = 'cancelled', updated_at = now() where p.id = p_id returning * into v_row;
  insert into public.payout_events (payout_id, from_status, to_status, actor_id, note)
  values (p_id, 'pending', 'cancelled', v_user_id, 'Cancelled by the player; amount returned to the approved balance');

  return ve_private.payout_json(v_row) || jsonb_build_object('duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Earnings breakdown for the dashboard
-- ---------------------------------------------------------------------------
create or replace function public.get_earnings_breakdown()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today_start timestamptz := timezone('utc', now())::date::timestamp at time zone 'utc';
  v_policy jsonb := public.redemption_policy();
  v_wallet public.wallets%rowtype;
  v_php public.php_wallets%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select w.* into v_wallet from public.wallets w where w.user_id = v_user_id;
  select p.* into v_php from public.php_wallets p where p.user_id = v_user_id;

  return (
    select jsonb_build_object(
      'tapCoins', coalesce(sum(t.amount_coins) filter (where t.type = 'tap_reward'), 0),
      'tapCoinsToday', coalesce(sum(t.amount_coins) filter (where t.type = 'tap_reward' and t.created_at >= v_today_start), 0),
      'robotCoins', coalesce(sum(t.amount_coins) filter (where t.type = 'robot_earning'), 0),
      'robotCoinsToday', coalesce(sum(t.amount_coins) filter (where t.type = 'robot_earning' and t.created_at >= v_today_start), 0),
      'otherCoins', coalesce(sum(t.amount_coins) filter (where t.amount_coins > 0 and t.type not in
                       ('tap_reward', 'robot_earning', 'conversion_release')), 0),
      'availableCoins', coalesce(v_wallet.balance_coins, 0),
      'reservedCoins', coalesce(v_wallet.reserved_coins, 0),
      'eligibleCoins', case when coalesce((v_policy ->> 'enabled')::boolean, false)
                              and coalesce(v_wallet.balance_coins, 0) >= (v_policy ->> 'minConversionCoins')::bigint
                            then least(v_wallet.balance_coins, (v_policy ->> 'maxConversionCoins')::bigint) else 0 end,
      'pendingConversions', (select count(*) from public.conversion_requests c
                             where c.user_id = v_user_id and c.status in ('pending', 'under_review', 'approved')),
      'approvedCentavos', coalesce(v_php.available_centavos, 0),
      'pendingPayoutCentavos', coalesce(v_php.reserved_centavos, 0),
      'paidCentavos', coalesce(v_php.paid_centavos, 0),
      'redemptionEnabled', coalesce((v_policy ->> 'enabled')::boolean, false)
    )
    from public.transactions t
    where t.user_id = v_user_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.get_redemption_overview() from public, anon;
revoke all on function public.list_my_conversions(integer) from public, anon;
revoke all on function public.list_my_payouts(integer) from public, anon;
revoke all on function public.request_conversion(bigint, uuid, uuid) from public, anon;
revoke all on function public.cancel_conversion(uuid) from public, anon;
revoke all on function public.request_payout(uuid, bigint, text, text, uuid) from public, anon;
revoke all on function public.cancel_payout(uuid) from public, anon;
revoke all on function public.get_earnings_breakdown() from public, anon;

grant execute on function public.get_redemption_overview() to authenticated;
grant execute on function public.list_my_conversions(integer) to authenticated;
grant execute on function public.list_my_payouts(integer) to authenticated;
grant execute on function public.request_conversion(bigint, uuid, uuid) to authenticated;
grant execute on function public.cancel_conversion(uuid) to authenticated;
grant execute on function public.request_payout(uuid, bigint, text, text, uuid) to authenticated;
grant execute on function public.cancel_payout(uuid) to authenticated;
grant execute on function public.get_earnings_breakdown() to authenticated;
