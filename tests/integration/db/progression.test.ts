import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asRole,
  balanceOf,
  clearCooldown,
  createTestDatabase,
  createUser,
  hasDatabase,
  ledgerSum,
  sqlState,
  tap,
  type TestDatabase,
} from "./support/database";

interface ClaimResult {
  success: boolean;
  duplicate: boolean;
  transactionId: string;
  taskId: string;
  rewardCoins: number;
  xpReward: number;
  balanceCoins: number;
  xpTotal: number;
  level: number;
  unlockedAchievements: { slug: string }[];
}

function claim(pool: Pool, userId: string, taskId: string, key: string = randomUUID()): Promise<ClaimResult> {
  return asRole(pool, userId, async (client) => {
    const { rows } = await client.query("select public.claim_task($1, $2) as result", [taskId, key]);
    return rows[0].result as ClaimResult;
  });
}

async function taskId(pool: Pool, slug: string): Promise<string> {
  const { rows } = await pool.query("select id from public.tasks where slug = $1", [slug]);
  return rows[0].id;
}

/** Records taps for today without waiting out the cooldown (superuser only). */
async function setTodayTaps(pool: Pool, userId: string, taps: number): Promise<void> {
  await pool.query(
    `insert into public.daily_activity (user_id, activity_date, tap_count)
     values ($1, timezone('utc', now())::date, $2)
     on conflict (user_id, activity_date) do update set tap_count = excluded.tap_count`,
    [userId, taps],
  );
}

async function rpcJson<T>(pool: Pool, userId: string, sql: string, params: unknown[] = []): Promise<T> {
  return asRole(pool, userId, async (client) => (await client.query(sql, params)).rows[0].result as T);
}

describe.skipIf(!hasDatabase)("progression, missions and achievements", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe("levels", () => {
    it.each([
      [0, 1],
      [99, 1],
      [100, 2],
      [299, 2],
      [300, 3],
      [4499, 9],
      [4500, 10],
    ])("%i XP is level %i", async (xp, level) => {
      const { rows } = await db.pool.query("select ve_private.level_for_xp($1) as level", [xp]);
      expect(rows[0].level).toBe(level);
    });
  });

  describe("taps", () => {
    it("provisions progress at signup", async () => {
      const user = await createUser(db.pool);
      const { rows } = await db.pool.query("select xp_total, total_taps from public.player_progress where user_id = $1", [
        user,
      ]);
      expect(rows).toEqual([{ xp_total: "0", total_taps: "0" }]);
    });

    it("awards XP, records daily activity and unlocks the first-tap badge with its own ledger entry", async () => {
      const user = await createUser(db.pool);
      const result = await tap(db.pool, user);

      expect(result).toMatchObject({ rewardCoins: 10, duplicate: false });
      expect(result).toMatchObject({
        xpEarned: 1,
        xpTotal: 6, // 1 for the tap + 5 for the First Tap badge
        level: 1,
        balanceCoins: 20, // 10 for the tap + 10 for the badge
        unlockedAchievements: [expect.objectContaining({ slug: "first-tap", rewardCoins: 10 })],
      });

      const { rows } = await db.pool.query(
        "select tap_count, coins_earned::int, xp_earned::int from public.daily_activity where user_id = $1",
        [user],
      );
      expect(rows).toEqual([{ tap_count: 1, coins_earned: 20, xp_earned: 6 }]);
      expect(await ledgerSum(db.pool, user)).toBe(await balanceOf(db.pool, user));
    });

    it("never unlocks the same badge twice", async () => {
      const user = await createUser(db.pool);
      await tap(db.pool, user);
      await clearCooldown(db.pool, user);
      const second = await tap(db.pool, user);
      expect(second.unlockedAchievements).toEqual([]);
      const { rows } = await db.pool.query("select count(*)::int as n from public.user_achievements where user_id = $1", [
        user,
      ]);
      expect(rows[0].n).toBe(1);
    });

    it("chains unlocks when a reward raises the level", async () => {
      const user = await createUser(db.pool);
      await tap(db.pool, user);
      // One XP short of level 5 (1,000 XP): the next tap reaches it.
      await db.pool.query("update public.player_progress set xp_total = 999 where user_id = $1", [user]);
      await clearCooldown(db.pool, user);

      const result = await tap(db.pool, user);
      expect(result.level).toBe(5);
      expect(result.unlockedAchievements.map((a) => a.slug)).toContain("level-five");
      expect(await ledgerSum(db.pool, user)).toBe(await balanceOf(db.pool, user));
    });

    it("counts replayed requests as duplicates without rewarding them", async () => {
      const user = await createUser(db.pool);
      const key = randomUUID();
      await tap(db.pool, user, key);
      const replay = await tap(db.pool, user, key);
      expect(replay).toMatchObject({ duplicate: true, xpEarned: 0, unlockedAchievements: [] });
      const { rows } = await db.pool.query("select duplicate_requests from public.daily_activity where user_id = $1", [
        user,
      ]);
      expect(rows[0].duplicate_requests).toBe(1);
    });
  });

  describe("claim_task", () => {
    let starter: string;

    beforeAll(async () => {
      starter = await taskId(db.pool, "tap-starter");
    });

    it("rejects a mission whose objective is not complete", async () => {
      const user = await createUser(db.pool);
      await setTodayTaps(db.pool, user, 9);
      const error = await claim(db.pool, user, starter).catch((e: unknown) => e);
      expect(sqlState(error)).toBe("VE005");
      expect(await balanceOf(db.pool, user)).toBe(0);
    });

    it("pays the reward and XP once per period", async () => {
      const user = await createUser(db.pool);
      await setTodayTaps(db.pool, user, 10);

      const result = await claim(db.pool, user, starter);
      expect(result).toMatchObject({ success: true, duplicate: false, rewardCoins: 50, xpReward: 20 });
      // 50 for the mission + 50 for the On a Mission badge.
      expect(result.unlockedAchievements.map((a) => a.slug)).toEqual(["first-mission"]);
      expect(result.balanceCoins).toBe(100);

      const again = await claim(db.pool, user, starter).catch((e: unknown) => e);
      expect(sqlState(again)).toBe("VE004");
      expect(await balanceOf(db.pool, user)).toBe(100);
      expect(await ledgerSum(db.pool, user)).toBe(100);
    });

    it("replays a retried claim without paying twice", async () => {
      const user = await createUser(db.pool);
      await setTodayTaps(db.pool, user, 10);
      const key = randomUUID();
      const first = await claim(db.pool, user, starter, key);
      const replay = await claim(db.pool, user, starter, key);
      expect(replay).toMatchObject({ duplicate: true, transactionId: first.transactionId, rewardCoins: 50 });
      expect(await balanceOf(db.pool, user)).toBe(first.balanceCoins);
    });

    it("rejects a key reused for a different mission", async () => {
      const user = await createUser(db.pool);
      await setTodayTaps(db.pool, user, 10);
      const key = randomUUID();
      await claim(db.pool, user, starter, key);
      const error = await claim(db.pool, user, await taskId(db.pool, "first-steps"), key).catch((e: unknown) => e);
      expect(sqlState(error)).toBe("VE003");
    });

    it("pays exactly one of a burst of concurrent claims", async () => {
      const user = await createUser(db.pool);
      await setTodayTaps(db.pool, user, 10);
      const results = await Promise.allSettled(Array.from({ length: 6 }, () => claim(db.pool, user, starter)));
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);
      for (const r of results) {
        if (r.status === "rejected") expect(sqlState(r.reason)).toBe("VE004");
      }
      const { rows } = await db.pool.query(
        "select count(*)::int as n from public.task_progress where user_id = $1 and task_id = $2",
        [user, starter],
      );
      expect(rows[0].n).toBe(1);
      expect(await ledgerSum(db.pool, user)).toBe(await balanceOf(db.pool, user));
    });

    it("counts claimed missions toward mission objectives", async () => {
      const user = await createUser(db.pool);
      await db.pool.query(
        `insert into public.daily_activity (user_id, activity_date, missions_completed)
         values ($1, timezone('utc', now())::date, 10)`,
        [user],
      );
      const result = await claim(db.pool, user, await taskId(db.pool, "mission-master"));
      expect(result.rewardCoins).toBe(800);
    });

    it("refuses draft and archived missions", async () => {
      const user = await createUser(db.pool);
      await setTodayTaps(db.pool, user, 10);
      const { rows } = await db.pool.query(
        `insert into public.tasks (slug, title, objective_type, objective_target, reward_coins, frequency, status)
         values ('hidden-draft', 'Hidden draft', 'taps', 1, 5, 'daily', 'draft') returning id`,
      );
      const error = await claim(db.pool, user, rows[0].id).catch((e: unknown) => e);
      expect(sqlState(error)).toBe("VE010");
    });

    it("requires a signed-in caller", async () => {
      const anonymous = await asRole(db.pool, null, (c) =>
        c.query("select public.claim_task($1, $2)", [starter, randomUUID()]),
      ).catch((e: unknown) => e);
      expect(sqlState(anonymous)).toBe("42501");
    });
  });

  describe("read models", () => {
    it("lists published missions with the caller's progress", async () => {
      const user = await createUser(db.pool);
      await setTodayTaps(db.pool, user, 12);
      await claim(db.pool, user, await taskId(db.pool, "tap-starter"));

      const missions = await rpcJson<
        { slug: string; progress: number; target: number; claimed: boolean; periodKey: string }[]
      >(db.pool, user, "select public.list_missions() as result");

      const bySlug = Object.fromEntries(missions.map((m) => [m.slug, m]));
      expect(bySlug["tap-starter"]).toMatchObject({ progress: 10, target: 10, claimed: true });
      expect(bySlug["tap-sprinter"]).toMatchObject({ progress: 12, target: 100, claimed: false });
      expect(bySlug["weekly-grind"].periodKey).toMatch(/^\d{4}-W\d{2}$/);
      expect(missions.some((m) => m.slug === "hidden-draft")).toBe(false);
    });

    it("reports level progress and the closest locked achievement", async () => {
      const user = await createUser(db.pool);
      await tap(db.pool, user);
      const progression = await rpcJson<{
        level: number;
        xpTotal: number;
        levelStartXp: number;
        nextLevelXp: number;
        achievementsUnlocked: number;
        nextAchievement: { slug: string; unlocked: boolean } | null;
      }>(db.pool, user, "select public.get_progression() as result");

      expect(progression).toMatchObject({ level: 1, xpTotal: 6, levelStartXp: 0, nextLevelXp: 100, achievementsUnlocked: 1 });
      expect(progression.nextAchievement?.unlocked).toBe(false);
    });

    it.each([
      ["day", 7],
      ["week", 4],
      ["month", 3],
    ])("returns %s buckets zero-filled", async (bucket, points) => {
      const user = await createUser(db.pool);
      await tap(db.pool, user);
      const rows = await asRole(db.pool, user, async (c) =>
        (await c.query("select period_start, coins::int from public.get_reward_history($1, $2)", [bucket, points])).rows,
      );
      expect(rows).toHaveLength(points);
      expect(rows.at(-1).coins).toBe(20);
    });

    it("rejects unsupported history ranges", async () => {
      const user = await createUser(db.pool);
      const error = await asRole(db.pool, user, (c) => c.query("select * from public.get_reward_history('day', 365)")).catch(
        (e: unknown) => e,
      );
      expect(sqlState(error)).toBe("22023");
    });
  });

  describe("access control", () => {
    let alice: string;
    let bob: string;

    beforeAll(async () => {
      alice = await createUser(db.pool, { username: "alice_p" });
      bob = await createUser(db.pool, { username: "bob_p" });
      await tap(db.pool, alice);
      await tap(db.pool, bob);
    });

    it.each(["player_progress", "daily_activity", "user_achievements"])("only shows the caller's own %s", async (table) => {
      const rows = await asRole(db.pool, alice, async (c) => (await c.query(`select user_id from public.${table}`)).rows);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.user_id === alice)).toBe(true);
    });

    it("hides draft missions from players", async () => {
      const rows = await asRole(db.pool, alice, async (c) => (await c.query("select status from public.tasks")).rows);
      expect(rows.every((r) => r.status === "published")).toBe(true);
    });

    it.each([
      "update public.player_progress set xp_total = 1000000",
      "insert into public.task_progress (user_id, task_id, period_key, progress, transaction_id) select auth.uid(), id, 'once', 1, gen_random_uuid() from public.tasks limit 1",
      "insert into public.user_achievements (user_id, achievement_id) select auth.uid(), id from public.achievements limit 1",
      "update public.tasks set reward_coins = 1000000",
      "insert into public.daily_activity (user_id, activity_date, tap_count) values (auth.uid(), current_date + 1, 1000)",
      "update public.player_profiles set avatar_url = 'https://example.com/a.png'",
    ])("denies direct writes: %s", async (sql) => {
      const error = await asRole(db.pool, alice, (c) => c.query(sql)).catch((e: unknown) => e);
      expect(sqlState(error)).toBe("42501");
    });

    it("lets players change their own username and avatar only", async () => {
      await asRole(db.pool, alice, (c) =>
        c.query("update public.player_profiles set username = 'alice_new', avatar_key = 'rocket' where id = auth.uid()"),
      );
      const { rows } = await db.pool.query("select username, avatar_key from public.player_profiles where id = $1", [alice]);
      expect(rows[0]).toEqual({ username: "alice_new", avatar_key: "rocket" });

      const result = await asRole(db.pool, alice, (c) =>
        c.query("update public.player_profiles set username = 'stolen' where id = $1", [bob]),
      );
      expect(result.rowCount).toBe(0);
    });

    it.each([
      "select ve_private.post_entry(auth.uid(), 1000000, 'admin_adjustment', 'x', null, gen_random_uuid())",
      "select ve_private.record_activity(auth.uid(), 1000, 1000, 1000, 1000)",
      "select ve_private.evaluate_achievements(auth.uid())",
    ])("denies internal write helpers: %s", async (sql) => {
      const error = await asRole(db.pool, alice, (c) => c.query(sql)).catch((e: unknown) => e);
      expect(sqlState(error)).toBe("42501");
    });
  });
});
