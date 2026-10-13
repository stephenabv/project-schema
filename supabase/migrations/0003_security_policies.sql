-- Virtual Earn: row level security and explicit privileges.
--
-- Supabase grants broad default privileges on new public tables to the anon
-- and authenticated roles. RLS alone is not the whole authorization story, so
-- every table first has its privileges revoked and then receives only the
-- narrow grants it needs. Clients get NO write access to wallets, the ledger,
-- tap state or roles: those change only through security-definer functions.

alter table public.player_profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.tap_state enable row level security;
alter table public.user_roles enable row level security;

revoke all on public.player_profiles from anon, authenticated;
revoke all on public.wallets from anon, authenticated;
revoke all on public.transactions from anon, authenticated;
revoke all on public.tap_state from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;

grant select on public.player_profiles to authenticated;
grant update (username, avatar_url) on public.player_profiles to authenticated;
grant select on public.wallets to authenticated;
grant select on public.transactions to authenticated;
grant select on public.tap_state to authenticated;

create policy "player_profiles_select_own"
  on public.player_profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "player_profiles_update_own"
  on public.player_profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "wallets_select_own"
  on public.wallets for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "transactions_select_own"
  on public.transactions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "tap_state_select_own"
  on public.tap_state for select to authenticated
  using ((select auth.uid()) = user_id);

-- user_roles intentionally has no client grants or policies. Role checks for
-- administrative operations run server-side through trusted functions.
