-- Virtual Earn: atomic tap reward.
--
-- process_tap() derives the user from auth.uid(), locks the wallet and tap
-- state rows, checks idempotency, the cooldown and the daily limit, and writes
-- the ledger entry and the wallet balance in the same database transaction.
-- Any error rolls the whole call back.
--
-- Error contract (SQLSTATE -> meaning), mapped to HTTP by the API layer:
--   28000  authentication required
--   22023  invalid argument (missing idempotency key)
--   P0002  wallet not found
--   VE001  tap cooldown active
--   VE002  daily tap limit reached
--   VE003  idempotency key already used for a different operation

-- Single source of truth for the tap policy. Read by process_tap() and by the
-- dashboard read model so the UI never hard-codes reward rules.
create or replace function public.tap_policy()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'rewardCoins', 10,
    'cooldownMs', 1000,
    'dailyLimit', 1000
  );
$$;

revoke all on function public.tap_policy() from public, anon;
grant execute on function public.tap_policy() to authenticated;

create or replace function public.process_tap(p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy constant jsonb := public.tap_policy();
  v_reward constant bigint := (v_policy ->> 'rewardCoins')::bigint;
  v_cooldown constant interval := make_interval(secs => (v_policy ->> 'cooldownMs')::numeric / 1000);
  v_daily_limit constant integer := (v_policy ->> 'dailyLimit')::integer;
  v_user_id uuid;
  v_balance bigint;
  v_now timestamptz := now();
  v_today date := timezone('utc', now())::date;
  v_state public.tap_state%rowtype;
  v_existing public.transactions%rowtype;
  v_transaction_id uuid;
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

    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'transactionId', v_existing.id,
      'rewardCoins', v_existing.amount_coins,
      'balanceCoins', v_balance,
      'tapsToday', (select s.taps_today from public.tap_state s where s.user_id = v_user_id),
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

  insert into public.transactions (
    user_id, amount_coins, type, source_type, source_id, idempotency_key
  )
  values (
    v_user_id, v_reward, 'tap_reward', 'tap', null, p_idempotency_key
  )
  returning id into v_transaction_id;

  update public.wallets
  set balance_coins = balance_coins + v_reward, updated_at = v_now
  where user_id = v_user_id
  returning balance_coins into v_balance;

  update public.tap_state
  set last_tap_at = v_now,
      activity_date = v_today,
      taps_today = taps_today + 1
  where user_id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'transactionId', v_transaction_id,
    'rewardCoins', v_reward,
    'balanceCoins', v_balance,
    'tapsToday', v_state.taps_today + 1,
    'currency', 'VC',
    'redeemable', false
  );
end;
$$;

revoke all on function public.process_tap(uuid) from public, anon;
grant execute on function public.process_tap(uuid) to authenticated;
