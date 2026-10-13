# Virtual Earn

A responsive, gamified **earning simulator**. Users tap a button, the server records a virtual reward, and the
dashboard shows their running virtual earnings.

> **Product disclosure.** All balances and rewards are virtual coins (VC). They are non-redeemable, have no
> monetary value, and cannot be deposited, withdrawn, cashed out or exchanged for money. The app offers no
> investments and no returns of any kind. The disclosure appears on the landing page, during registration, in the
> wallet, and next to every balance.
>
> The release adds a VC-to-PHP **conversion and payout workflow** for a possible future, legally cleared program.
> It is **switched off by default**; while it is off players only see that conversion is not available, and the
> disclosures above stay in force. There is no payment provider: an admin sends each payout by hand and records the
> payment reference before it can be marked paid. Do not open it until real-money payouts are legally cleared
> (licensing, KYC/AML checks, tax and updated terms).

Stack: Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase
(Auth + PostgreSQL) · Zod · Recharts · Vitest · Playwright · Vercel.

## What is in this release

The blueprint's vertical slice (authenticated user → tap → atomic virtual reward → persisted wallet → history →
dashboard) plus **Phase 1** (missions, XP and levels, badges, profile and account settings), **Phase 2** (the admin
console), **Phase 3** (daily bonus and streaks, leaderboards, cosmetic shop, notifications) and **Phase 4** (idle
generator, feature flags, maintenance mode, scheduled missions, economy and retention analytics, CSV exports,
installable web app), plus **Phase 5**: robot workers (passive earnings), a rebalanced tap, and the conversion and
payout workflow behind an admin switch that is off by default.

| Area | Routes |
| --- | --- |
| Public | `/`, `/about` |
| Auth | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback` |
| App | `/dashboard`, `/earn`, `/missions`, `/achievements`, `/leaderboard`, `/shop`, `/robots`, `/generator`, `/exchange`, `/payouts`, `/notifications`, `/wallet`, `/profile`, `/settings` |
| Admin | `/admin`, `/admin/analytics`, `/admin/users`, `/admin/tasks`, `/admin/achievements`, `/admin/robots`, `/admin/exchange`, `/admin/conversions`, `/admin/payouts`, `/admin/payouts/:id`, `/admin/ledger`, `/admin/settings`, `/admin/audit-logs` |
| API | `POST /api/earn/tap`, `GET /api/wallet`, `GET /api/transactions`, `GET /api/dashboard`, `GET /api/tasks`, `POST /api/tasks/:id/claim`, `GET /api/achievements`, `GET/POST /api/daily-bonus`, `GET /api/leaderboard?board=xp\|weekly`, `GET /api/shop`, `POST /api/shop/:id/purchase`, `POST /api/shop/:id/equip`, `GET /api/notifications`, `POST /api/notifications/read`, `GET /api/generator`, `POST /api/generator/collect`, `POST /api/generator/upgrade`, `GET /api/config`, `GET /api/robots`, `POST /api/robots/:id/purchase`, `GET /api/robots/generator`, `POST /api/robots/generator/collect`, `POST /api/robots/owned/:id/active`, `GET /api/earnings`, `GET /api/exchange`, `GET/POST /api/conversions`, `POST /api/conversions/:id/cancel`, `GET/POST /api/payouts`, `POST /api/payouts/:id/cancel` |
| Admin API | `GET /api/admin/analytics`, `GET /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/adjustments`, `GET/POST /api/admin/tasks`, `PATCH /api/admin/tasks/:id`, `GET/POST /api/admin/achievements`, `PATCH /api/admin/achievements/:id`, `GET/PATCH /api/admin/settings`, `PUT /api/admin/settings/flags`, `PUT /api/admin/settings/maintenance`, `PUT /api/admin/tasks/:id/schedule`, `GET /api/admin/audit-logs`, `GET /api/admin/exports/:dataset` (`users`, `audit-logs`, `economy`, `conversions`, `payouts`) |

**Progression rules (all enforced in SQL).** Each accepted tap gives 1 XP; reaching level *L* takes
`50 · L · (L − 1)` XP. Missions are daily (UTC day), weekly (ISO week, Monday UTC) or one-time; progress is computed
from recorded activity and each mission pays once per period through `public.claim_task(task_id, idempotency_key)`.
Badges unlock automatically inside the same transaction as the reward that reached them and pay a one-time bonus.
Every payout is a ledger entry (`tap_reward`, `mission_reward`, `achievement_reward`).

**Admin console.** Admins search users, suspend or restore accounts (a suspended account cannot receive any reward,
enforced by a trigger on the ledger), grant or remove the admin role, and credit or debit virtual coins with a reason
(idempotent, never below zero). They create, edit, publish and archive missions, configure badges, and change the
tap policy (reward, cooldown, daily limit, XP per tap) that `process_tap` reads. Every change writes an append-only
`audit_logs` row in the same transaction. Each `ve_admin_*` database function re-checks the caller's role, so the
console's own checks (404 for non-admin pages, 403 for the API) are a second layer, not the only one.

Admins can only be created by an existing admin or by the database owner. To bootstrap the first one, run in the
Supabase SQL editor:

```sql
insert into public.user_roles (user_id, role) values ('<auth user id>', 'admin')
on conflict (user_id) do update set role = 'admin';
```

**Engagement (Phase 3).** The daily bonus can be claimed once per UTC day through
`public.claim_daily_bonus(idempotency_key)`: day one pays 20 VC and each consecutive day adds 10 VC up to 80 VC
(plus 10 XP); missing a day resets the streak, and three new badges reward 3, 7 and 30-day streaks. Leaderboards rank
all-time XP and this week's earned virtual coins; `get_leaderboard` returns only username, avatar, level, score and
equipped cosmetics, and skips suspended players and anyone who opted out in Settings. The shop sells cosmetic items
only (tap button skins, avatar frames, titles), which never change rewards: `purchase_item` checks price, level and
balance in one transaction and is idempotent, writing a `shop_purchase` ledger entry. Database triggers write in-app
notifications for badges, level-ups, purchases and admin actions on your account (suspension, restore, wallet
adjustments), kept as history and read newest first.

**Operations (Phase 4).** The idle generator costs `150 · L²` VC to build or raise to level *L* (max 10) and
makes `6 · L` VC per hour, filling up after 8 hours. `collect_generator` pays what accrued by server time, so the
browser's running counter is display only. Admins can switch the daily bonus, leaderboards, shop and generator off,
and put the game in maintenance mode, which pauses every reward and purchase (admin adjustments still work). Both are
enforced by a trigger on the ledger, so no code path can pay out around them, and both are audited. Missions can have
a publishing window (`publish_at`, `unpublish_at`, entered in UTC); outside it they are hidden and cannot be claimed.
The analytics page adds virtual coins by source and spent per day, weekly signup cohorts with day-1 and week-2
retention, and engagement-feature totals. CSV exports (players, audit log, 90-day economy) are capped at 5,000 rows,
never cached, and quote any cell that starts like a spreadsheet formula. The app ships a web app manifest so players
can install it to their home screen.

**Robots and passive earnings (Phase 5).** The Robot Shop sells robot workers in five tiers. Each robot has a
price, an hourly rate (shown as VC/min, VC/h and 24-hour output), a per-player limit and a level requirement, all
admin-configurable; the database refuses a catalogue where a cheaper robot out-earns a pricier one. Seeded robots
run from Scout Bot (500 VC, 10 VC/h) to Nova Bot (80,000 VC, 2,200 VC/h). A player may own 15 robots and run 5 at
once; each robot stores up to 24 hours of output. `purchase_robot` checks balance, level and limits and charges once
per idempotency key (`robot_purchase` ledger entry); the robot keeps the rate it was bought at. Earnings accrue from
server timestamps: `collect_robot_earnings` pays everything due in one `robot_earning` ledger entry and records a
per-robot `robot_earnings` row, and pausing a robot pays what it had accrued first. Refreshes, extra tabs and
replayed requests cannot pay twice because accrual restarts from the paid period's end inside the same locked
transaction. **Tapping is now supplementary:** 2 VC per tap, a 1 s cooldown, at most 40 taps a minute and 500 a UTC
day (all admin-configurable), so robots are the main source. Tap and robot income have distinct ledger types and are
shown separately on the dashboard.

**Conversion and payouts (off by default).** When an admin opens the program (it needs a rate, an active payout
method, a reason and typing `ENABLE REDEMPTION`):

- *Exchange rate.* Admins record `N VC = ₱X.XX` with an effective time and a reason; the history is append-only and
  shows who set each rate. Changes of more than 25% need an explicit confirmation.
- *Conversion requests* (`CNV-YYMMDD-XXXXXXXX`). The player submits an amount and the rate they reviewed; the
  database refuses it if the rate changed (`RATE_CHANGED`), computes the pesos as `floor(VC × centavos ÷ VC)`,
  snapshots the rate, and reserves the coins with a `conversion_hold` ledger entry so they cannot be spent twice.
  Statuses: Pending → Under review → Approved → Completed, or Rejected / Cancelled, which release the coins with a
  `conversion_release` entry. Completing credits the pesos to the player's converted balance.
- *Payout requests* (`PAY-YYMMDD-XXXXXXXX`). The player picks an admin-configured method, an amount within the
  limits, and their account details, which the server encrypts (AES-256-GCM, `PAYOUT_DETAILS_KEY`) before storage;
  players only ever see a masked hint. The amount is held at once. Statuses: Pending → Under review → Approved →
  Processing → Paid, or Rejected / Failed (amount returned) and Paid → Refunded. **Paid requires the payment
  channel's reference and the admin's confirmation that they verified the transfer.** Opening a payout's review page
  is itself audited.
- Pesos are integer centavos in a separate append-only `php_ledger` with one entry per request and step, so no
  request can be processed twice. Every transition is idempotent, keeps an event trail with notes and reasons,
  notifies the player, and writes `audit_logs`. Admins cannot review their own requests. `/admin/ledger` reconciles
  every coin and peso balance against its ledger and open requests.

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
  migrations/           0001 schema · 0002 reward function · 0003 RLS/privileges · 0004 read models ·
                        0005 provision pre-existing auth users · 0006 progression (XP, missions, badges) ·
                        0007 progression RLS, profile avatars and read models · 0008 admin console ·
                        0009 engagement (streaks, daily bonus, leaderboard, shop, notifications) ·
                        0010 operations (flags, maintenance, generator, scheduling, analytics) ·
                        0011 robots and tap rebalance · 0012 exchange, conversions and payouts ·
                        0013 finance admin (rates, reviews, reconciliation)
tests/
  unit/                 schemas, services, tap client, error mapping, HTTP helpers
  integration/api/      route handlers end to end with a fake auth boundary
  integration/db/       migrations against real PostgreSQL: RLS, privileges, idempotency, concurrency
  e2e/                  Playwright against a real Supabase stack (desktop and mobile)
```

**The database is the source of truth for rewards.** `public.process_tap(idempotency_key)` derives the user from
`auth.uid()`, locks the wallet row, replays duplicates, enforces the cooldown and the per-minute and daily caps, and
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
| `VE004` | mission or daily bonus already claimed this period | 409 | `ALREADY_CLAIMED` |
| `VE005` | mission objective not complete | 409 | `MISSION_INCOMPLETE` |
| `VE010` | mission not published | 404 | `NOT_FOUND` |
| `23505` | username or slug taken | 409 | `ALREADY_EXISTS` |
| `42501` | privilege denied (including non-admins) | 403 | `FORBIDDEN` |
| `VE006` | account suspended | 403 | `ACCOUNT_SUSPENDED` |
| `VE008` | not enough virtual coins (adjustment or purchase) | 409 | `INSUFFICIENT_BALANCE` |
| `VE009` | shop item needs a higher level | 409 | `LEVEL_REQUIRED` |
| `VE013` | shop item already owned | 409 | `ALREADY_OWNED` |
| `VE011` | action not allowed (e.g. demoting yourself) | 409 | `ACTION_NOT_ALLOWED` |
| `VE012` | record not found (including collecting from an unbuilt generator) | 404 | `NOT_FOUND` |
| `VE014` | feature switched off by an admin | 403 | `FEATURE_DISABLED` |
| `VE015` | generator has nothing to collect yet | 409 | `NOTHING_TO_COLLECT` |
| `VE016` | more taps this minute than allowed | 429 + `Retry-After` | `TAP_RATE_LIMITED` |
| `VE017` | robot ownership or work-slot limit reached | 409 | `LIMIT_REACHED` |
| `VE018` | exchange rate changed since the player reviewed it | 409 | `RATE_CHANGED` |
| `VE019` | conversion or payout amount outside the limits | 409 | `AMOUNT_OUT_OF_RANGE` |
| `VE020` | request is not in a status that allows this | 409 | `INVALID_STATUS` |
| `VE021` | rate change over 25% needs confirmation | 409 | `CONFIRMATION_REQUIRED` |
| `VE022` | conversion has no rate or payout method yet | 503 | `NOT_CONFIGURED` |
| `VE007` | maintenance mode | 503 + `Retry-After` | `MAINTENANCE_MODE` |
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
| `PAYOUT_DETAILS_KEY` | for payouts | Server-only, 32 random bytes in base64 (`openssl rand -base64 32`). Encrypts payout account details. Without it payout requests fail closed (503). Never prefix it with `NEXT_PUBLIC_`; losing or rotating it makes stored details unreadable |
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
  them on every table, then grants only `SELECT` (plus `UPDATE (username, avatar_url)` on `player_profiles`). Clients cannot
  write balances, the ledger, tap state or roles; ledger rows are additionally immutable via trigger.
- All functions use `SET search_path = ''` and fully qualified names; `EXECUTE` is revoked from `public`/`anon`.
- Signup never reads a role from user metadata. Requested usernames are validated and fall back to a generated
  name on collision, so signup cannot fail on (or be probed through) a taken username.
- Login, signup and password reset return the same message whether or not an account exists.
- Post-login redirects accept same-origin paths only. Request bodies are capped at 1 KB. API responses are
  `Cache-Control: private, no-store`. Security headers are set in `next.config.ts`.
- Admin CSV exports neutralise formula-like cells (`=`, `+`, `-`, `@`, tab, carriage return) and are logged with
  the admin's id and row count. They include player emails, so treat downloaded files as personal data.
- Payout account details are encrypted in the Next.js server before they reach the database and are never
  returned to players, listed, or exported; only `/admin/payouts/:id` decrypts them, and each view is audited. The
  column is not readable through the API (no grant), and the CSV export carries only the masked hint.
- Conversion and payout amounts, rates and statuses are always decided by the database. The browser sends an
  amount and the rate id it reviewed; the server re-reads the rate, the limits and the balance under a row lock.
- Raw database errors never reach clients; logs are structured JSON with codes only (no emails, tokens or messages).

## Deployment (Vercel + Supabase)

1. Create **separate** Supabase projects for development and production. If Virtual Earn must share a project with
   another app, note that its tables (`player_profiles`, `wallets`, `transactions`, `tap_state`, `user_roles`) and
   functions live in `public`, its signup trigger provisions an account for **every** new auth user, and migration
   0005 provisions accounts for users who already exist. Users of the other app can sign in to Virtual Earn.
2. Review, then apply migrations: `npx supabase link --project-ref <ref>` and `npx supabase db push`.
3. In Supabase Auth, set the Site URL (leave it alone on a shared project; auth emails use an explicit redirect)
   and add `https://<your-domain>/auth/callback` to the redirect allow list.
   Enable email confirmation and configure SMTP for production.
4. In Vercel, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_APP_URL` per
   environment, plus `PAYOUT_DETAILS_KEY` (Production only, marked Sensitive; generate it once and keep a copy in
   your secret store, because a lost key makes stored payout details unreadable), then deploy.
5. Smoke test: register, tap twice, reload, confirm the wallet shows two ledger rows. Buy a Scout Bot, wait a few
   minutes, collect on `/generator`, and check the wallet shows the robot purchase and earnings.
6. Conversion and payouts stay closed until an admin opens them on `/admin/exchange`. Before that: obtain legal
   clearance, set the rate, review the payout methods and limits, and agree who sends and verifies payments.

### Operations

- **Rate limiting.** The database enforces cooldowns and daily caps per user. Add an infrastructure-level limiter
  (for example Vercel Firewall rules on `/api/*` and the auth routes) to absorb floods before they reach the
  database. Supabase Auth applies its own sign-in and email rate limits.
- **Monitoring.** Alert on `api_error`/`api_unhandled_error`/`database_operation_failed` log events and on a
  rising rate of 429 responses. Periodically check that ledger and wallet reconcile:
  `select w.user_id from wallets w left join transactions t using (user_id) group by w.user_id, w.balance_coins having w.balance_coins <> coalesce(sum(t.amount_coins), 0);`
  (expected: no rows). `/admin/ledger` runs the same check for coins, reserved coins and every peso balance.
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
