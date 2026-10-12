-- Minimal emulation of the Supabase platform pieces the migrations rely on,
-- so they can be tested against a plain PostgreSQL instance:
--   * auth.users and auth.uid() (reads the JWT "sub" claim like Supabase),
--   * Supabase's broad default privileges on the public schema, so the tests
--     prove the migrations revoke them rather than relying on a clean slate.

-- The roles themselves are cluster-wide and are created by global-setup.ts.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
