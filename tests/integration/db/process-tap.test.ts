import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asRole,
  balanceOf,
  clearCooldown,
  createTestDatabase,
  createUser,
  disableAchievements,
  hasDatabase,
  ledgerCount,
  ledgerSum,
  sqlState,
  tap,
  type TestDatabase,
} from "./support/database";

describe.skipIf(!hasDatabase)("process_tap", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    // Tap mechanics are asserted in isolation from achievement bonuses.
    await disableAchievements(db.pool);
  });

  afterAll(async () => {
    await db?.drop();
  });

  it("credits exactly 10 VC per accepted tap and records a ledger entry", async () => {
    const user = await createUser(db.pool);
    const result = await tap(db.pool, user);

    expect(result).toMatchObject({
      success: true,
      duplicate: false,
      rewardCoins: 10,
      balanceCoins: 10,
      tapsToday: 1,
      currency: "VC",
      redeemable: false,
    });
    expect(await balanceOf(db.pool, user)).toBe(10);

    const { rows } = await db.pool.query(
      "select type, source_type, amount_coins::int as amount from public.transactions where id = $1",
      [result.transactionId],
    );
    expect(rows[0]).toEqual({ type: "tap_reward", source_type: "tap", amount: 10 });
  });

  it("does not reward the same idempotency key twice", async () => {
    const user = await createUser(db.pool);
    const key = randomUUID();
    const first = await tap(db.pool, user, key);
    await clearCooldown(db.pool, user);
    const replay = await tap(db.pool, user, key);

    expect(replay.duplicate).toBe(true);
    expect(replay.transactionId).toBe(first.transactionId);
    expect(replay.balanceCoins).toBe(10);
    expect(await ledgerCount(db.pool, user)).toBe(1);
  });

  it("rejects a tap during the cooldown and leaves the balance unchanged", async () => {
    const user = await createUser(db.pool);
    await tap(db.pool, user);
    await db.pool.query("update public.tap_state set last_tap_at = now() where user_id = $1", [user]);

    const error = await tap(db.pool, user).catch((e: unknown) => e);
    expect(sqlState(error)).toBe("VE001");
    expect(await balanceOf(db.pool, user)).toBe(10);

    await clearCooldown(db.pool, user);
    expect((await tap(db.pool, user)).balanceCoins).toBe(20);
  });

  it("rejects taps once the daily limit is reached", async () => {
    const user = await createUser(db.pool);
    await db.pool.query(
      `update public.tap_state
          set taps_today = 1000, activity_date = timezone('utc', now())::date, last_tap_at = null
        where user_id = $1`,
      [user],
    );

    const error = await tap(db.pool, user).catch((e: unknown) => e);
    expect(sqlState(error)).toBe("VE002");
    expect(await balanceOf(db.pool, user)).toBe(0);
  });

  it("resets the daily counter and cooldown at the UTC day boundary", async () => {
    const user = await createUser(db.pool);
    await db.pool.query(
      `update public.tap_state
          set taps_today = 1000,
              activity_date = timezone('utc', now())::date - 1,
              last_tap_at = now()
        where user_id = $1`,
      [user],
    );

    const result = await tap(db.pool, user);
    expect(result.tapsToday).toBe(1);
    expect(result.balanceCoins).toBe(10);
  });

  it("requires an authenticated caller", async () => {
    const error = await asRole(db.pool, null, (client) =>
      client.query("select public.process_tap($1)", [randomUUID()]),
    ).catch((e: unknown) => e);
    // anon has no EXECUTE privilege at all.
    expect(sqlState(error)).toBe("42501");
  });

  it("rejects a missing idempotency key", async () => {
    const user = await createUser(db.pool);
    const error = await asRole(db.pool, user, (client) =>
      client.query("select public.process_tap(null)"),
    ).catch((e: unknown) => e);
    expect(sqlState(error)).toBe("22023");
  });

  it("refuses to replay a key that belongs to another operation type", async () => {
    const user = await createUser(db.pool);
    const key = randomUUID();
    await db.pool.query(
      `insert into public.transactions (user_id, amount_coins, type, source_type, idempotency_key)
       values ($1, 5, 'admin_adjustment', 'admin', $2)`,
      [user, key],
    );
    const error = await tap(db.pool, user, key).catch((e: unknown) => e);
    expect(sqlState(error)).toBe("VE003");
  });

  it("rolls back the ledger and tap state when the wallet update fails", async () => {
    const user = await createUser(db.pool);
    await db.pool.query(`
      create function public.test_fail_wallet_update() returns trigger language plpgsql as $$
      begin raise exception 'simulated failure'; end; $$;
      create trigger test_fail before update on public.wallets
        for each row execute function public.test_fail_wallet_update();
    `);

    try {
      const error = await tap(db.pool, user).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(await ledgerCount(db.pool, user)).toBe(0);
      const { rows } = await db.pool.query(
        "select taps_today, last_tap_at from public.tap_state where user_id = $1",
        [user],
      );
      expect(rows[0]).toEqual({ taps_today: 0, last_tap_at: null });
    } finally {
      await db.pool.query(`
        drop trigger test_fail on public.wallets;
        drop function public.test_fail_wallet_update();
      `);
    }
  });

  describe("concurrency", () => {
    it("awards a burst of identical requests exactly once", async () => {
      const user = await createUser(db.pool);
      const key = randomUUID();
      const results = await Promise.all(Array.from({ length: 10 }, () => tap(db.pool, user, key)));

      expect(results.every((r) => r.success)).toBe(true);
      expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
      expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
      expect(await ledgerCount(db.pool, user)).toBe(1);
      expect(await balanceOf(db.pool, user)).toBe(10);
    });

    it("accepts only one of a burst of different requests within the cooldown", async () => {
      const user = await createUser(db.pool);
      const outcomes = await Promise.allSettled(Array.from({ length: 10 }, () => tap(db.pool, user)));

      const accepted = outcomes.filter((o) => o.status === "fulfilled");
      const rejected = outcomes.filter((o) => o.status === "rejected");
      expect(accepted).toHaveLength(1);
      for (const r of rejected) {
        expect(sqlState((r as PromiseRejectedResult).reason)).toBe("VE001");
      }
      expect(await balanceOf(db.pool, user)).toBe(10);
    });

    it("keeps the wallet reconciled with the ledger", async () => {
      const user = await createUser(db.pool);
      for (let i = 0; i < 5; i += 1) {
        await clearCooldown(db.pool, user);
        await Promise.allSettled([tap(db.pool, user), tap(db.pool, user), tap(db.pool, user)]);
      }
      expect(await balanceOf(db.pool, user)).toBe(await ledgerSum(db.pool, user));
      expect(await balanceOf(db.pool, user)).toBe(50);
    });
  });
});
