import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asRole,
  balanceOf,
  clearCooldown,
  createTestDatabase,
  createUser,
  disableAchievements,
  hasDatabase,
  ledgerSum,
  sqlState,
  tap,
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

async function setLevel(pool: Pool, userId: string, xp: number): Promise<void> {
  await pool.query("update public.player_progress set xp_total = $2 where user_id = $1", [userId, xp]);
}

/** Moves a robot's earning start back in time (superuser only). */
async function ageRobot(pool: Pool, userRobotId: string, hours: number): Promise<void> {
  await pool.query(
    "update public.user_robots set earning_since = earning_since - make_interval(secs => $2::numeric * 3600) where id = $1",
    [userRobotId, hours],
  );
}

async function robotId(pool: Pool, slug: string): Promise<string> {
  return (await pool.query("select id from public.robots where slug = $1", [slug])).rows[0].id;
}

interface PurchaseResult {
  success: boolean;
  duplicate: boolean;
  transactionId: string;
  userRobotId: string;
  activated: boolean;
  priceCoins: number;
  balanceCoins: number;
}

interface CollectResult {
  duplicate: boolean;
  transactionId: string;
  collectedCoins: number;
  robotsPaid: number;
}

describe.skipIf(!hasDatabase)("robot workers", () => {
  let db: TestDatabase;
  let admin: string;
  let scout: string;
  let worker: string;

  const buy = (user: string, robot: string, key: string = randomUUID()) =>
    call<PurchaseResult>(db.pool, user, "select public.purchase_robot($1, $2) as result", [robot, key]);
  const collect = (user: string, key: string = randomUUID()) =>
    call<CollectResult>(db.pool, user, "select public.collect_robot_earnings($1) as result", [key]);
  const toggle = (user: string, userRobot: string, active: boolean, key: string = randomUUID()) =>
    call<{ isActive: boolean; paidCoins: number }>(
      db.pool, user, "select public.set_robot_active($1, $2, $3) as result", [userRobot, active, key],
    );

  beforeAll(async () => {
    db = await createTestDatabase();
    await disableAchievements(db.pool);
    admin = await createUser(db.pool, { username: "robot_admin" });
    await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin') on conflict (user_id) do update set role = 'admin'", [admin]);
    scout = await robotId(db.pool, "scout-bot");
    worker = await robotId(db.pool, "worker-bot");
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe("tap rebalance", () => {
    it("pays the reduced default and enforces the per-minute burst limit", async () => {
      const user = await createUser(db.pool);
      await expect(tap(db.pool, user)).resolves.toMatchObject({ rewardCoins: 2 });

      await db.pool.query("update public.tap_state set minute_taps = 40, minute_window_start = now(), last_tap_at = now() - interval '5 seconds' where user_id = $1", [user]);
      await expect(rejectsWith(tap(db.pool, user))).resolves.toBe("VE016");

      // A new minute window accepts taps again.
      await db.pool.query("update public.tap_state set minute_window_start = now() - interval '61 seconds' where user_id = $1", [user]);
      await clearCooldown(db.pool, user);
      await expect(tap(db.pool, user)).resolves.toMatchObject({ rewardCoins: 2 });
      expect(await balanceOf(db.pool, user)).toBe(4);
    });
  });

  describe("shop", () => {
    it("lists tiers with higher prices for higher yields and per-player status", async () => {
      const user = await createUser(db.pool);
      const shop = await call<{ robots: { slug: string; priceCoins: number; coinsPerHour: number; coinsPer24h: number; status: string; blocker: string | null }[] }>(
        db.pool, user, "select public.list_robot_shop() as result",
      );
      const tiers = shop.robots.filter((r) => r.slug.endsWith("-bot"));
      expect(tiers.map((r) => r.slug)).toEqual(["scout-bot", "worker-bot", "forge-bot", "titan-bot", "nova-bot"]);
      for (let i = 1; i < tiers.length; i += 1) {
        expect(tiers[i].priceCoins).toBeGreaterThan(tiers[i - 1].priceCoins);
        expect(tiers[i].coinsPerHour).toBeGreaterThan(tiers[i - 1].coinsPerHour);
      }
      expect(tiers[0]).toMatchObject({ coinsPer24h: 240, status: "available", blocker: null });
      expect(tiers[1].blocker).toBe("level");
    });

    it("deducts the price atomically, activates the robot and is idempotent", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 600);
      const key = randomUUID();
      const first = await buy(user, scout, key);
      expect(first).toMatchObject({ success: true, duplicate: false, priceCoins: 500, balanceCoins: 100, activated: true });

      const replay = await buy(user, scout, key);
      expect(replay).toMatchObject({ duplicate: true, transactionId: first.transactionId, userRobotId: first.userRobotId });
      expect(await balanceOf(db.pool, user)).toBe(100);
      expect(await ledgerSum(db.pool, user)).toBe(100);

      const { rows } = await db.pool.query(
        "select type, amount_coins::int as amount, source_id from public.transactions where id = $1",
        [first.transactionId],
      );
      expect(rows[0]).toEqual({ type: "robot_purchase", amount: -500, source_id: scout });
    });

    it("refuses unaffordable, level-locked, over-limit and unlisted robots", async () => {
      const user = await createUser(db.pool);
      await expect(rejectsWith(buy(user, scout))).resolves.toBe("VE008");
      await credit(db.pool, user, 10_000);
      await expect(rejectsWith(buy(user, worker))).resolves.toBe("VE009");
      await expect(rejectsWith(buy(user, randomUUID()))).resolves.toBe("VE012");

      for (let i = 0; i < 5; i += 1) await buy(user, scout);
      await expect(rejectsWith(buy(user, scout))).resolves.toBe("VE017");
      expect(await balanceOf(db.pool, user)).toBe(10_000 - 5 * 500);
    });

    it("buys a burst of different requests only as far as the balance allows", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 1_200);
      const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => buy(user, scout)));
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(2);
      expect(await balanceOf(db.pool, user)).toBe(200);
      expect(await ledgerSum(db.pool, user)).toBe(200);
    });

    it("keeps more than the active limit inactive", async () => {
      const user = await createUser(db.pool);
      await setLevel(db.pool, user, 1000);
      await credit(db.pool, user, 20_000);
      const results: PurchaseResult[] = [];
      for (let i = 0; i < 5; i += 1) results.push(await buy(user, scout));
      results.push(await buy(user, worker));
      expect(results.map((r) => r.activated)).toEqual([true, true, true, true, true, false]);
      await expect(rejectsWith(toggle(user, results[5].userRobotId, true))).resolves.toBe("VE017");
    });
  });

  describe("generator", () => {
    it("accrues from server time, pays once per key and keeps fractions", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 500);
      const { userRobotId } = await buy(user, scout);
      await ageRobot(db.pool, userRobotId, 1.5); // 15 VC at 10 VC/h

      const status = await call<{ totals: { pendingCoins: number; coinsPerHour: number; activeCount: number } }>(
        db.pool, user, "select public.get_robot_generator() as result",
      );
      expect(status.totals).toMatchObject({ pendingCoins: 15, coinsPerHour: 10, activeCount: 1 });

      const key = randomUUID();
      const results = await Promise.all(Array.from({ length: 5 }, () => collect(user, key)));
      expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
      expect(results[0]).toMatchObject({ collectedCoins: 15, robotsPaid: 1 });
      expect(await balanceOf(db.pool, user)).toBe(15);

      // Nothing new accrued yet: a different key gets VE015, not a second payout.
      await expect(rejectsWith(collect(user))).resolves.toBe("VE015");

      const { rows } = await db.pool.query(
        "select coins::int, reason from public.robot_earnings where user_robot_id = $1",
        [userRobotId],
      );
      expect(rows).toEqual([{ coins: 15, reason: "collect" }]);
      expect(await ledgerSum(db.pool, user)).toBe(await balanceOf(db.pool, user));
    });

    it("carries the unpaid fraction of a coin into the next collection", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 500);
      const { userRobotId } = await buy(user, scout);
      await ageRobot(db.pool, userRobotId, 0.15); // 1.5 VC -> pays 1, keeps 0.5
      await expect(collect(user)).resolves.toMatchObject({ collectedCoins: 1 });
      await ageRobot(db.pool, userRobotId, 0.05); // 0.5 kept + 0.5 new
      await expect(collect(user)).resolves.toMatchObject({ collectedCoins: 1 });
    });

    it("stops accruing at the storage cap", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 500);
      const { userRobotId } = await buy(user, scout);
      await ageRobot(db.pool, userRobotId, 100);
      await expect(collect(user)).resolves.toMatchObject({ collectedCoins: 240 }); // 24h cap
    });

    it("pays accrued coins on deactivation and stops earning", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 500);
      const { userRobotId } = await buy(user, scout);
      await ageRobot(db.pool, userRobotId, 2);

      const key = randomUUID();
      await expect(toggle(user, userRobotId, false, key)).resolves.toMatchObject({ isActive: false, paidCoins: 20 });
      await expect(toggle(user, userRobotId, false, key)).resolves.toMatchObject({ isActive: false, paidCoins: 20 });
      await expect(toggle(user, userRobotId, false)).resolves.toMatchObject({ isActive: false, paidCoins: 0 });
      expect(await balanceOf(db.pool, user)).toBe(20);
      await expect(rejectsWith(collect(user))).resolves.toBe("VE015");

      await expect(toggle(user, userRobotId, true)).resolves.toMatchObject({ isActive: true });
    });

    it("refuses another player's robot and direct writes", async () => {
      const owner = await createUser(db.pool);
      const other = await createUser(db.pool);
      await credit(db.pool, owner, 500);
      const { userRobotId } = await buy(owner, scout);

      await expect(rejectsWith(toggle(other, userRobotId, false))).resolves.toBe("VE012");
      const seen = await asRole(db.pool, other, async (c) =>
        (await c.query("select count(*)::int as n from public.user_robots where id = $1", [userRobotId])).rows[0].n,
      );
      expect(seen).toBe(0);
      await expect(
        rejectsWith(call(db.pool, owner, "update public.user_robots set coins_per_hour = 999999 returning 1 as result")),
      ).resolves.toBe("42501");
      await expect(
        rejectsWith(call(db.pool, owner, "insert into public.robot_earnings (user_id, user_robot_id, coins, period_start, period_end, transaction_id, reason) values ($1, $2, 5, now(), now(), gen_random_uuid(), 'collect') returning 1 as result", [owner, userRobotId])),
      ).resolves.toBe("42501");
    });

    it("is blocked when the robots feature is off or during maintenance", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 500);
      const { userRobotId } = await buy(user, scout);
      await ageRobot(db.pool, userRobotId, 1);

      const flags = { dailyBonus: true, idleGenerator: true, leaderboard: true, robots: false, shop: true };
      await call(db.pool, admin, "select public.ve_admin_update_feature_flags($1::jsonb) as result", [JSON.stringify(flags)]);
      await expect(rejectsWith(collect(user))).resolves.toBe("VE014");
      await call(db.pool, admin, "select public.ve_admin_update_feature_flags($1::jsonb) as result", [
        JSON.stringify({ ...flags, robots: true }),
      ]);
      await expect(collect(user)).resolves.toMatchObject({ collectedCoins: 10 });
    });
  });

  describe("admin", () => {
    const robot = (overrides: Record<string, unknown> = {}) => ({
      slug: `bot-${randomUUID().slice(0, 8)}`,
      name: "Test Bot",
      description: "",
      tier: "rare",
      imageKey: "mech",
      priceCoins: 5000,
      coinsPerHour: 100,
      maxPerUser: 2,
      levelRequired: 1,
      status: "draft",
      sortOrder: 99,
      ...overrides,
    });
    const save = (id: string | null, body: unknown, as: string = admin) =>
      call<{ id: string; priceCoins: number }>(db.pool, as, "select public.ve_admin_save_robot($1, $2) as result", [id, JSON.stringify(body)]);

    it("creates and edits listings with an audit trail, keeping owned rates", async () => {
      const created = await save(null, robot());
      await save(created.id, robot({ slug: "renamed-bot", coinsPerHour: 120, priceCoins: 6000, status: "active" }));
      const { rows } = await db.pool.query("select action from public.audit_logs where target_id = $1 order by created_at", [created.id]);
      expect(rows.map((r) => r.action)).toEqual(["robot.create", "robot.status"]);

      const user = await createUser(db.pool);
      await credit(db.pool, user, 6000);
      const bought = await buy(user, created.id);
      await save(created.id, robot({ slug: "renamed-bot", coinsPerHour: 110, priceCoins: 5500, status: "active" }));
      const owned = await db.pool.query("select coins_per_hour from public.user_robots where id = $1", [bought.userRobotId]);
      expect(owned.rows[0].coins_per_hour).toBe(120);
      await save(created.id, robot({ slug: "renamed-bot", status: "archived" }));
    });

    it("rejects a listing that earns more but costs no more than another", async () => {
      // Forge Bot earns 180/h for 7,500 VC.
      await expect(rejectsWith(save(null, robot({ coinsPerHour: 200, priceCoins: 7000 })))).resolves.toBe("VE011");
      await expect(rejectsWith(save(null, robot({ coinsPerHour: 170, priceCoins: 8000 })))).resolves.toBe("VE011");
      await expect(rejectsWith(save(null, robot({ imageKey: "unknown" })))).resolves.toBe("23514");
      await expect(rejectsWith(save(null, robot({ priceCoins: 0 })))).resolves.toBe("22023");
    });

    it("updates the robot policy and is closed to non-admins", async () => {
      const player = await createUser(db.pool);
      await expect(rejectsWith(save(null, robot(), player))).resolves.toBe("42501");
      await expect(rejectsWith(call(db.pool, player, "select public.ve_admin_list_robots() as result"))).resolves.toBe("42501");
      const update = (policy: unknown, as: string = admin) =>
        call(db.pool, as, "select public.ve_admin_update_robot_policy($1) as result", [JSON.stringify(policy)]);
      await expect(rejectsWith(update({ maxOwned: 2, maxActive: 3, accrualCapHours: 24 }))).resolves.toBe("22023");
      await expect(rejectsWith(update({ maxOwned: 20, maxActive: 5, accrualCapHours: 24 }, player))).resolves.toBe("42501");
      await expect(update({ maxOwned: 20, maxActive: 6, accrualCapHours: 12 })).resolves.toEqual({
        maxOwned: 20, maxActive: 6, accrualCapHours: 12,
      });
      await update({ maxOwned: 15, maxActive: 5, accrualCapHours: 24 });

      const activity = await call<{ purchases: unknown[]; earnings: unknown[] }>(
        db.pool, admin, "select public.ve_admin_robot_activity(20) as result",
      );
      expect(activity.purchases.length).toBeGreaterThan(0);
      expect(activity.earnings.length).toBeGreaterThan(0);
    });
  });
});
