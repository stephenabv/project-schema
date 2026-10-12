-- Virtual Earn: initial schema.
--
-- All balances in this schema are VIRTUAL coins (VC). They are non-redeemable,
-- have no monetary value, and can never be withdrawn or exchanged for money.
--
-- Creates profiles, wallets, the immutable transaction ledger, tap state, user
-- roles, and the signup trigger that provisions a profile, a zero-balance
-- wallet, tap state and the default 'user' role for every new auth user.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null
    check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  avatar_url text
    check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 2048)),
  created_at timestamptz not null default now()
);

-- Usernames are unique regardless of case ("Alice" and "alice" collide).
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- wallets: exactly one per user (primary key on user_id)
-- ---------------------------------------------------------------------------
create table public.wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance_coins bigint not null default 0 check (balance_coins >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- transactions: append-only ledger of signed integer coin amounts
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_coins bigint not null check (amount_coins <> 0),
  type text not null check (
    type in ('tap_reward', 'mission_reward', 'admin_adjustment')
  ),
  source_type text not null check (char_length(source_type) between 1 and 64),
  source_id text check (source_id is null or char_length(source_id) <= 128),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

-- Stable keyset ordering for cursor pagination: (created_at, id) descending.
create index transactions_user_created_idx
  on public.transactions (user_id, created_at desc, id desc);

-- Ledger entries are immutable. Corrections must be compensating entries.
-- (Row deletion is only reachable through the account-deletion cascade; no
-- client role is granted DELETE.)
create or replace function public.prevent_transaction_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Ledger entries are immutable; record a compensating entry instead'
    using errcode = '42501';
end;
$$;

revoke all on function public.prevent_transaction_update() from public;

create trigger transactions_immutable
  before update on public.transactions
  for each row execute function public.prevent_transaction_update();

-- ---------------------------------------------------------------------------
-- tap_state: per-user cooldown and daily counters (UTC days)
-- ---------------------------------------------------------------------------
create table public.tap_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_tap_at timestamptz,
  activity_date date not null default (timezone('utc', now())::date),
  taps_today integer not null default 0 check (taps_today >= 0)
);

-- ---------------------------------------------------------------------------
-- user_roles: provisioned as 'user' at signup; 'admin' only via trusted ops
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin'))
);

-- ---------------------------------------------------------------------------
-- Signup provisioning
-- ---------------------------------------------------------------------------
-- The requested username comes from untrusted user metadata. It is only used
-- when it is well-formed and still free; otherwise a generated username is
-- assigned so that signup never fails on a collision. Roles are NEVER read
-- from metadata: every new account starts as 'user'.
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
       select 1 from public.profiles p where lower(p.username) = lower(requested)
     ) then
    new_username := requested;
  else
    new_username := fallback;
  end if;

  begin
    insert into public.profiles (id, username) values (new.id, new_username);
  exception when unique_violation then
    -- Lost a race for the requested name: fall back to the generated one.
    insert into public.profiles (id, username) values (new.id, fallback);
  end;

  insert into public.wallets (user_id, balance_coins) values (new.id, 0);
  insert into public.tap_state (user_id) values (new.id);
  insert into public.user_roles (user_id, role) values (new.id, 'user');

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
