import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

async function makeAdmin(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    "insert into public.user_roles (user_id, role) values ($1, 'admin') on conflict (user_id) do update set role = 'admin'",
    [userId],
  );
}

async function credit(pool: Pool, userId: string, amount: number): Promise<void> {
  await pool.query(
    `insert into public.transactions (user_id, amount_coins, type, source_type, idempotency_key)
     values ($1, $2, 'admin_adjustment', 'test', gen_random_uuid())`,
    [userId, amount],
  );
  await pool.query("update public.wallets set balance_coins = balance_coins + $2 where user_id = $1", [userId, amount]);
}

/** Moves the generator's last collection back in time (superuser only). */
async function ageGenerator(pool: Pool, userId: string, hours: number): Promise<void> {
  await pool.query(
    "update public.player_generators set last_claimed_at = now() - make_interval(secs => $2 * 3600) where user_id = $1",
    [userId, hours],
  );
}

const ALL_ON = { dailyBonus: true, idleGenerator: true, leaderboard: true, robots: true, shop: true };

interface GeneratorStatus {
  level: number;
  coinsPerHour: number;
  pendingCoins: number;
  nextUpgradeCost: number | null;
}

describe.skipIf(!hasDatabase)("operations: flags, maintenance, generator, scheduling, analytics", () => {
  let db: TestDatabase;
  let admin: string;

  const setFlags = (flags: Record<string, unknown>) =>
    call(db.pool, admin, "select public.ve_admin_update_feature_flags($1::jsonb) as result", [JSON.stringify(flags)]);
  const setMaintenance = (enabled: boolean, message = "") =>
    call(db.pool, admin, "select public.ve_admin_set_maintenance($1, $2) as result", [enabled, message]);

  beforeAll(async () => {
    db = await createTestDatabase();
    await disableAchievements(db.pool);
    admin = await createUser(db.pool);
    await makeAdmin(db.pool, admin);
  });

  afterAll(async () => {
    await db?.drop();
  });

  beforeEach(async () => {
    await setFlags(ALL_ON);
    await setMaintenance(false);
  });

  describe("maintenance mode", () => {
    it("pauses every reward but not admin adjustments, and is audited", async () => {
      const user = await createUser(db.pool);
      await setMaintenance(true, "Upgrading servers");

      await expect(rejectsWith(tap(db.pool, user))).resolves.toBe("VE007");
      await expect(
        rejectsWith(call(db.pool, user, "select public.claim_daily_bonus($1) as result", [randomUUID()])),
      ).resolves.toBe("VE007");
      expect(await balanceOf(db.pool, user)).toBe(0);

      await expect(
        call(db.pool, admin, "select public.ve_admin_adjust_balance($1, 25, 'Goodwill credit', $2) as result", [user, randomUUID()]),
      ).resolves.toMatchObject({ balanceCoins: 25 });

      await expect(call(db.pool, user, "select public.get_app_config() as result")).resolves.toMatchObject({
        maintenance: { enabled: true, message: "Upgrading servers" },
      });

      await setMaintenance(false);
      await clearCooldown(db.pool, user);
      await expect(tap(db.pool, user)).resolves.toMatchObject({ success: true });
      expect(await ledgerSum(db.pool, user)).toBe(await balanceOf(db.pool, user));

      const { rows } = await db.pool.query(
        "select action from public.audit_logs where action like 'settings.maintenance%' order by created_at desc limit 2",
      );
      expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["settings.maintenance_on", "settings.maintenance_off"]));
    });

    it("rejects long messages and non-admins", async () => {
      await expect(rejectsWith(setMaintenance(true, "x".repeat(201)))).resolves.toBe("22023");
      const player = await createUser(db.pool);
      await expect(
        rejectsWith(call(db.pool, player, "select public.ve_admin_set_maintenance(true, 'hi') as result")),
      ).resolves.toBe("42501");
      await expect(
        rejectsWith(call(db.pool, null, "select public.ve_admin_set_maintenance(true, 'hi') as result")),
      ).resolves.toBeDefined();
    });
  });

  describe("feature flags", () => {
    it("blocks the flagged ledger types only", async () => {
      const user = await createUser(db.pool);
      await setFlags({ ...ALL_ON, dailyBonus: false, idleGenerator: false });

      await expect(
        rejectsWith(call(db.pool, user, "select public.claim_daily_bonus($1) as result", [randomUUID()])),
      ).resolves.toBe("VE014");
      await credit(db.pool, user, 500);
      await expect(
        rejectsWith(call(db.pool, user, "select public.upgrade_generator($1) as result", [randomUUID()])),
      ).resolves.toBe("VE014");
      await expect(tap(db.pool, user)).resolves.toMatchObject({ success: true });

      await expect(call(db.pool, user, "select public.feature_flags() as result")).resolves.toMatchObject({
        dailyBonus: false,
        idleGenerator: false,
        shop: true,
      });
    });

    it("requires exactly the five boolean flags", async () => {
      await expect(rejectsWith(setFlags({ ...ALL_ON, extra: true }))).resolves.toBe("22023");
      await expect(rejectsWith(setFlags({ ...ALL_ON, shop: "no" }))).resolves.toBe("22023");
      await expect(rejectsWith(setFlags({ dailyBonus: true }))).resolves.toBe("22023");
    });
  });

  describe("idle generator", () => {
    it("is bought with virtual coins, accrues up to the cap, and collects idempotently", async () => {
      const user = await createUser(db.pool);
      await expect(call(db.pool, user, "select public.get_generator_status() as result")).resolves.toMatchObject({
        level: 0,
        pendingCoins: 0,
        nextUpgradeCost: 150,
      });

      await expect(
        rejectsWith(call(db.pool, user, "select public.upgrade_generator($1) as result", [randomUUID()])),
      ).resolves.toBe("VE008");
      await expect(
        rejectsWith(call(db.pool, user, "select public.collect_generator($1) as result", [randomUUID()])),
      ).resolves.toBe("VE012");

      await credit(db.pool, user, 200);
      const buyKey = randomUUID();
      await expect(call(db.pool, user, "select public.upgrade_generator($1) as result", [buyKey])).resolves.toMatchObject({
        duplicate: false,
        generatorLevel: 1,
        costCoins: 150,
        balanceCoins: 50,
      });
      await expect(call(db.pool, user, "select public.upgrade_generator($1) as result", [buyKey])).resolves.toMatchObject({
        duplicate: true,
        generatorLevel: 1,
      });
      expect(await balanceOf(db.pool, user)).toBe(50);

      await expect(
        rejectsWith(call(db.pool, user, "select public.collect_generator($1) as result", [randomUUID()])),
      ).resolves.toBe("VE015");

      // 20 hours idle is capped at 8 hours: 6 VC/h x 8 h = 48 VC.
      await ageGenerator(db.pool, user, 20);
      const status = await call<GeneratorStatus>(db.pool, user, "select public.get_generator_status() as result");
      expect(status).toMatchObject({ level: 1, coinsPerHour: 6, pendingCoins: 48, nextUpgradeCost: 600 });

      const key = randomUUID();
      await expect(call(db.pool, user, "select public.collect_generator($1) as result", [key])).resolves.toMatchObject({
        duplicate: false,
        collectedCoins: 48,
        balanceCoins: 98,
      });
      await expect(call(db.pool, user, "select public.collect_generator($1) as result", [key])).resolves.toMatchObject({
        duplicate: true,
        collectedCoins: 48,
      });
      expect(await balanceOf(db.pool, user)).toBe(98);
      expect(await ledgerSum(db.pool, user)).toBe(98);
    });

    it("stops at the maximum level and rejects keys reused across actions", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 1_000_000);
      for (let level = 1; level <= 10; level += 1) {
        await call(db.pool, user, "select public.upgrade_generator($1) as result", [randomUUID()]);
      }
      await expect(
        rejectsWith(call(db.pool, user, "select public.upgrade_generator($1) as result", [randomUUID()])),
      ).resolves.toBe("VE011");
      await expect(call(db.pool, user, "select public.get_generator_status() as result")).resolves.toMatchObject({
        level: 10,
        coinsPerHour: 60,
        nextUpgradeCost: null,
      });

      await ageGenerator(db.pool, user, 1);
      const tapKey = randomUUID();
      await tap(db.pool, user, tapKey);
      await expect(
        rejectsWith(call(db.pool, user, "select public.collect_generator($1) as result", [tapKey])),
      ).resolves.toBe("VE003");
    });

    it("keeps generator rows private and writes only through functions", async () => {
      const owner = await createUser(db.pool);
      const other = await createUser(db.pool);
      await credit(db.pool, owner, 200);
      await call(db.pool, owner, "select public.upgrade_generator($1) as result", [randomUUID()]);

      await expect(call(db.pool, other, "select count(*)::int as result from public.player_generators")).resolves.toBe(0);
      await expect(
        rejectsWith(call(db.pool, owner, "update public.player_generators set level = 10 returning 1 as result")),
      ).resolves.toBe("42501");
      await expect(
        rejectsWith(call(db.pool, null, "select public.get_generator_status() as result")),
      ).resolves.toBeDefined();
    });
  });

  describe("scheduled publishing", () => {
    async function createMission(slug: string): Promise<string> {
      const { rows } = await db.pool.query(
        `insert into public.tasks (slug, title, objective_type, objective_target, reward_coins, frequency, status)
         values ($1, 'Scheduled mission', 'taps', 1, 5, 'daily', 'published') returning id`,
        [slug],
      );
      return rows[0].id;
    }

    const missionSlugs = async (user: string) =>
      ((await call<{ slug: string }[]>(db.pool, user, "select public.list_missions() as result")) ?? []).map((m) => m.slug);

    it("hides missions outside their window and refuses to pay them", async () => {
      const user = await createUser(db.pool);
      await tap(db.pool, user);
      const future = await createMission("starts-tomorrow");
      const past = await createMission("ended-yesterday");

      await call(db.pool, admin, "select public.ve_admin_schedule_task($1, now() + interval '1 day', null) as result", [future]);
      await call(
        db.pool,
        admin,
        "select public.ve_admin_schedule_task($1, now() - interval '2 days', now() - interval '1 day') as result",
        [past],
      );

      const slugs = await missionSlugs(user);
      expect(slugs).not.toContain("starts-tomorrow");
      expect(slugs).not.toContain("ended-yesterday");
      await expect(
        rejectsWith(call(db.pool, user, "select public.claim_task($1, $2) as result", [future, randomUUID()])),
      ).resolves.toBe("VE010");

      const result = await call<{ live: boolean; publishAt: string | null }>(
        db.pool,
        admin,
        "select public.ve_admin_schedule_task($1, null, now() + interval '1 day') as result",
        [future],
      );
      expect(result).toMatchObject({ live: true, publishAt: null });
      expect(await missionSlugs(user)).toContain("starts-tomorrow");
      await expect(
        call(db.pool, user, "select public.claim_task($1, $2) as result", [future, randomUUID()]),
      ).resolves.toMatchObject({ success: true, rewardCoins: 5 });

      const { rows } = await db.pool.query("select count(*)::int as n from public.audit_logs where action = 'task.schedule'");
      expect(rows[0].n).toBeGreaterThanOrEqual(3);
    });

    it("rejects an end before the start, unknown missions and non-admins", async () => {
      const mission = await createMission("bad-window");
      await expect(
        rejectsWith(
          call(db.pool, admin, "select public.ve_admin_schedule_task($1, now(), now() - interval '1 hour') as result", [mission]),
        ),
      ).resolves.toBe("22023");
      await expect(
        rejectsWith(call(db.pool, admin, "select public.ve_admin_schedule_task($1, null, null) as result", [randomUUID()])),
      ).resolves.toBe("VE012");
      const player = await createUser(db.pool);
      await expect(
        rejectsWith(call(db.pool, player, "select public.ve_admin_schedule_task($1, null, null) as result", [mission])),
      ).resolves.toBe("42501");
    });
  });

  describe("analytics", () => {
    it("reports economy flows per day, cohorts and feature adoption to admins only", async () => {
      const user = await createUser(db.pool);
      await tap(db.pool, user);
      await call(db.pool, user, "select public.claim_daily_bonus($1) as result", [randomUUID()]);

      const series = await call<Record<string, number | string>[]>(
        db.pool,
        admin,
        "select public.ve_admin_economy_series(7) as result",
      );
      expect(series).toHaveLength(7);
      const today = series[series.length - 1];
      expect(Number(today.tapCoins)).toBeGreaterThanOrEqual(10);
      expect(Number(today.bonusCoins)).toBeGreaterThanOrEqual(20);

      const cohorts = await call<{ players: number }[]>(db.pool, admin, "select public.ve_admin_retention(4) as result");
      expect(cohorts.reduce((sum, c) => sum + Number(c.players), 0)).toBeGreaterThan(0);

      await expect(call(db.pool, admin, "select public.ve_admin_engagement_summary() as result")).resolves.toMatchObject({
        bonusClaimsToday: expect.any(Number),
        generators: expect.any(Number),
      });

      await expect(rejectsWith(call(db.pool, admin, "select public.ve_admin_economy_series(91) as result"))).resolves.toBe(
        "22023",
      );
      for (const fn of ["ve_admin_economy_series(7)", "ve_admin_retention(4)", "ve_admin_engagement_summary()"]) {
        await expect(rejectsWith(call(db.pool, user, `select public.${fn} as result`))).resolves.toBe("42501");
      }
    });
  });
});
