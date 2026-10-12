# Virtual Earn

A responsive, gamified **earning simulator**. Users tap a button, the server records a virtual reward, and the
dashboard shows their running virtual earnings.

> **Product disclosure.** All balances and rewards are virtual coins (VC). They are non-redeemable, have no
> monetary value, and cannot be deposited, withdrawn, cashed out or exchanged for money. The app offers no
> investments and no returns of any kind. The disclosure appears on the landing page, during registration, in the
> wallet, and next to every balance.

Stack: Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase
(Auth + PostgreSQL) · Zod · Recharts · Vitest · Playwright · Vercel.

## What is in this release

This is the blueprint's recommended **vertical slice**: authenticated user → tap action → atomic virtual reward →
persisted wallet → transaction history, plus the dashboard.

| Area | Routes |
| --- | --- |
| Public | `/`, `/about` |
| Auth | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback` |
| App | `/dashboard`, `/earn`, `/wallet` |
| API | `POST /api/earn/tap`, `GET /api/wallet`, `GET /api/transactions`, `GET /api/dashboard` |

Missions, achievements, XP/levels, leaderboard, profile settings and the admin console (blueprint P0 items
beyond the slice, plus P1/P2) are **not** built yet. The schema keeps room for them (`mission_reward` and
`admin_adjustment` ledger types, `user_roles`).

## Architecture

```
src/
  app/                  Routes (thin: validate input, call a service, render)
    (public)/ (auth)/ (app)/ api/
  components/           UI only: ui/ layout/ auth/ dashboard/ earning/ wallet/
  services/             Business logic, one class per area (RewardService, WalletService, DashboardService)
  lib/
    supabase/           server client, session-refresh proxy, SQLSTATE -> domain error mapping
    auth/               verified-user helpers, safe redirects, form state
    validation/         Zod schemas for every input and every database result
    http/               JSON responses, error rendering, body size limits
    pagination/ formatting/ api/ (browser tap client) env.ts errors.ts logger.ts
  proxy.ts              Next.js 16 request proxy (session refresh + optimistic redirects)
  types/                database.ts (Supabase types) and api.ts (public contracts)
supabase/
  migrations/           0001 schema · 0002 reward function · 0003 RLS/privileges · 0004 read models
tests/
  unit/                 schemas, services, tap client, error mapping, HTTP helpers
  integration/api/      route handlers end to end with a fake auth boundary
  integration/db/       migrations against real PostgreSQL: RLS, privileges, idempotency, concurrency
  e2e/                  Playwright against a real Supabase stack (desktop and mobile)
```

**The database is the source of truth for rewards.** `public.process_tap(idempotency_key)` derives the user from
`auth.uid()`, locks the wallet row, replays duplicates, enforces the 1 s cooldown and 1,000 taps per UTC day, and
writes the ledger entry and the balance in one transaction. The browser sends only an idempotency key; the server
never accepts an amount. The tap policy lives in one SQL function (`public.tap_policy()`) that the UI reads, so the
numbers on screen always match what the server enforces.

**Services take a user-scoped Supabase client**, so RLS applies to every read. No service-role key is used.

### Error contract

| SQLSTATE | Meaning | HTTP | `code` |
| --- | --- | --- | --- |
| `28000` | not signed in | 401 | `AUTHENTICATION_REQUIRED` |
| `22023` | invalid argument | 400 | `VALIDATION_FAILED` |
| `P0002` | wallet not found | 404 | `NOT_FOUND` |
| `VE001` | tap cooldown | 429 + `Retry-After` | `COOLDOWN_ACTIVE` |
| `VE002` | daily limit | 429 + `Retry-After` | `DAILY_LIMIT_REACHED` |
| `VE003` | idempotency key reused for another action | 409 | `IDEMPOTENCY_CONFLICT` |
| other | unexpected | 500 | `INTERNAL_ERROR` (details only in logs) |

## Getting started

Requirements: Node 20.9+ (22 recommended), Docker (for the local Supabase stack).

```bash
npm install
cp .env.example .env.local

npx supabase start          # local Postgres, Auth and REST; applies supabase/migrations
npx supabase status         # copy API URL and the publishable (or anon) key into .env.local
npm run dev                 # http://localhost:3000
```

Local auth has email confirmation disabled (`supabase/config.toml`), so a new account is signed in immediately.

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable key (older projects: anon key) |
| `NEXT_PUBLIC_APP_URL` | prod | Builds auth email links; never derived from the Host header |
| `NEXT_PUBLIC_APP_NAME` | no | Defaults to `Virtual Earn` |
| `SUPABASE_SECRET_KEY` | no | Not used by this release. Never prefix it with `NEXT_PUBLIC_` |
| `TEST_DATABASE_URL` | tests | Disposable PostgreSQL superuser URL for `npm run test:db` |

Missing or malformed variables fail fast with the variable names (never their values).

## Scripts

| Command | What it runs |
| --- | --- |
| `npm run check` | lint + typecheck + unit tests |
| `npm run test` | unit and route-handler tests (no services needed) |
| `npm run test:db` | migration, RLS, idempotency and concurrency tests; needs `TEST_DATABASE_URL` |
| `npm run test:e2e` | Playwright against `npm run start`; build first and point `.env.local` at a Supabase stack |
| `npm run db:types` | regenerate `src/types/database.ts` from the local database |

The database suite creates a throwaway database per test file, applies a small Supabase emulation
(`tests/integration/db/support/supabase-shim.sql`: roles, `auth.users`, `auth.uid()` and Supabase's broad default
grants) and then every migration, so it proves the migrations revoke those defaults themselves.

## Security notes

- Identity always comes from `supabase.auth.getUser()` on the server, never from a client-supplied id. The proxy
  redirect is a convenience; every page, Server Action and Route Handler re-verifies.
- Supabase grants `anon` and `authenticated` broad default privileges on new public tables. Migration 0003 revokes
  them on every table, then grants only `SELECT` (plus `UPDATE (username, avatar_url)` on profiles). Clients cannot
  write balances, the ledger, tap state or roles; ledger rows are additionally immutable via trigger.
- All functions use `SET search_path = ''` and fully qualified names; `EXECUTE` is revoked from `public`/`anon`.
- Signup never reads a role from user metadata. Requested usernames are validated and fall back to a generated
  name on collision, so signup cannot fail on (or be probed through) a taken username.
- Login, signup and password reset return the same message whether or not an account exists.
- Post-login redirects accept same-origin paths only. Request bodies are capped at 1 KB. API responses are
  `Cache-Control: private, no-store`. Security headers are set in `next.config.ts`.
- Raw database errors never reach clients; logs are structured JSON with codes only (no emails, tokens or messages).

## Deployment (Vercel + Supabase)

1. Create **separate** Supabase projects for development and production.
2. Review, then apply migrations: `npx supabase link --project-ref <ref>` and `npx supabase db push`.
3. In Supabase Auth, set the Site URL and add `https://<your-domain>/auth/callback` to the redirect allow list.
   Enable email confirmation and configure SMTP for production.
4. In Vercel, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_APP_URL` per
   environment, then deploy.
5. Smoke test: register, tap twice, reload, confirm the wallet shows two ledger rows.

### Operations

- **Rate limiting.** The database enforces cooldowns and daily caps per user. Add an infrastructure-level limiter
  (for example Vercel Firewall rules on `/api/*` and the auth routes) to absorb floods before they reach the
  database. Supabase Auth applies its own sign-in and email rate limits.
- **Monitoring.** Alert on `api_error`/`api_unhandled_error`/`database_operation_failed` log events and on a
  rising rate of 429 responses. Periodically check that ledger and wallet reconcile:
  `select w.user_id from wallets w left join transactions t using (user_id) group by w.user_id, w.balance_coins having w.balance_coins <> coalesce(sum(t.amount_coins), 0);`
  (expected: no rows).
- **Backups.** Use Supabase's daily backups (enable Point-in-Time Recovery for production) and test a restore into
  a non-production project before launch.
- **Data retention.** Deleting an auth user cascades to their profile, wallet, tap state, role and ledger. Decide
  and document a retention period for inactive accounts; for a Philippines deployment, review the Data Privacy Act
  of 2012 obligations for the email addresses collected.

## Design decisions and deviations from the blueprint

- **Distinct error codes** (`VE001`/`VE002`/`VE003`) instead of the default `P0001`, so any other `RAISE` cannot
  be misreported as a rate limit, and the client can tell a cooldown from the daily cap.
- **Privileges revoked before granting**, because Supabase's default grants would otherwise leave tables writable
  wherever RLS has a gap.
- **Server Actions for auth** instead of a browser-side `signUp`: validation, redirects and cookies stay on the
  server, and Next.js checks the request origin.
- **Read models in SQL** (`get_dashboard_summary`, `get_reward_series`, `list_transactions`) run as `SECURITY
  INVOKER`, so RLS still applies; the ledger uses keyset pagination on `(created_at, id)`.
- **UTC days everywhere** (limits, chart buckets and displayed times) so what users see matches what the server
  enforces.
- Usernames are case-insensitively unique and restricted to `[A-Za-z0-9_]{3,24}`; avatar URLs must be `https://`.
