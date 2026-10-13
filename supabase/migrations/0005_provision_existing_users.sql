-- Virtual Earn: provision accounts for auth users that existed before the
-- signup trigger (for example when Virtual Earn is added to a Supabase project
-- that already has users). New signups are handled by public.handle_new_user().
--
-- Idempotent: rows that already exist are left untouched, so re-running this
-- migration never changes a balance or a username. Existing users always get
-- the generated username and the 'user' role; nothing is read from metadata.

insert into public.player_profiles (id, username)
select u.id, 'user_' || substr(replace(u.id::text, '-', ''), 1, 12)
  from auth.users u
 where not exists (select 1 from public.player_profiles p where p.id = u.id)
on conflict do nothing;

insert into public.wallets (user_id, balance_coins)
select p.id, 0 from public.player_profiles p
on conflict (user_id) do nothing;

insert into public.tap_state (user_id)
select p.id from public.player_profiles p
on conflict (user_id) do nothing;

insert into public.user_roles (user_id, role)
select p.id, 'user' from public.player_profiles p
on conflict (user_id) do nothing;
