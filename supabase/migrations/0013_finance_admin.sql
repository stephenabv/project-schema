-- Virtual Earn: admin console for exchange rates, the redemption switch,
-- payout methods, conversion and payout review, and ledger integrity checks.
--
-- Every function starts with ve_private.require_admin() and every change is
-- written to audit_logs in the same transaction. Admins cannot review their
-- own requests. Status changes are idempotent: repeating a transition that
-- already happened returns the request unchanged.

-- ---------------------------------------------------------------------------
-- Exchange rates and redemption policy
-- ---------------------------------------------------------------------------
create or replace function public.ve_admin_get_redemption()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ve_private.require_admin();
  return jsonb_build_object(
    'policy', public.redemption_policy(),
    'policyUpdatedAt', (select s.updated_at from public.app_settings s where s.key = 'redemption_policy'),
    'policyUpdatedBy', (select p.username from public.app_settings s join public.player_profiles p on p.id = s.updated_by
                        where s.key = 'redemption_policy'),
    'currentRate', ve_private.rate_json(ve_private.current_rate()),
    'rates', coalesce((
      select jsonb_agg(ve_private.rate_json(r) order by r.effective_at desc, r.created_at desc)
      from (select * from public.exchange_rates order by effective_at desc, created_at desc limit 50) r
    ), '[]'::jsonb),
    'methods', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'code', m.code, 'name', m.name, 'accountLabel', m.account_label,
                                          'isActive', m.is_active, 'sortOrder', m.sort_order) order by m.sort_order, m.name)
      from public.payout_methods m
    ), '[]'::jsonb)
  );
end;
$$;

-- Adds a rate (history is never edited). A change of more than 25% against the
-- current rate must be confirmed explicitly (VE021).
create or replace function public.ve_admin_set_exchange_rate(
  p_rate_coins bigint,
  p_rate_centavos bigint,
  p_effective_at timestamptz,
  p_reason text,
  p_confirm_large_change boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_effective timestamptz := coalesce(p_effective_at, now());
  v_current public.exchange_rates;
  v_row public.exchange_rates%rowtype;
  v_old numeric;
  v_new numeric;
begin
  if p_rate_coins is null or p_rate_coins not between 1 and 1000000000
     or p_rate_centavos is null or p_rate_centavos not between 1 and 1000000000
     or p_rate_centavos > p_rate_coins * 100
     or char_length(v_reason) not between 3 and 280
     or v_effective < now() - interval '5 minutes' or v_effective > now() + interval '90 days' then
    raise exception 'Invalid exchange rate' using errcode = '22023';
  end if;

  v_current := ve_private.current_rate();
  if v_current.id is not null then
    v_old := v_current.rate_centavos::numeric / v_current.rate_coins;
    v_new := p_rate_centavos::numeric / p_rate_coins;
    if abs(v_new - v_old) / v_old > 0.25 and not coalesce(p_confirm_large_change, false) then
      raise exception 'Changes over 25%% need confirmation' using errcode = 'VE021';
    end if;
  end if;

  insert into public.exchange_rates (rate_coins, rate_centavos, effective_at, reason, created_by)
  values (p_rate_coins, p_rate_centavos, v_effective, v_reason, v_admin)
  returning * into v_row;

  perform ve_private.audit(v_admin, 'exchange.rate', 'exchange_rate', v_row.id::text, jsonb_build_object(
    'before', case when v_current.id is null then null
                   else jsonb_build_object('rateCoins', v_current.rate_coins, 'rateCentavos', v_current.rate_centavos) end,
    'after', jsonb_build_object('rateCoins', v_row.rate_coins, 'rateCentavos', v_row.rate_centavos),
    'effectiveAt', v_row.effective_at, 'reason', v_reason
  ));

  return ve_private.rate_json(v_row);
end;
$$;

-- Turning redemption on needs a current rate and an active payout method.
create or replace function public.ve_admin_update_redemption_policy(p_policy jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_before jsonb := public.redemption_policy();
  v_after jsonb;
begin
  if p_policy is null or jsonb_typeof(p_policy) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_policy) as k)
        <> array['enabled', 'maxConversionCoins', 'maxPayoutCentavos', 'minConversionCoins', 'minPayoutCentavos',
                 'processingDays']
     or jsonb_typeof(p_policy -> 'enabled') <> 'boolean'
     or char_length(v_reason) not between 3 and 280 then
    raise exception 'Policy must contain exactly enabled, min/max conversion coins, min/max payout centavos and processingDays, with a reason'
      using errcode = '22023';
  end if;

  v_after := jsonb_build_object(
    'enabled', (p_policy ->> 'enabled')::boolean,
    'minConversionCoins', ve_private.int_field(p_policy, 'minConversionCoins', 1, 1000000000),
    'maxConversionCoins', ve_private.int_field(p_policy, 'maxConversionCoins', 1, 1000000000),
    'minPayoutCentavos', ve_private.int_field(p_policy, 'minPayoutCentavos', 100, 100000000),
    'maxPayoutCentavos', ve_private.int_field(p_policy, 'maxPayoutCentavos', 100, 100000000),
    'processingDays', ve_private.int_field(p_policy, 'processingDays', 1, 60)
  );
  if (v_after ->> 'minConversionCoins')::bigint > (v_after ->> 'maxConversionCoins')::bigint
     or (v_after ->> 'minPayoutCentavos')::bigint > (v_after ->> 'maxPayoutCentavos')::bigint then
    raise exception 'Minimums cannot exceed maximums' using errcode = '22023';
  end if;
  if (v_after ->> 'enabled')::boolean and (
       ve_private.current_rate() is null or (ve_private.current_rate()).id is null
       or not exists (select 1 from public.payout_methods m where m.is_active)) then
    raise exception 'Set an exchange rate and activate a payout method first' using errcode = 'VE022';
  end if;

  insert into public.app_settings (key, value, updated_by, updated_at)
  values ('redemption_policy', v_after, v_admin, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  perform ve_private.audit(v_admin,
    case when (v_before ->> 'enabled')::boolean <> (v_after ->> 'enabled')::boolean
         then case when (v_after ->> 'enabled')::boolean then 'redemption.enable' else 'redemption.disable' end
         else 'redemption.policy' end,
    'setting', 'redemption_policy',
    jsonb_build_object('before', v_before, 'after', v_after, 'reason', v_reason));

  return public.redemption_policy();
end;
$$;

create or replace function public.ve_admin_save_payout_method(p_id uuid, p_method jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_before public.payout_methods%rowtype;
  v_row public.payout_methods%rowtype;
  v_code text;
  v_name text;
  v_label text;
  v_sort bigint;
  v_active boolean;
begin
  if p_method is null or jsonb_typeof(p_method) <> 'object'
     or jsonb_typeof(p_method -> 'isActive') is distinct from 'boolean' then
    raise exception 'Payout method details required' using errcode = '22023';
  end if;
  v_code := lower(ve_private.text_field(p_method, 'code', 2, 32));
  v_name := ve_private.text_field(p_method, 'name', 2, 40);
  v_label := ve_private.text_field(p_method, 'accountLabel', 2, 60);
  v_sort := ve_private.int_field(p_method, 'sortOrder', -100000, 100000);
  v_active := (p_method ->> 'isActive')::boolean;

  if p_id is null then
    insert into public.payout_methods (code, name, account_label, is_active, sort_order)
    values (v_code, v_name, v_label, v_active, v_sort) returning * into v_row;
  else
    select m.* into v_before from public.payout_methods m where m.id = p_id for update;
    if not found then
      raise exception 'Payout method not found' using errcode = 'VE012';
    end if;
    update public.payout_methods m
    set code = v_code, name = v_name, account_label = v_label, is_active = v_active, sort_order = v_sort, updated_at = now()
    where m.id = p_id returning * into v_row;
  end if;

  perform ve_private.audit(v_admin, case when p_id is null then 'payout_method.create' else 'payout_method.update' end,
    'payout_method', v_row.id::text,
    jsonb_build_object('code', v_row.code, 'isActive', v_row.is_active,
                       'wasActive', case when p_id is null then null else v_before.is_active end));

  return jsonb_build_object('id', v_row.id, 'code', v_row.code, 'name', v_row.name, 'accountLabel', v_row.account_label,
                            'isActive', v_row.is_active, 'sortOrder', v_row.sort_order);
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversion review
-- ---------------------------------------------------------------------------
create or replace function public.ve_admin_list_conversions(
  p_status text default null,
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
  if p_limit is null or p_limit not between 1 and 5000 or p_offset is null or p_offset not between 0 and 1000000
     or char_length(coalesce(v_search, '')) > 64
     or (p_status is not null and p_status not in ('pending', 'under_review', 'approved', 'rejected', 'cancelled', 'completed', 'open')) then
    raise exception 'Invalid filter' using errcode = '22023';
  end if;
  v_pattern := '%' || ve_private.like_escape(coalesce(v_search, '')) || '%';

  with matched as (
    select c.* from public.conversion_requests c
    join public.player_profiles p on p.id = c.user_id
    where (p_status is null or c.status = p_status
           or (p_status = 'open' and c.status in ('pending', 'under_review', 'approved')))
      and (v_search is null or c.reference ilike v_pattern or p.username ilike v_pattern)
  )
  select (select count(*) from matched),
         coalesce(jsonb_agg(ve_private.conversion_json(m, true) order by m.created_at desc, m.id), '[]'::jsonb)
  into v_total, v_items
  from (select * from matched order by created_at desc, id limit p_limit offset p_offset) m;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

create or replace function public.ve_admin_transition_conversion(
  p_id uuid,
  p_to text,
  p_note text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_user_id uuid;
  v_row public.conversion_requests%rowtype;
  v_from text;
begin
  if p_id is null or p_to is null or p_to not in ('under_review', 'approved', 'rejected', 'completed')
     or char_length(coalesce(v_note, '')) > 500
     or (p_to = 'rejected' and (v_reason is null or char_length(v_reason) not between 3 and 280)) then
    raise exception 'Invalid transition' using errcode = '22023';
  end if;

  select c.user_id into v_user_id from public.conversion_requests c where c.id = p_id;
  if not found then
    raise exception 'Request not found' using errcode = 'VE012';
  end if;
  if v_user_id = v_admin then
    raise exception 'You cannot review your own request' using errcode = 'VE011';
  end if;

  -- Same lock order as the player functions: wallet, then request.
  perform 1 from public.wallets w where w.user_id = v_user_id for update;
  select c.* into v_row from public.conversion_requests c where c.id = p_id for update;
  v_from := v_row.status;

  if v_from = p_to then
    return ve_private.conversion_json(v_row, true) || jsonb_build_object('duplicate', true);
  end if;
  if not (
       (v_from = 'pending' and p_to in ('under_review', 'approved', 'rejected'))
    or (v_from = 'under_review' and p_to in ('approved', 'rejected'))
    or (v_from = 'approved' and p_to in ('completed', 'rejected'))
  ) then
    raise exception 'Cannot move a % request to %', v_from, p_to using errcode = 'VE020';
  end if;

  if p_to = 'rejected' then
    update public.conversion_requests c
    set status = 'rejected', rejection_reason = v_reason, review_note = coalesce(v_note, c.review_note),
        reviewed_by = v_admin, release_transaction_id = ve_private.release_conversion(v_row), updated_at = now()
    where c.id = p_id returning * into v_row;
    perform ve_private.notify(v_user_id, 'wallet', 'Conversion ' || v_row.reference || ' was rejected',
      v_reason || ' Your virtual coins were returned.', '/exchange');
  elsif p_to = 'completed' then
    -- Settlement: the reserved coins are consumed and the peso amount becomes
    -- part of the player's approved payout balance.
    update public.wallets w set reserved_coins = w.reserved_coins - v_row.coins where w.user_id = v_user_id;
    perform ve_private.post_php_entry(v_user_id, 'conversion_credit', v_row.php_centavos, 0, 0, 'conversion', p_id, v_admin);
    update public.conversion_requests c
    set status = 'completed', review_note = coalesce(v_note, c.review_note), reviewed_by = v_admin,
        completed_at = now(), updated_at = now()
    where c.id = p_id returning * into v_row;
    perform ve_private.notify(v_user_id, 'wallet', 'Conversion ' || v_row.reference || ' is complete',
      'The peso amount was added to your approved balance. It is not paid until a payout is marked paid.', '/payouts');
  else
    update public.conversion_requests c
    set status = p_to, review_note = coalesce(v_note, c.review_note), reviewed_by = v_admin, updated_at = now()
    where c.id = p_id returning * into v_row;
    if p_to = 'approved' then
      perform ve_private.notify(v_user_id, 'wallet', 'Conversion ' || v_row.reference || ' was approved',
        'It will be settled to your approved balance shortly.', '/exchange');
    end if;
  end if;

  insert into public.conversion_events (conversion_id, from_status, to_status, actor_id, note)
  values (p_id, v_from, p_to, v_admin, coalesce(v_reason, v_note));

  perform ve_private.audit(v_admin, 'conversion.' || p_to, 'conversion', p_id::text, jsonb_build_object(
    'reference', v_row.reference, 'from', v_from, 'coins', v_row.coins, 'phpCentavos', v_row.php_centavos,
    'reason', v_reason, 'note', v_note));

  return ve_private.conversion_json(v_row, true) || jsonb_build_object('duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Payout review
-- ---------------------------------------------------------------------------
create or replace function public.ve_admin_list_payouts(
  p_status text default null,
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
  if p_limit is null or p_limit not between 1 and 5000 or p_offset is null or p_offset not between 0 and 1000000
     or char_length(coalesce(v_search, '')) > 64
     or (p_status is not null and p_status not in ('pending', 'under_review', 'approved', 'processing', 'paid', 'rejected',
                                                    'failed', 'refunded', 'cancelled', 'open')) then
    raise exception 'Invalid filter' using errcode = '22023';
  end if;
  v_pattern := '%' || ve_private.like_escape(coalesce(v_search, '')) || '%';

  with matched as (
    select r.* from public.payout_requests r
    join public.player_profiles p on p.id = r.user_id
    where (p_status is null or r.status = p_status
           or (p_status = 'open' and r.status in ('pending', 'under_review', 'approved', 'processing')))
      and (v_search is null or r.reference ilike v_pattern or p.username ilike v_pattern
           or r.payment_reference ilike v_pattern)
  )
  select (select count(*) from matched),
         coalesce(jsonb_agg(ve_private.payout_json(m, true) order by m.created_at desc, m.id), '[]'::jsonb)
  into v_total, v_items
  from (select * from matched order by created_at desc, id limit p_limit offset p_offset) m;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

-- One payout with its encrypted account details. Every read is audited.
create or replace function public.ve_admin_get_payout(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_row public.payout_requests%rowtype;
begin
  select r.* into v_row from public.payout_requests r where r.id = p_id;
  if not found then
    raise exception 'Request not found' using errcode = 'VE012';
  end if;
  perform ve_private.audit(v_admin, 'payout.view_details', 'payout', p_id::text,
    jsonb_build_object('reference', v_row.reference));
  return ve_private.payout_json(v_row, true) || jsonb_build_object('accountDetails', v_row.account_details);
end;
$$;

-- "paid" needs the external payment reference the admin verified; nothing
-- here contacts a payment provider. "refunded" reverses a paid payout whose
-- money came back, returning the amount to the player's approved balance.
create or replace function public.ve_admin_transition_payout(
  p_id uuid,
  p_to text,
  p_note text default null,
  p_reason text default null,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := ve_private.require_admin();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_payment_ref text := nullif(btrim(coalesce(p_payment_reference, '')), '');
  v_user_id uuid;
  v_row public.payout_requests%rowtype;
  v_from text;
  v_amount bigint;
begin
  if p_id is null or p_to is null
     or p_to not in ('under_review', 'approved', 'processing', 'paid', 'rejected', 'failed', 'refunded')
     or char_length(coalesce(v_note, '')) > 500
     or (p_to in ('rejected', 'failed', 'refunded') and (v_reason is null or char_length(v_reason) not between 3 and 280))
     or (p_to = 'paid' and (v_payment_ref is null or char_length(v_payment_ref) not between 3 and 100)) then
    raise exception 'Invalid transition' using errcode = '22023';
  end if;

  select r.user_id into v_user_id from public.payout_requests r where r.id = p_id;
  if not found then
    raise exception 'Request not found' using errcode = 'VE012';
  end if;
  if v_user_id = v_admin then
    raise exception 'You cannot review your own request' using errcode = 'VE011';
  end if;

  perform 1 from public.wallets w where w.user_id = v_user_id for update;
  select r.* into v_row from public.payout_requests r where r.id = p_id for update;
  v_from := v_row.status;
  v_amount := v_row.amount_centavos;

  if v_from = p_to then
    return ve_private.payout_json(v_row, true) || jsonb_build_object('duplicate', true);
  end if;
  if not (
       (v_from = 'pending' and p_to in ('under_review', 'approved', 'rejected'))
    or (v_from = 'under_review' and p_to in ('approved', 'rejected'))
    or (v_from = 'approved' and p_to in ('processing', 'rejected'))
    or (v_from = 'processing' and p_to in ('paid', 'failed'))
    or (v_from = 'paid' and p_to = 'refunded')
  ) then
    raise exception 'Cannot move a % payout to %', v_from, p_to using errcode = 'VE020';
  end if;

  if p_to in ('rejected', 'failed') then
    perform ve_private.post_php_entry(v_user_id, 'payout_release', v_amount, -v_amount, 0, 'payout', p_id, v_admin);
  elsif p_to = 'paid' then
    perform ve_private.post_php_entry(v_user_id, 'payout_paid', 0, -v_amount, v_amount, 'payout', p_id, v_admin);
  elsif p_to = 'refunded' then
    perform ve_private.post_php_entry(v_user_id, 'payout_refund', v_amount, 0, -v_amount, 'payout', p_id, v_admin);
  end if;

  update public.payout_requests r
  set status = p_to,
      review_note = coalesce(v_note, r.review_note),
      rejection_reason = case when p_to in ('rejected', 'failed', 'refunded') then v_reason else r.rejection_reason end,
      payment_reference = coalesce(v_payment_ref, r.payment_reference),
      paid_at = case when p_to = 'paid' then now() else r.paid_at end,
      reviewed_by = v_admin,
      updated_at = now()
  where r.id = p_id returning * into v_row;

  insert into public.payout_events (payout_id, from_status, to_status, actor_id, note)
  values (p_id, v_from, p_to, v_admin, coalesce(v_reason, v_note,
          case when p_to = 'paid' then 'Payment reference ' || v_payment_ref end));

  perform ve_private.notify(v_user_id, 'wallet',
    'Payout ' || v_row.reference || ' is ' || replace(p_to, '_', ' '),
    case p_to
      when 'paid' then 'The payment was sent and verified by an admin.'
      when 'rejected' then v_reason || ' The amount was returned to your approved balance.'
      when 'failed' then v_reason || ' The amount was returned to your approved balance.'
      when 'refunded' then v_reason || ' The amount was returned to your approved balance.'
      else 'We will let you know when it changes again.'
    end,
    '/payouts');

  perform ve_private.audit(v_admin, 'payout.' || p_to, 'payout', p_id::text, jsonb_build_object(
    'reference', v_row.reference, 'from', v_from, 'amountCentavos', v_amount, 'reason', v_reason, 'note', v_note,
    'paymentReference', v_payment_ref));

  return ve_private.payout_json(v_row, true) || jsonb_build_object('duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Finance overview and ledger integrity
-- ---------------------------------------------------------------------------
create or replace function public.ve_admin_finance_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ve_private.require_admin();
  return jsonb_build_object(
    'redemptionEnabled', coalesce((public.redemption_policy() ->> 'enabled')::boolean, false),
    'currentRate', ve_private.rate_json(ve_private.current_rate()),
    'conversions', coalesce((
      select jsonb_object_agg(s.status, jsonb_build_object('count', s.n, 'coins', s.coins, 'phpCentavos', s.php))
      from (select c.status, count(*) as n, sum(c.coins) as coins, sum(c.php_centavos) as php
            from public.conversion_requests c group by c.status) s
    ), '{}'::jsonb),
    'payouts', coalesce((
      select jsonb_object_agg(s.status, jsonb_build_object('count', s.n, 'amountCentavos', s.amount))
      from (select r.status, count(*) as n, sum(r.amount_centavos) as amount
            from public.payout_requests r group by r.status) s
    ), '{}'::jsonb),
    'reservedCoins', (select coalesce(sum(w.reserved_coins), 0) from public.wallets w),
    'availableCentavos', (select coalesce(sum(p.available_centavos), 0) from public.php_wallets p),
    'reservedCentavos', (select coalesce(sum(p.reserved_centavos), 0) from public.php_wallets p),
    'paidCentavos', (select coalesce(sum(p.paid_centavos), 0) from public.php_wallets p),
    'robotCoinsToday', (select coalesce(sum(t.amount_coins), 0) from public.transactions t
                        where t.type = 'robot_earning'
                          and t.created_at >= timezone('utc', now())::date::timestamp at time zone 'utc'),
    'tapCoinsToday', (select coalesce(sum(t.amount_coins), 0) from public.transactions t
                      where t.type = 'tap_reward'
                        and t.created_at >= timezone('utc', now())::date::timestamp at time zone 'utc')
  );
end;
$$;

-- Accounts whose stored balances disagree with their ledgers or open requests.
-- Any row here is a bug or a manual database edit and needs investigation.
create or replace function public.ve_admin_ledger_check()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ve_private.require_admin();
  return coalesce((
    select jsonb_agg(x.row_data order by x.username)
    from (
      select p.username, jsonb_build_object(
        'userId', p.id, 'username', p.username,
        'balanceCoins', w.balance_coins, 'ledgerCoins', coalesce(t.total, 0),
        'reservedCoins', w.reserved_coins, 'openConversionCoins', coalesce(c.held, 0),
        'availableCentavos', coalesce(pw.available_centavos, 0), 'ledgerAvailableCentavos', coalesce(pl.available, 0),
        'reservedCentavos', coalesce(pw.reserved_centavos, 0), 'ledgerReservedCentavos', coalesce(pl.reserved, 0),
        'openPayoutCentavos', coalesce(po.held, 0),
        'paidCentavos', coalesce(pw.paid_centavos, 0), 'ledgerPaidCentavos', coalesce(pl.paid, 0)
      ) as row_data
      from public.player_profiles p
      join public.wallets w on w.user_id = p.id
      left join (select user_id, sum(amount_coins) as total from public.transactions group by user_id) t on t.user_id = p.id
      left join (select user_id, sum(coins) as held from public.conversion_requests
                 where status in ('pending', 'under_review', 'approved') group by user_id) c on c.user_id = p.id
      left join public.php_wallets pw on pw.user_id = p.id
      left join (select user_id, sum(available_delta) as available, sum(reserved_delta) as reserved, sum(paid_delta) as paid
                 from public.php_ledger group by user_id) pl on pl.user_id = p.id
      left join (select user_id, sum(amount_centavos) as held from public.payout_requests
                 where status in ('pending', 'under_review', 'approved', 'processing') group by user_id) po on po.user_id = p.id
      where w.balance_coins <> coalesce(t.total, 0)
         or w.reserved_coins <> coalesce(c.held, 0)
         or coalesce(pw.available_centavos, 0) <> coalesce(pl.available, 0)
         or coalesce(pw.reserved_centavos, 0) <> coalesce(pl.reserved, 0)
         or coalesce(pw.reserved_centavos, 0) <> coalesce(po.held, 0)
         or coalesce(pw.paid_centavos, 0) <> coalesce(pl.paid, 0)
      limit 100
    ) x
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.ve_admin_get_redemption() from public, anon;
revoke all on function public.ve_admin_set_exchange_rate(bigint, bigint, timestamptz, text, boolean) from public, anon;
revoke all on function public.ve_admin_update_redemption_policy(jsonb, text) from public, anon;
revoke all on function public.ve_admin_save_payout_method(uuid, jsonb) from public, anon;
revoke all on function public.ve_admin_list_conversions(text, text, integer, integer) from public, anon;
revoke all on function public.ve_admin_transition_conversion(uuid, text, text, text) from public, anon;
revoke all on function public.ve_admin_list_payouts(text, text, integer, integer) from public, anon;
revoke all on function public.ve_admin_get_payout(uuid) from public, anon;
revoke all on function public.ve_admin_transition_payout(uuid, text, text, text, text) from public, anon;
revoke all on function public.ve_admin_finance_overview() from public, anon;
revoke all on function public.ve_admin_ledger_check() from public, anon;

grant execute on function public.ve_admin_get_redemption() to authenticated;
grant execute on function public.ve_admin_set_exchange_rate(bigint, bigint, timestamptz, text, boolean) to authenticated;
grant execute on function public.ve_admin_update_redemption_policy(jsonb, text) to authenticated;
grant execute on function public.ve_admin_save_payout_method(uuid, jsonb) to authenticated;
grant execute on function public.ve_admin_list_conversions(text, text, integer, integer) to authenticated;
grant execute on function public.ve_admin_transition_conversion(uuid, text, text, text) to authenticated;
grant execute on function public.ve_admin_list_payouts(text, text, integer, integer) to authenticated;
grant execute on function public.ve_admin_get_payout(uuid) to authenticated;
grant execute on function public.ve_admin_transition_payout(uuid, text, text, text, text) to authenticated;
grant execute on function public.ve_admin_finance_overview() to authenticated;
grant execute on function public.ve_admin_ledger_check() to authenticated;
