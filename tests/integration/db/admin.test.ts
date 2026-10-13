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

async function makeAdmin(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    "insert into public.user_roles (user_id, role) values ($1, 'admin') on conflict (user_id) do update set role = 'admin'",
    [userId],
  );
}

async function auditActions(pool: Pool, targetId: string): Promise<string[]> {
  const { rows } = await pool.query(
    "select action from public.audit_logs where target_id = $1 order by created_at, id",
    [targetId],
  );
  return rows.map((row) => row.action as string);
}

const task = (overrides: Record<string, unknown> = {}) => ({
  slug: `test-${randomUUID().slice(0, 8)}`,
  title: "Test mission",
  description: "Tap three times today.",
  objectiveType: "taps",
  target: 3,
  rewardCoins: 40,
  xpReward: 5,
  frequency: "daily",
  status: "draft",
  sortOrder: 99,
  ...overrides,
});

describe.skipIf(!hasDatabase)("admin console", () => {
  let db: TestDatabase;
  let admin: string;
  let player: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    await disableAchievements(db.pool);
    admin = await createUser(db.pool, { username: "chief_admin" });
    player = await createUser(db.pool, { username: "regular_player" });
    await makeAdmin(db.pool, admin);
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe("authorization", () => {
    const adminCalls: [string, unknown[]][] = [
      ["select public.ve_admin_overview() as result", []],
      ["select count(*) as result from public.ve_admin_activity_series(7)", []],
      ["select public.ve_admin_suspicious_activity(7) as result", []],
      ["select public.ve_admin_list_users(null, 10, 0) as result", []],
      ["select public.ve_admin_set_suspension($1, true, 'reason') as result", ["00000000-0000-0000-0000-000000000000"]],
      ["select public.ve_admin_set_role($1, 'admin') as result", ["00000000-0000-0000-0000-000000000000"]],
      ["select public.ve_admin_adjust_balance($1, 10, 'reason', $2) as result", ["00000000-0000-0000-0000-000000000000", randomUUID()]],
      ["select public.ve_admin_list_tasks() as result", []],
      ["select public.ve_admin_save_task(null, $1) as result", [JSON.stringify(task())]],
      ["select public.ve_admin_list_achievements() as result", []],
      ["select public.ve_admin_get_settings() as result", []],
      ["select public.ve_admin_update_tap_policy($1) as result", [JSON.stringify({ rewardCoins: 999, cooldownMs: 250, dailyLimit: 1, xpPerTap: 0 })]],
      ["select public.ve_admin_list_audit_logs() as result", []],
    ];

    it.each(adminCalls)("rejects players: %s", async (sql, params) => {
      await expect(rejectsWith(call(db.pool, player, sql, params))).resolves.toBe("42501");
    });

    it.each(adminCalls)("rejects anonymous callers: %s", async (sql, params) => {
      await expect(rejectsWith(call(db.pool, null, sql, params))).resolves.toBe("42501");
    });

    it("keeps settings and the audit log out of direct reach", async () => {
      for (const table of ["app_settings", "audit_logs"]) {
        await expect(rejectsWith(call(db.pool, admin, `select count(*) as result from public.${table}`))).resolves.toBe(
          "42501",
        );
      }
    });

    it("cannot be granted through profile updates or signup metadata", async () => {
      const sneaky = await createUser(db.pool, { username: "sneaky_one", role: "admin" });
      await expect(rejectsWith(call(db.pool, sneaky, "update public.player_profiles set suspended_at = null"))).resolves.toBe(
        "42501",
      );
      const status = await call<{ isAdmin: boolean }>(db.pool, sneaky, "select public.get_account_status() as result");
      expect(status.isAdmin).toBe(false);
    });

    it("reports the caller's own role and suspension state", async () => {
      await expect(call(db.pool, admin, "select public.get_account_status() as result")).resolves.toMatchObject({
        isAdmin: true,
        suspended: false,
      });
      await expect(call(db.pool, player, "select public.get_account_status() as result")).resolves.toMatchObject({
        isAdmin: false,
        suspended: false,
      });
    });
  });

  describe("users", () => {
    it("searches by username, email and id, with LIKE wildcards treated literally", async () => {
      const byName = await call<{ total: number; items: { username: string; email: string }[] }>(
        db.pool, admin, "select public.ve_admin_list_users($1, 10, 0) as result", ["regular"],
      );
      expect(byName.total).toBe(1);
      expect(byName.items[0]).toMatchObject({ username: "regular_player", email: `${player}@example.test` });

      const byId = await call<{ total: number }>(db.pool, admin, "select public.ve_admin_list_users($1, 10, 0) as result", [player]);
      expect(byId.total).toBe(1);

      const wildcard = await call<{ total: number }>(db.pool, admin, "select public.ve_admin_list_users('%', 10, 0) as result");
      expect(wildcard.total).toBe(0);

      const all = await call<{ total: number; items: unknown[] }>(db.pool, admin, "select public.ve_admin_list_users(null, 1, 0) as result");
      expect(all.total).toBeGreaterThanOrEqual(2);
      expect(all.items).toHaveLength(1);
    });

    it("rejects oversized pages", async () => {
      await expect(rejectsWith(call(db.pool, admin, "select public.ve_admin_list_users(null, 500, 0) as result"))).resolves.toBe(
        "22023",
      );
    });

    it("suspends a player, which blocks rewards, and restores them", async () => {
      await expect(
        rejectsWith(call(db.pool, admin, "select public.ve_admin_set_suspension($1, true, null) as result", [player])),
      ).resolves.toBe("22023");

      const suspended = await call<{ suspendedAt: string | null }>(
        db.pool, admin, "select public.ve_admin_set_suspension($1, true, 'Automated tapping') as result", [player],
      );
      expect(suspended.suspendedAt).not.toBeNull();

      await expect(rejectsWith(tap(db.pool, player))).resolves.toBe("VE006");
      await expect(call(db.pool, player, "select public.get_account_status() as result")).resolves.toMatchObject({
        suspended: true,
        suspensionReason: "Automated tapping",
      });

      await call(db.pool, admin, "select public.ve_admin_set_suspension($1, false) as result", [player]);
      await clearCooldown(db.pool, player);
      await expect(tap(db.pool, player)).resolves.toMatchObject({ success: true });

      expect(await auditActions(db.pool, player)).toEqual(expect.arrayContaining(["user.suspend", "user.restore"]));
    });

    it("refuses to suspend yourself or another admin", async () => {
      await expect(
        rejectsWith(call(db.pool, admin, "select public.ve_admin_set_suspension($1, true, 'oops') as result", [admin])),
      ).resolves.toBe("VE011");

      const other = await createUser(db.pool, { username: "second_admin" });
      await makeAdmin(db.pool, other);
      await expect(
        rejectsWith(call(db.pool, admin, "select public.ve_admin_set_suspension($1, true, 'nope') as result", [other])),
      ).resolves.toBe("VE011");
    });

    it("promotes and demotes, but never demotes yourself", async () => {
      const member = await createUser(db.pool, { username: "future_admin" });
      await call(db.pool, admin, "select public.ve_admin_set_role($1, 'admin') as result", [member]);
      await expect(call(db.pool, member, "select public.get_account_status() as result")).resolves.toMatchObject({ isAdmin: true });

      await call(db.pool, admin, "select public.ve_admin_set_role($1, 'user') as result", [member]);
      await expect(call(db.pool, member, "select public.get_account_status() as result")).resolves.toMatchObject({ isAdmin: false });

      await expect(
        rejectsWith(call(db.pool, admin, "select public.ve_admin_set_role($1, 'user') as result", [admin])),
      ).resolves.toBe("VE011");
      await expect(
        rejectsWith(call(db.pool, admin, "select public.ve_admin_set_role($1, 'owner') as result", [member])),
      ).resolves.toBe("22023");
      expect(await auditActions(db.pool, member)).toEqual(["user.role", "user.role"]);
    });
  });

  describe("balance adjustments", () => {
    it("credits and debits with a ledger entry, idempotently", async () => {
      const target = await createUser(db.pool, { username: "adjust_me" });
      const key = randomUUID();

      const credit = await call<{ duplicate: boolean; balanceCoins: number; redeemable: boolean }>(
        db.pool, admin, "select public.ve_admin_adjust_balance($1, 500, 'Contest prize', $2) as result", [target, key],
      );
      expect(credit).toMatchObject({ duplicate: false, balanceCoins: 500, redeemable: false });

      const replay = await call<{ duplicate: boolean }>(
        db.pool, admin, "select public.ve_admin_adjust_balance($1, 500, 'Contest prize', $2) as result", [target, key],
      );
      expect(replay.duplicate).toBe(true);

      await call(db.pool, admin, "select public.ve_admin_adjust_balance($1, -200, 'Correction', $2) as result", [target, randomUUID()]);
      expect(await balanceOf(db.pool, target)).toBe(300);
      expect(await ledgerSum(db.pool, target)).toBe(300);
      expect(await auditActions(db.pool, target)).toEqual(["wallet.adjust", "wallet.adjust"]);
    });

    it("never allows a negative balance or an empty reason", async () => {
      const target = await createUser(db.pool, { username: "poor_player" });
      await expect(
        rejectsWith(call(db.pool, admin, "select public.ve_admin_adjust_balance($1, -1, 'Too much', $2) as result", [target, randomUUID()])),
      ).resolves.toBe("VE008");
      await expect(
        rejectsWith(call(db.pool, admin, "select public.ve_admin_adjust_balance($1, 10, ' ', $2) as result", [target, randomUUID()])),
      ).resolves.toBe("22023");
      await expect(
        rejectsWith(call(db.pool, admin, "select public.ve_admin_adjust_balance($1, 10, 'Unknown', $2) as result", [randomUUID(), randomUUID()])),
      ).resolves.toBe("VE012");
    });
  });

  describe("missions", () => {
    it("creates a draft that players cannot see, then publishes it", async () => {
      const draft = task();
      const created = await call<{ id: string; status: string }>(
        db.pool, admin, "select public.ve_admin_save_task(null, $1) as result", [JSON.stringify(draft)],
      );
      expect(created.status).toBe("draft");

      const visible = async () =>
        (await call<{ slug: string }[]>(db.pool, player, "select public.list_missions() as result")).some((m) => m.slug === draft.slug);
      expect(await visible()).toBe(false);

      await call(db.pool, admin, "select public.ve_admin_save_task($1, $2) as result", [
        created.id,
        JSON.stringify({ ...draft, status: "published" }),
      ]);
      expect(await visible()).toBe(true);
      expect(await auditActions(db.pool, created.id)).toEqual(["task.create", "task.status"]);
    });

    it("validates fields and constraints", async () => {
      const bad = (input: Record<string, unknown>) =>
        rejectsWith(call(db.pool, admin, "select public.ve_admin_save_task(null, $1) as result", [JSON.stringify(input)]));

      await expect(bad(task({ rewardCoins: 0 }))).resolves.toBe("22023");
      await expect(bad(task({ target: 1.5 }))).resolves.toBe("22023");
      await expect(bad(task({ title: undefined }))).resolves.toBe("22023");
      await expect(bad(task({ frequency: "hourly" }))).resolves.toBe("23514");
      await expect(bad(task({ slug: "first-steps" }))).resolves.toBe("23505");
    });

    it("locks objective and frequency once a mission has claims", async () => {
      const { rows } = await db.pool.query("select id from public.tasks where slug = 'first-steps'");
      const firstSteps = rows[0].id as string;
      const claimer = await createUser(db.pool, { username: "claimer" });
      await tap(db.pool, claimer);
      await call(db.pool, claimer, "select public.claim_task($1, $2) as result", [firstSteps, randomUUID()]);

      const tasks = await call<{ id: string; slug: string; claimsTotal: number }[]>(db.pool, admin, "select public.ve_admin_list_tasks() as result");
      const current = tasks.find((t) => t.id === firstSteps)!;
      expect(current.claimsTotal).toBe(1);

      const update = (overrides: Record<string, unknown>) =>
        call(db.pool, admin, "select public.ve_admin_save_task($1, $2) as result", [
          firstSteps,
          JSON.stringify(task({ slug: "first-steps", frequency: "once", target: 1, status: "published", ...overrides })),
        ]);
      await expect(rejectsWith(update({ frequency: "daily" }))).resolves.toBe("VE011");
      await expect(update({ rewardCoins: 30 })).resolves.toMatchObject({ rewardCoins: 30 });
    });
  });

  describe("badges", () => {
    it("updates rewards and locks the metric after unlocks", async () => {
      await db.pool.query("update public.achievements set is_active = true where slug = 'first-tap'");
      const earner = await createUser(db.pool, { username: "badge_earner" });
      await tap(db.pool, earner);

      const list = await call<{ id: string; slug: string; unlockedCount: number; metric: string }[]>(
        db.pool, admin, "select public.ve_admin_list_achievements() as result",
      );
      const firstTap = list.find((a) => a.slug === "first-tap")!;
      expect(firstTap.unlockedCount).toBeGreaterThanOrEqual(1);

      const input = {
        slug: "first-tap",
        title: "First Tap",
        description: "Complete your first accepted tap.",
        metric: "total_taps",
        threshold: 1,
        rewardCoins: 15,
        xpReward: 5,
        icon: "hand",
        sortOrder: 0,
        isActive: false,
      };
      await expect(
        call(db.pool, admin, "select public.ve_admin_save_achievement($1, $2) as result", [firstTap.id, JSON.stringify(input)]),
      ).resolves.toMatchObject({ rewardCoins: 15, isActive: false });
      await expect(
        rejectsWith(
          call(db.pool, admin, "select public.ve_admin_save_achievement($1, $2) as result", [
            firstTap.id,
            JSON.stringify({ ...input, metric: "level" }),
          ]),
        ),
      ).resolves.toBe("VE011");
    });
  });

  describe("tap policy", () => {
    it("rejects unknown keys and out-of-range values", async () => {
      const update = (policy: unknown) =>
        rejectsWith(call(db.pool, admin, "select public.ve_admin_update_tap_policy($1) as result", [JSON.stringify(policy)]));
      await expect(update({ rewardCoins: 10, cooldownMs: 1000, dailyLimit: 1000 })).resolves.toBe("22023");
      await expect(update({ rewardCoins: 10, cooldownMs: 1000, dailyLimit: 1000, xpPerTap: 1, bonus: 1 })).resolves.toBe("22023");
      await expect(update({ rewardCoins: 5000, cooldownMs: 1000, dailyLimit: 1000, xpPerTap: 1 })).resolves.toBe("22023");
      await expect(update({ rewardCoins: 10, cooldownMs: 10, dailyLimit: 1000, xpPerTap: 1 })).resolves.toBe("22023");
    });

    it("changes what the server pays per tap, with an audit entry", async () => {
      const policy = { rewardCoins: 25, cooldownMs: 500, dailyLimit: 2000, xpPerTap: 2 };
      await expect(
        call(db.pool, admin, "select public.ve_admin_update_tap_policy($1) as result", [JSON.stringify(policy)]),
      ).resolves.toEqual(policy);

      const tapper = await createUser(db.pool, { username: "policy_tapper" });
      await expect(tap(db.pool, tapper)).resolves.toMatchObject({ rewardCoins: 25, xpEarned: 2 });

      const settings = await call<{ tapPolicy: unknown; tapPolicyUpdatedBy: string }>(
        db.pool, admin, "select public.ve_admin_get_settings() as result",
      );
      expect(settings).toMatchObject({ tapPolicy: policy, tapPolicyUpdatedBy: "chief_admin" });
      expect(await auditActions(db.pool, "tap_policy")).toEqual(["settings.tap_policy"]);

      await call(db.pool, admin, "select public.ve_admin_update_tap_policy($1) as result", [
        JSON.stringify({ rewardCoins: 10, cooldownMs: 1000, dailyLimit: 1000, xpPerTap: 1 }),
      ]);
    });
  });

  describe("analytics and audit log", () => {
    it("summarises activity", async () => {
      const overview = await call<Record<string, number>>(db.pool, admin, "select public.ve_admin_overview() as result");
      expect(overview.totalPlayers).toBeGreaterThanOrEqual(2);
      expect(overview.admins).toBeGreaterThanOrEqual(1);
      expect(overview.tapsToday).toBeGreaterThanOrEqual(1);

      const series = await asRole(db.pool, admin, async (client) =>
        (await client.query("select * from public.ve_admin_activity_series(14)")).rows,
      );
      expect(series).toHaveLength(14);
      expect(Number(series.at(-1).taps)).toBeGreaterThanOrEqual(1);
      await expect(
        rejectsWith(call(db.pool, admin, "select count(*) as result from public.ve_admin_activity_series(365)")),
      ).resolves.toBe("22023");
    });

    it("flags players with replayed requests", async () => {
      const replayer = await createUser(db.pool, { username: "replayer" });
      const key = randomUUID();
      await tap(db.pool, replayer, key);
      await tap(db.pool, replayer, key);
      const flagged = await call<{ username: string; duplicateRequests: number }[]>(
        db.pool, admin, "select public.ve_admin_suspicious_activity(7) as result",
      );
      expect(flagged.find((row) => row.username === "replayer")).toMatchObject({ duplicateRequests: 1 });
    });

    it("filters and pages the audit log, newest first", async () => {
      const first = await call<{ items: { action: string; createdAt: string; id: string; actorUsername: string }[]; hasMore: boolean }>(
        db.pool, admin, "select public.ve_admin_list_audit_logs('user.', null, null, null, null, null, null, 2) as result",
      );
      expect(first.items).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(first.items.every((item) => item.action.startsWith("user."))).toBe(true);
      expect(first.items[0].actorUsername).toBe("chief_admin");

      const last = first.items[1];
      const next = await call<{ items: { id: string }[] }>(
        db.pool, admin,
        "select public.ve_admin_list_audit_logs('user.', null, null, null, null, $1, $2, 50) as result",
        [last.createdAt, last.id],
      );
      expect(next.items.map((item) => item.id)).not.toContain(last.id);
      expect(next.items.length).toBeGreaterThan(0);
    });

    it("is append-only, even for the database owner", async () => {
      await expect(rejectsWith(db.pool.query("update public.audit_logs set action = 'user.edit'"))).resolves.toBe("42501");
      await expect(rejectsWith(db.pool.query("delete from public.audit_logs"))).resolves.toBe("42501");
    });
  });
});
