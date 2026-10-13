import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asRole,
  clearCooldown,
  createTestDatabase,
  createUser,
  disableAchievements,
  hasDatabase,
  sqlState,
  tap,
  type TestDatabase,
} from "./support/database";

describe.skipIf(!hasDatabase)("read models", () => {
  let db: TestDatabase;
  let user: string;
  let other: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    // Tap mechanics are asserted in isolation from achievement bonuses.
    await disableAchievements(db.pool);
    user = await createUser(db.pool);
    other = await createUser(db.pool);
    for (let i = 0; i < 3; i += 1) {
      await clearCooldown(db.pool, user);
      await tap(db.pool, user);
    }
    await tap(db.pool, other);
    // A historical reward two days ago, plus a negative correction today.
    await db.pool.query(
      `insert into public.transactions (user_id, amount_coins, type, source_type, idempotency_key, created_at)
       values ($1, 40, 'mission_reward', 'mission', $2, now() - interval '2 days'),
              ($1, -5, 'admin_adjustment', 'admin', $3, now())`,
      [user, randomUUID(), randomUUID()],
    );
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe("get_dashboard_summary", () => {
    it("summarises only the caller's own activity", async () => {
      const summary = await asRole(db.pool, user, async (c) =>
        (await c.query("select public.get_dashboard_summary() as s")).rows[0].s,
      );
      expect(summary).toMatchObject({
        balanceCoins: 30,
        totalEarnedCoins: 70,
        todayEarnedCoins: 30,
        actionsCompleted: 3,
        tapsToday: 3,
        currency: "VC",
        redeemable: false,
        policy: { rewardCoins: 10, cooldownMs: 1000, dailyLimit: 1000 },
      });
    });
  });

  describe("get_reward_series", () => {
    it("returns a zero-filled daily series of positive rewards", async () => {
      const rows = await asRole(db.pool, user, async (c) =>
        (await c.query("select day::text, coins::int from public.get_reward_series(7)")).rows,
      );
      expect(rows).toHaveLength(7);
      expect(rows.at(-1)?.coins).toBe(30);
      expect(rows.at(-3)?.coins).toBe(40);
      expect(rows.slice(0, 4).every((r) => r.coins === 0)).toBe(true);
    });

    it("rejects out-of-range windows", async () => {
      const error = await asRole(db.pool, user, (c) => c.query("select * from public.get_reward_series(365)")).catch(
        (e: unknown) => e,
      );
      expect(sqlState(error)).toBe("22023");
    });
  });

  describe("list_transactions", () => {
    const page = (sql: string, params: unknown[] = []) =>
      asRole(db.pool, user, async (c) => (await c.query(sql, params)).rows);

    it("pages through the ledger with a stable keyset cursor", async () => {
      const all = await page("select id, created_at from public.list_transactions(100)");
      expect(all).toHaveLength(5);

      const seen: string[] = [];
      let cursor: { created_at: Date; id: string } | undefined;
      for (;;) {
        const rows = cursor
          ? await page("select id, created_at from public.list_transactions(2, $1, $2)", [cursor.created_at, cursor.id])
          : await page("select id, created_at from public.list_transactions(2)");
        if (rows.length === 0) break;
        seen.push(...rows.map((r) => r.id));
        cursor = rows.at(-1);
      }
      expect(seen).toEqual(all.map((r) => r.id));
      expect(new Set(seen).size).toBe(5);
    });

    it("filters by type and date", async () => {
      const taps = await page("select type from public.list_transactions(100, null, null, 'tap_reward')");
      expect(taps).toHaveLength(3);

      const older = await page(
        "select type from public.list_transactions(100, null, null, null, null, (timezone('utc', now())::date - 1))",
      );
      expect(older.map((r) => r.type)).toEqual(["mission_reward"]);
    });

    it("validates its arguments", async () => {
      for (const sql of [
        "select * from public.list_transactions(0)",
        "select * from public.list_transactions(101)",
        `select * from public.list_transactions(10, now(), null)`,
        "select * from public.list_transactions(10, null, null, null, current_date, current_date - 1)",
      ]) {
        const error = await page(sql).catch((e: unknown) => e);
        expect(sqlState(error), sql).toBe("22023");
      }
    });

    it("never returns another user's entries", async () => {
      const rows = await asRole(db.pool, other, async (c) =>
        (await c.query("select id from public.list_transactions(100)")).rows,
      );
      expect(rows).toHaveLength(1);
    });
  });
});
