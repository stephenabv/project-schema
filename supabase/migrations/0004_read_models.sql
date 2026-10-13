-- Virtual Earn: read models for the dashboard and wallet.
--
-- These functions run as SECURITY INVOKER, so row level security still
-- applies; they additionally filter on auth.uid() so the planner can use the
-- per-user indexes. Charts aggregate real ledger rows only.

-- Dashboard summary for the signed-in user.
create or replace function public.get_dashboard_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('utc', now())::date;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'balanceCoins', coalesce(w.balance_coins, 0),
    'walletUpdatedAt', w.updated_at,
    'totalEarnedCoins', coalesce(agg.total_earned, 0),
    'todayEarnedCoins', coalesce(agg.today_earned, 0),
    'actionsCompleted', coalesce(agg.tap_count, 0),
    'tapsToday', case when s.activity_date = v_today then s.taps_today else 0 end,
    'lastTapAt', s.last_tap_at,
    'policy', public.tap_policy(),
    'currency', 'VC',
    'redeemable', false
  )
  into v_result
  from public.wallets w
  left join public.tap_state s on s.user_id = w.user_id
  left join lateral (
    select
      sum(t.amount_coins) filter (where t.amount_coins > 0) as total_earned,
      sum(t.amount_coins) filter (
        where t.amount_coins > 0
          and t.created_at >= (v_today::timestamp at time zone 'utc')
      ) as today_earned,
      count(*) filter (where t.type = 'tap_reward') as tap_count
    from public.transactions t
    where t.user_id = w.user_id
  ) agg on true
  where w.user_id = v_user_id;

  if v_result is null then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_dashboard_summary() from public, anon;
grant execute on function public.get_dashboard_summary() to authenticated;

-- Daily virtual rewards (UTC days) for the last p_days days, zero-filled.
create or replace function public.get_reward_series(p_days integer default 14)
returns table (day date, coins bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('utc', now())::date;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'p_days must be between 1 and 90' using errcode = '22023';
  end if;

  return query
  select d.day::date, coalesce(sum(t.amount_coins) filter (where t.amount_coins > 0), 0)::bigint
  from generate_series(v_today - (p_days - 1), v_today, interval '1 day') as d (day)
  left join public.transactions t
    on t.user_id = v_user_id
   and t.created_at >= (d.day::date::timestamp at time zone 'utc')
   and t.created_at < ((d.day::date + 1)::timestamp at time zone 'utc')
  group by d.day
  order by d.day;
end;
$$;

revoke all on function public.get_reward_series(integer) from public, anon;
grant execute on function public.get_reward_series(integer) to authenticated;

-- Keyset-paginated ledger. The cursor is the (created_at, id) of the last row
-- of the previous page; both parts must be given together. Dates are UTC and
-- p_to is inclusive.
create or replace function public.list_transactions(
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_type text default null,
  p_from date default null,
  p_to date default null
)
returns table (
  id uuid,
  amount_coins bigint,
  type text,
  source_type text,
  source_id text,
  created_at timestamptz
)
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

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100' using errcode = '22023';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'Cursor requires both created_at and id' using errcode = '22023';
  end if;

  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'p_from must not be after p_to' using errcode = '22023';
  end if;

  return query
  select t.id, t.amount_coins, t.type, t.source_type, t.source_id, t.created_at
  from public.transactions t
  where t.user_id = v_user_id
    and (p_type is null or t.type = p_type)
    and (p_from is null or t.created_at >= (p_from::timestamp at time zone 'utc'))
    and (p_to is null or t.created_at < ((p_to + 1)::timestamp at time zone 'utc'))
    and (
      p_cursor_created_at is null
      or (t.created_at, t.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by t.created_at desc, t.id desc
  limit p_limit;
end;
$$;

revoke all on function public.list_transactions(integer, timestamptz, uuid, text, date, date) from public, anon;
grant execute on function public.list_transactions(integer, timestamptz, uuid, text, date, date) to authenticated;
