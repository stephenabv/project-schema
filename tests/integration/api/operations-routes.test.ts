import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeResult } from "../../unit/support/fake-supabase";

let fake = createFakeSupabase();
let currentUser: { id: string } | null = null;
let isAdmin = false;

vi.mock("@/lib/auth/require-user", async () => {
  const { AuthenticationError } = await import("@/lib/errors");
  return {
    requireUser: async () => ({ supabase: fake.client, user: currentUser }),
    requireAuthenticatedUser: async () => {
      if (!currentUser) throw new AuthenticationError();
      return { supabase: fake.client, user: currentUser };
    },
  };
});

const { GET: generator } = await import("@/app/api/generator/route");
const { POST: collect } = await import("@/app/api/generator/collect/route");
const { POST: upgrade } = await import("@/app/api/generator/upgrade/route");
const { GET: config } = await import("@/app/api/config/route");
const { PUT: putFlags } = await import("@/app/api/admin/settings/flags/route");
const { PUT: putMaintenance } = await import("@/app/api/admin/settings/maintenance/route");
const { PUT: schedule } = await import("@/app/api/admin/tasks/[id]/schedule/route");
const { GET: exportCsv } = await import("@/app/api/admin/exports/[dataset]/route");

const USER = "8a0e0aa5-44c3-42fc-a7fe-6be77eab9562";
const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";
const TASK = "5d7e9a1c-2b3f-4c6d-8e9f-0a1b2c3d4e5f";
const TX = "9b2f9c3e-1d4a-4c55-8a7e-0c3f4d2b1a90";

function useDatabase(rpc: Record<string, FakeResult> = {}) {
  fake = createFakeSupabase({
    rpc: {
      get_account_status: { data: { isAdmin, suspended: false, suspendedAt: null, suspensionReason: null }, error: null },
      ...rpc,
    },
  });
}

function send(url: string, method: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
const datasetParams = (dataset: string) => ({ params: Promise.resolve({ dataset }) });

beforeEach(() => {
  currentUser = { id: USER };
  isAdmin = false;
  useDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const status = {
  level: 2,
  maxLevel: 10,
  coinsPerHour: 12,
  capHours: 8,
  pendingCoins: 30,
  lastCollectedAt: "2026-10-13T00:00:00+00:00",
  fullAt: "2026-10-13T08:00:00+00:00",
  nextUpgradeCost: 1350,
  nextCoinsPerHour: 18,
  balanceCoins: 500,
  currency: "VC",
  redeemable: false,
};

describe("generator routes", () => {
  it("returns 401 to signed-out callers", async () => {
    currentUser = null;
    expect((await generator()).status).toBe(401);
    expect((await collect(send("/api/generator/collect", "POST", { idempotencyKey: KEY }))).status).toBe(401);
  });

  it("reads the status labelled as virtual", async () => {
    useDatabase({ get_generator_status: { data: status, error: null } });
    const response = await generator();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ pendingCoins: 30, currency: "VC", redeemable: false });
  });

  it("collects with the caller's idempotency key and lets the server decide the amount", async () => {
    const result = {
      success: true, duplicate: false, transactionId: TX, collectedCoins: 30, balanceCoins: 530,
      xpTotal: 40, level: 1, unlockedAchievements: [], currency: "VC", redeemable: false,
    };
    useDatabase({ collect_generator: { data: result, error: null } });
    const response = await collect(send("/api/generator/collect", "POST", { idempotencyKey: KEY }));
    expect(response.status).toBe(200);
    expect(fake.rpc).toHaveBeenCalledWith("collect_generator", { p_idempotency_key: KEY });

    const forged = await collect(send("/api/generator/collect", "POST", { idempotencyKey: KEY, amount: 1_000_000 }));
    expect(forged.status).toBe(400);
  });

  it("rejects a missing key without touching the database", async () => {
    const response = await collect(send("/api/generator/collect", "POST", {}));
    expect(response.status).toBe(400);
    expect(fake.rpc).not.toHaveBeenCalledWith("collect_generator", expect.anything());
  });

  it.each([
    ["collect_generator", "VE015", 409, "NOTHING_TO_COLLECT"],
    ["collect_generator", "VE014", 403, "FEATURE_DISABLED"],
    ["collect_generator", "VE007", 503, "MAINTENANCE_MODE"],
    ["upgrade_generator", "VE008", 409, "INSUFFICIENT_BALANCE"],
    ["upgrade_generator", "VE011", 409, "ACTION_NOT_ALLOWED"],
  ])("maps %s %s to %i %s", async (fn, sqlstate, httpStatus, code) => {
    useDatabase({ [fn]: { data: null, error: { code: sqlstate } } });
    const route = fn === "collect_generator" ? collect : upgrade;
    const response = await route(send(`/api/generator/${fn.split("_")[0]}`, "POST", { idempotencyKey: KEY }));
    expect(response.status).toBe(httpStatus);
    await expect(response.json()).resolves.toMatchObject({ code });
    if (httpStatus === 503) expect(response.headers.get("Retry-After")).toBe("60");
  });
});

describe("GET /api/config", () => {
  it("returns the feature flags and maintenance state", async () => {
    const appConfig = {
      flags: { dailyBonus: true, leaderboard: false, shop: true, idleGenerator: true, robots: true },
      maintenance: { enabled: true, message: "Back soon" },
    };
    useDatabase({ get_app_config: { data: appConfig, error: null } });
    const response = await config();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(appConfig);
  });
});

describe("admin operations routes", () => {
  const flags = { dailyBonus: true, leaderboard: false, shop: true, idleGenerator: false, robots: true };

  it("returns 403 to players", async () => {
    useDatabase({ ve_admin_update_feature_flags: { data: flags, error: null } });
    expect((await putFlags(send("/api/admin/settings/flags", "PUT", flags))).status).toBe(403);
    expect((await exportCsv(new NextRequest("http://localhost/api/admin/exports/users"), datasetParams("users"))).status).toBe(403);
    expect(fake.rpc).not.toHaveBeenCalledWith("ve_admin_update_feature_flags", expect.anything());
  });

  it("updates feature flags and rejects unknown keys", async () => {
    isAdmin = true;
    useDatabase({ ve_admin_update_feature_flags: { data: flags, error: null } });
    const response = await putFlags(send("/api/admin/settings/flags", "PUT", flags));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ featureFlags: flags });

    const extra = await putFlags(send("/api/admin/settings/flags", "PUT", { ...flags, payouts: true }));
    expect(extra.status).toBe(400);
  });

  it("sets maintenance mode with a bounded message", async () => {
    isAdmin = true;
    useDatabase({ ve_admin_set_maintenance: { data: { enabled: true, message: "Upgrading" }, error: null } });
    const response = await putMaintenance(send("/api/admin/settings/maintenance", "PUT", { enabled: true, message: " Upgrading " }));
    expect(response.status).toBe(200);
    expect(fake.rpc).toHaveBeenCalledWith("ve_admin_set_maintenance", { p_enabled: true, p_message: "Upgrading" });

    const tooLong = await putMaintenance(send("/api/admin/settings/maintenance", "PUT", { enabled: true, message: "x".repeat(201) }));
    expect(tooLong.status).toBe(400);
  });

  it("schedules a mission and validates the window", async () => {
    isAdmin = true;
    const task = {
      id: TASK, slug: "s", title: "S", description: "", objectiveType: "taps", target: 5, rewardCoins: 10, xpReward: 0,
      frequency: "daily", status: "published", sortOrder: 0, createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z",
      claimsTotal: 0, claimsLast7Days: 0, publishAt: "2026-10-14T00:00:00Z", unpublishAt: null, live: false,
    };
    useDatabase({ ve_admin_schedule_task: { data: task, error: null } });
    const ok = await schedule(
      send(`/api/admin/tasks/${TASK}/schedule`, "PUT", { publishAt: "2026-10-14T00:00:00Z", unpublishAt: null }),
      idParams(TASK),
    );
    expect(ok.status).toBe(200);
    expect(fake.rpc).toHaveBeenCalledWith("ve_admin_schedule_task", {
      p_task_id: TASK,
      p_publish_at: "2026-10-14T00:00:00Z",
      p_unpublish_at: null,
    });

    const backwards = await schedule(
      send(`/api/admin/tasks/${TASK}/schedule`, "PUT", { publishAt: "2026-10-14T00:00:00Z", unpublishAt: "2026-10-13T00:00:00Z" }),
      idParams(TASK),
    );
    expect(backwards.status).toBe(400);

    const badId = await schedule(send("/api/admin/tasks/nope/schedule", "PUT", { publishAt: null, unpublishAt: null }), idParams("nope"));
    expect(badId.status).toBe(404);
  });

  it("exports the economy as an uncached CSV attachment", async () => {
    isAdmin = true;
    const day = { day: "2026-10-13", tapCoins: 10, missionCoins: 5, badgeCoins: 0, bonusCoins: 25, idleCoins: 6, spentCoins: 150, adjustmentCoins: -3 };
    useDatabase({ ve_admin_economy_series: { data: [day], error: null } });
    const response = await exportCsv(new NextRequest("http://localhost/api/admin/exports/economy"), datasetParams("economy"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="virtual-earn-economy-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Export-Truncated")).toBe("false");
    const csv = await response.text();
    expect(csv.split("\r\n")[1]).toBe("2026-10-13,10,5,0,25,6,150,-3");
    expect(fake.rpc).toHaveBeenCalledWith("ve_admin_economy_series", { p_days: 90 });
  });

  it("neutralises formulas in exported player data", async () => {
    isAdmin = true;
    const user = {
      id: USER, username: "=HYPERLINK(\"x\")", email: "a@example.com", role: "user", balanceCoins: 1, xpTotal: 0, level: 1,
      totalTaps: 0, missionsCompleted: 0, suspendedAt: null, suspensionReason: null, createdAt: "2026-10-13T00:00:00Z", lastActiveOn: null,
    };
    useDatabase({ ve_admin_list_users: { data: { items: [user], total: 1 }, error: null } });
    const response = await exportCsv(new NextRequest("http://localhost/api/admin/exports/users"), datasetParams("users"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`"'=HYPERLINK(""x"")"`);
    expect(fake.rpc).toHaveBeenCalledWith("ve_admin_list_users", { p_search: null, p_limit: 100, p_offset: 0 });
  });

  it("returns 404 for an unknown dataset", async () => {
    isAdmin = true;
    useDatabase();
    const response = await exportCsv(new NextRequest("http://localhost/api/admin/exports/secrets"), datasetParams("secrets"));
    expect(response.status).toBe(404);
  });
});
