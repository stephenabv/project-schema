import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asRole,
  balanceOf,
  createTestDatabase,
  createUser,
  disableAchievements,
  hasDatabase,
  ledgerSum,
  sqlState,
  type TestDatabase,
} from "./support/database";

async function call<T>(pool: Pool, userId: string | null, sql: string, params: unknown[] = []): Promise<T> {
  return asRole(pool, userId, async (client) => (await client.query(sql, params)).rows[0]?.result as T);
}

async function rejectsWith(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return sqlState(error);
  }
  return undefined;
}

async function credit(pool: Pool, userId: string, amount: number): Promise<void> {
  await pool.query(
    `insert into public.transactions (user_id, amount_coins, type, source_type, idempotency_key)
     values ($1, $2, 'admin_adjustment', 'test', gen_random_uuid())`,
    [userId, amount],
  );
  await pool.query("update public.wallets set balance_coins = balance_coins + $2 where user_id = $1", [userId, amount]);
}

async function reserved(pool: Pool, userId: string): Promise<number> {
  return Number((await pool.query("select reserved_coins from public.wallets where user_id = $1", [userId])).rows[0].reserved_coins);
}

async function phpWallet(pool: Pool, userId: string) {
  const { rows } = await pool.query(
    "select available_centavos::int as available, reserved_centavos::int as reserved, paid_centavos::int as paid from public.php_wallets where user_id = $1",
    [userId],
  );
  return rows[0] ?? { available: 0, reserved: 0, paid: 0 };
}

// Ciphertext shape produced by the application (v1.iv.tag.data, base64url).
const CIPHERTEXT = "v1.aXZpdml2aXZpdml2.dGFndGFndGFndGFndGFn.ZGF0YQ";

interface Conversion {
  id: string;
  reference: string;
  coins: number;
  phpCentavos: number;
  status: string;
  duplicate: boolean;
}

interface Payout {
  id: string;
  reference: string;
  amountCentavos: number;
  status: string;
  duplicate: boolean;
}

const POLICY = {
  enabled: true,
  minConversionCoins: 1000,
  maxConversionCoins: 100_000,
  minPayoutCentavos: 1000,
  maxPayoutCentavos: 1_000_000,
  processingDays: 7,
};

describe.skipIf(!hasDatabase)("VC-to-PHP conversions and payouts", () => {
  let db: TestDatabase;
  let admin: string;
  let rateId: string;
  let gcash: string;

  const setPolicy = (policy: Record<string, unknown>, as: string = admin) =>
    call(db.pool, as, "select public.ve_admin_update_redemption_policy($1, 'test change') as result", [JSON.stringify(policy)]);
  const setRate = (coins: number, centavos: number, confirm = false, as: string = admin) =>
    call<{ id: string }>(
      db.pool, as, "select public.ve_admin_set_exchange_rate($1, $2, null, 'test rate', $3) as result", [coins, centavos, confirm],
    );
  const convert = (user: string, coins: number, rate: string = rateId, key: string = randomUUID()) =>
    call<Conversion>(db.pool, user, "select public.request_conversion($1, $2, $3) as result", [coins, rate, key]);
  const moveConversion = (id: string, to: string, reason: string | null = null, as: string = admin) =>
    call<Conversion>(db.pool, as, "select public.ve_admin_transition_conversion($1, $2, null, $3) as result", [id, to, reason]);
  const payout = (user: string, centavos: number, key: string = randomUUID()) =>
    call<Payout>(db.pool, user, "select public.request_payout($1, $2, $3, '•••• 1234', $4) as result", [gcash, centavos, CIPHERTEXT, key]);
  const movePayout = (id: string, to: string, opts: { reason?: string; ref?: string } = {}, as: string = admin) =>
    call<Payout>(db.pool, as, "select public.ve_admin_transition_payout($1, $2, null, $3, $4) as result", [
      id, to, opts.reason ?? null, opts.ref ?? null,
    ]);

  /** A player with a completed conversion worth `centavos` of approved balance. */
  async function playerWithApprovedBalance(coins: number): Promise<string> {
    const user = await createUser(db.pool);
    await credit(db.pool, user, coins);
    const c = await convert(user, coins);
    await moveConversion(c.id, "approved");
    await moveConversion(c.id, "completed");
    return user;
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    await disableAchievements(db.pool);
    admin = await createUser(db.pool, { username: "finance_admin" });
    await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin') on conflict (user_id) do update set role = 'admin'", [admin]);
    gcash = (await db.pool.query("select id from public.payout_methods where code = 'gcash'")).rows[0].id;
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe("switch and rates", () => {
    it("is off by default and refuses conversions while off", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 5000);
      const overview = await call<{ enabled: boolean; rate: unknown }>(db.pool, user, "select public.get_redemption_overview() as result");
      expect(overview).toMatchObject({ enabled: false, rate: null });
      await expect(rejectsWith(convert(user, 1000, randomUUID()))).resolves.toBe("VE014");
      // Cannot be switched on without a rate.
      await expect(rejectsWith(setPolicy(POLICY))).resolves.toBe("VE022");
    });

    it("validates rates, requires confirmation for large changes and keeps history", async () => {
      await expect(rejectsWith(setRate(0, 1000))).resolves.toBe("22023");
      await expect(rejectsWith(setRate(1000, -5))).resolves.toBe("22023");
      await expect(rejectsWith(setRate(10, 2000))).resolves.toBe("22023"); // over one peso per VC
      const player = await createUser(db.pool);
      await expect(rejectsWith(setRate(1000, 1000, false, player))).resolves.toBe("42501");

      await setRate(1000, 1000); // 1,000 VC = PHP 10.00
      await expect(rejectsWith(setRate(1000, 2000))).resolves.toBe("VE021");
      const second = await setRate(1000, 1100); // +10%: no confirmation needed
      rateId = second.id;

      const redemption = await call<{ rates: unknown[]; currentRate: { id: string } }>(
        db.pool, admin, "select public.ve_admin_get_redemption() as result",
      );
      expect(redemption.rates).toHaveLength(2);
      expect(redemption.currentRate.id).toBe(rateId);
      await expect(
        rejectsWith(db.pool.query("update public.exchange_rates set rate_centavos = 1 where id = $1", [rateId])),
      ).resolves.toBe("42501");

      await setPolicy(POLICY);
      const { rows } = await db.pool.query("select action from public.audit_logs where action like 'exchange.%' or action like 'redemption.%' order by created_at");
      expect(rows.map((r) => r.action)).toEqual(["exchange.rate", "exchange.rate", "redemption.enable"]);
    });
  });

  describe("conversions", () => {
    it("reserves coins at the snapshot rate, rounds down to the centavo and is idempotent", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 5000);
      const key = randomUUID();
      const first = await convert(user, 1999, rateId, key);
      // 1,999 * 1,100 / 1,000 = 2,198.9 centavos -> 2,198
      expect(first).toMatchObject({ status: "pending", coins: 1999, phpCentavos: 2198, duplicate: false });
      expect(first.reference).toMatch(/^CNV-\d{6}-[0-9A-F]{8}$/);

      const replay = await convert(user, 1999, rateId, key);
      expect(replay).toMatchObject({ id: first.id, duplicate: true });
      expect(await balanceOf(db.pool, user)).toBe(3001);
      expect(await reserved(db.pool, user)).toBe(1999);
      expect(await ledgerSum(db.pool, user)).toBe(3001);

      // A rate change does not touch the pending request, and a stale rate id is refused.
      const newer = await setRate(1000, 1200);
      await expect(rejectsWith(convert(user, 1000, rateId))).resolves.toBe("VE018");
      rateId = newer.id;
      const { rows } = await db.pool.query("select php_centavos::int from public.conversion_requests where id = $1", [first.id]);
      expect(rows[0].php_centavos).toBe(2198);
    });

    it("enforces the threshold, the balance and one use of reserved coins", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 1500);
      await expect(rejectsWith(convert(user, 999))).resolves.toBe("VE019");
      await expect(rejectsWith(convert(user, 1600))).resolves.toBe("VE008");

      const outcomes = await Promise.allSettled([convert(user, 1000), convert(user, 1000), convert(user, 1000)]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      expect(await balanceOf(db.pool, user)).toBe(500);
      expect(await reserved(db.pool, user)).toBe(1000);

      // Reserved coins cannot be spent elsewhere either.
      const scout = (await db.pool.query("select id from public.robots where slug = 'scout-bot'")).rows[0].id;
      await expect(
        rejectsWith(call(db.pool, user, "select public.purchase_robot($1, $2) as result", [scout, randomUUID()])),
      ).resolves.toBe(undefined);
      await expect(
        rejectsWith(call(db.pool, user, "select public.purchase_robot($1, $2) as result", [scout, randomUUID()])),
      ).resolves.toBe("VE008");
    });

    it("releases coins on cancel and reject, settles on completion", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 6000);
      const a = await convert(user, 2000);
      const b = await convert(user, 2000);
      const c = await convert(user, 2000);

      await expect(call(db.pool, user, "select public.cancel_conversion($1) as result", [a.id])).resolves.toMatchObject({ status: "cancelled" });
      await expect(rejectsWith(moveConversion(b.id, "rejected"))).resolves.toBe("22023"); // reason required
      await moveConversion(b.id, "under_review");
      await expect(moveConversion(b.id, "rejected", "Duplicate account")).resolves.toMatchObject({ status: "rejected" });
      expect(await balanceOf(db.pool, user)).toBe(4000);
      expect(await reserved(db.pool, user)).toBe(2000);

      await expect(rejectsWith(moveConversion(c.id, "completed"))).resolves.toBe("VE020"); // must be approved first
      await moveConversion(c.id, "approved");
      await expect(rejectsWith(call(db.pool, user, "select public.cancel_conversion($1) as result", [c.id]))).resolves.toBe("VE020");
      const done = await moveConversion(c.id, "completed");
      expect(done).toMatchObject({ status: "completed", phpCentavos: 2400 });
      const again = await moveConversion(c.id, "completed");
      expect(again.duplicate).toBe(true);

      expect(await reserved(db.pool, user)).toBe(0);
      expect(await phpWallet(db.pool, user)).toEqual({ available: 2400, reserved: 0, paid: 0 });
      expect(await ledgerSum(db.pool, user)).toBe(await balanceOf(db.pool, user));

      const types = await db.pool.query(
        "select type, count(*)::int as n from public.transactions where user_id = $1 and type like 'conversion_%' group by type order by type",
        [user],
      );
      expect(types.rows).toEqual([
        { type: "conversion_hold", n: 3 },
        { type: "conversion_release", n: 2 },
      ]);
    });

    it("returns reserved coins on rejection even while the player is suspended", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 2000);
      const c = await convert(user, 2000);
      await call(db.pool, admin, "select public.ve_admin_set_suspension($1, true, 'fraud review') as result", [user]);
      await moveConversion(c.id, "rejected", "Fraud review");
      expect(await balanceOf(db.pool, user)).toBe(2000);
    });

    it("keeps requests private, blocks self-review and direct writes", async () => {
      const user = await createUser(db.pool);
      const other = await createUser(db.pool);
      await credit(db.pool, user, 2000);
      const c = await convert(user, 2000);

      const seen = await asRole(db.pool, other, async (cl) =>
        (await cl.query("select count(*)::int as n from public.conversion_requests where id = $1", [c.id])).rows[0].n,
      );
      expect(seen).toBe(0);
      await expect(rejectsWith(call(db.pool, other, "select public.cancel_conversion($1) as result", [c.id]))).resolves.toBe("VE012");
      await expect(rejectsWith(moveConversion(c.id, "approved", null, user))).resolves.toBe("42501");
      await expect(
        rejectsWith(call(db.pool, user, "update public.conversion_requests set php_centavos = 999999 returning 1 as result")),
      ).resolves.toBe("42501");
      await expect(
        rejectsWith(call(db.pool, user, "update public.wallets set reserved_coins = 0 returning 1 as result")),
      ).resolves.toBe("42501");

      await credit(db.pool, admin, 2000);
      const own = await convert(admin, 2000);
      await expect(rejectsWith(moveConversion(own.id, "approved"))).resolves.toBe("VE011");
    });
  });

  describe("payouts", () => {
    it("holds approved pesos, needs a payment reference to be paid, and is idempotent", async () => {
      const user = await playerWithApprovedBalance(10_000); // 12,000 centavos at 1.2
      expect(await phpWallet(db.pool, user)).toEqual({ available: 12_000, reserved: 0, paid: 0 });

      await expect(rejectsWith(payout(user, 500))).resolves.toBe("VE019");
      await expect(rejectsWith(payout(user, 13_000))).resolves.toBe("VE008");

      const key = randomUUID();
      const p = await payout(user, 5000, key);
      expect(p).toMatchObject({ status: "pending", amountCentavos: 5000, duplicate: false });
      expect(p.reference).toMatch(/^PAY-\d{6}-[0-9A-F]{8}$/);
      await expect(payout(user, 5000, key)).resolves.toMatchObject({ id: p.id, duplicate: true });
      expect(await phpWallet(db.pool, user)).toEqual({ available: 7000, reserved: 5000, paid: 0 });

      await movePayout(p.id, "approved");
      await expect(rejectsWith(movePayout(p.id, "paid", { ref: "GC-123" }))).resolves.toBe("VE020"); // not processing yet
      await movePayout(p.id, "processing");
      await expect(rejectsWith(movePayout(p.id, "paid"))).resolves.toBe("22023"); // reference required
      await expect(movePayout(p.id, "paid", { ref: "GC-123456" })).resolves.toMatchObject({ status: "paid" });
      await expect(movePayout(p.id, "paid", { ref: "GC-123456" })).resolves.toMatchObject({ duplicate: true });
      expect(await phpWallet(db.pool, user)).toEqual({ available: 7000, reserved: 0, paid: 5000 });

      await movePayout(p.id, "refunded", { reason: "Bounced by the wallet provider" });
      expect(await phpWallet(db.pool, user)).toEqual({ available: 12_000, reserved: 0, paid: 0 });
    });

    it("returns the amount when a payout is cancelled, rejected or fails", async () => {
      const user = await playerWithApprovedBalance(10_000);
      const a = await payout(user, 2000);
      const b = await payout(user, 2000);
      const c = await payout(user, 2000);
      await call(db.pool, user, "select public.cancel_payout($1) as result", [a.id]);
      await movePayout(b.id, "rejected", { reason: "Account name mismatch" });
      await movePayout(c.id, "approved");
      await movePayout(c.id, "processing");
      await expect(rejectsWith(call(db.pool, user, "select public.cancel_payout($1) as result", [c.id]))).resolves.toBe("VE020");
      await movePayout(c.id, "failed", { reason: "Provider timeout" });
      expect(await phpWallet(db.pool, user)).toEqual({ available: 12_000, reserved: 0, paid: 0 });

      const events = await db.pool.query("select to_status from public.payout_events where payout_id = $1 order by created_at", [c.id]);
      expect(events.rows.map((r) => r.to_status)).toEqual(["pending", "approved", "processing", "failed"]);
    });

    it("never exposes account details to players and audits admin reads", async () => {
      const user = await playerWithApprovedBalance(5000);
      const p = await payout(user, 2000);

      await expect(
        rejectsWith(asRole(db.pool, user, (c) => c.query("select account_details from public.payout_requests"))),
      ).resolves.toBe("42501");
      const mine = await call<Record<string, unknown>[]>(db.pool, user, "select public.list_my_payouts(10) as result");
      expect(mine[0]).not.toHaveProperty("accountDetails");
      expect(mine[0]).toMatchObject({ accountHint: "•••• 1234", methodName: "GCash" });

      const detail = await call<{ accountDetails: string }>(db.pool, admin, "select public.ve_admin_get_payout($1) as result", [p.id]);
      expect(detail.accountDetails).toBe(CIPHERTEXT);
      const { rows } = await db.pool.query("select count(*)::int as n from public.audit_logs where action = 'payout.view_details' and target_id = $1", [p.id]);
      expect(rows[0].n).toBe(1);

      await expect(
        rejectsWith(call(db.pool, user, "select public.request_payout($1, 2000, 'plain text', 'x', gen_random_uuid()) as result", [gcash])),
      ).resolves.toBe("23514");
    });

    it("is refused while redemption is switched off, but admins can still settle open requests", async () => {
      const user = await playerWithApprovedBalance(5000);
      const p = await payout(user, 2000);
      await setPolicy({ ...POLICY, enabled: false });
      await expect(rejectsWith(payout(user, 2000))).resolves.toBe("VE014");
      await expect(movePayout(p.id, "rejected", { reason: "Program paused" })).resolves.toMatchObject({ status: "rejected" });
      await setPolicy(POLICY);
    });
  });

  describe("integrity", () => {
    it("reports no ledger discrepancies, and flags a tampered balance", async () => {
      await expect(call(db.pool, admin, "select public.ve_admin_ledger_check() as result")).resolves.toEqual([]);
      const user = await createUser(db.pool);
      await db.pool.query("update public.wallets set balance_coins = 99 where user_id = $1", [user]);
      const issues = await call<{ userId: string }[]>(db.pool, admin, "select public.ve_admin_ledger_check() as result");
      expect(issues.map((i) => i.userId)).toEqual([user]);

      const overview = await call<{ redemptionEnabled: boolean; conversions: Record<string, unknown> }>(
        db.pool, admin, "select public.ve_admin_finance_overview() as result",
      );
      expect(overview.redemptionEnabled).toBe(true);
      expect(overview.conversions).toHaveProperty("completed");
    });

    it("summarises earnings by source for the player", async () => {
      const user = await playerWithApprovedBalance(5000);
      const breakdown = await call<Record<string, unknown>>(db.pool, user, "select public.get_earnings_breakdown() as result");
      expect(breakdown).toMatchObject({ availableCoins: 0, reservedCoins: 0, approvedCentavos: 6000, redemptionEnabled: true });
    });
  });
});
