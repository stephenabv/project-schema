import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeResult } from "../../unit/support/fake-supabase";

// The role check reads get_account_status through the fake client, so
// `isAdmin` decides whether the caller passes the application-level guard.
let fake = createFakeSupabase();
let currentUser: { id: string } | null = null;
let isAdmin = true;

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

const { GET: analytics } = await import("@/app/api/admin/analytics/route");
const { GET: users } = await import("@/app/api/admin/users/route");
const { PATCH: userAction } = await import("@/app/api/admin/users/[id]/route");
const { POST: adjust } = await import("@/app/api/admin/users/[id]/adjustments/route");
const { POST: createTask } = await import("@/app/api/admin/tasks/route");
const { PATCH: updateSettings } = await import("@/app/api/admin/settings/route");
const { GET: auditLogs } = await import("@/app/api/admin/audit-logs/route");

const USER = "8a0e0aa5-44c3-42fc-a7fe-6be77eab9562";
const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";

function useDatabase(rpc: Record<string, FakeResult> = {}) {
  fake = createFakeSupabase({
    rpc: {
      get_account_status: {
        data: { isAdmin, suspended: false, suspendedAt: null, suspensionReason: null },
        error: null,
      },
      ...rpc,
    },
  });
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  currentUser = { id: USER };
  isAdmin = true;
  useDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("admin API authorization", () => {
  it("returns 401 to signed-out callers", async () => {
    currentUser = null;
    const response = await users(new NextRequest("http://localhost/api/admin/users"));
    expect(response.status).toBe(401);
  });

  it("returns 403 to players without calling any admin function", async () => {
    isAdmin = false;
    useDatabase();
    const response = await users(new NextRequest("http://localhost/api/admin/users"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("get_account_status");
  });

  it("still maps a database-level denial to 403", async () => {
    useDatabase({ ve_admin_list_users: { data: null, error: { code: "42501" } } });
    const response = await users(new NextRequest("http://localhost/api/admin/users"));
    expect(response.status).toBe(403);
  });
});

describe("admin API", () => {
  it("serves analytics with a clamped range", async () => {
    useDatabase({
      ve_admin_overview: {
        data: {
          totalPlayers: 2, newPlayersToday: 0, activeToday: 1, tapsToday: 3, coinsIssuedToday: 30,
          missionsClaimedToday: 0, duplicateRequestsToday: 0, coinsInCirculation: 30, suspendedPlayers: 0,
          admins: 1, publishedMissions: 6, currency: "VC", redeemable: false,
        },
        error: null,
      },
      ve_admin_activity_series: { data: [], error: null },
      ve_admin_suspicious_activity: { data: [], error: null },
    });
    const response = await analytics(new NextRequest("http://localhost/api/admin/analytics?days=9999"));
    expect(response.status).toBe(200);
    expect(fake.rpc).toHaveBeenCalledWith("ve_admin_activity_series", { p_days: 30 });
  });

  it("applies a suspension", async () => {
    useDatabase({ ve_admin_set_suspension: { data: { userId: USER, suspendedAt: "2026-10-13T00:00:00Z", suspensionReason: "Bots" }, error: null } });
    const response = await userAction(
      jsonRequest(`http://localhost/api/admin/users/${USER}`, "PATCH", { action: "suspend", reason: "Bots" }),
      params(USER),
    );
    expect(response.status).toBe(200);
  });

  it("rejects malformed ids and actions before the database", async () => {
    const badId = await userAction(jsonRequest("http://localhost/api/admin/users/x", "PATCH", { action: "restore" }), params("x"));
    expect(badId.status).toBe(404);
    const badAction = await userAction(
      jsonRequest(`http://localhost/api/admin/users/${USER}`, "PATCH", { action: "delete" }),
      params(USER),
    );
    expect(badAction.status).toBe(400);
    expect(fake.rpc).not.toHaveBeenCalledWith("ve_admin_set_suspension", expect.anything());
  });

  it("reports an adjustment that would overdraw as 409", async () => {
    useDatabase({ ve_admin_adjust_balance: { data: null, error: { code: "VE008" } } });
    const response = await adjust(
      jsonRequest(`http://localhost/api/admin/users/${USER}/adjustments`, "POST", {
        amountCoins: -50,
        reason: "Correction",
        idempotencyKey: KEY,
      }),
      params(USER),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
  });

  it("creates a mission with 201 and reports field errors", async () => {
    const task = {
      id: "5d7e9a1c-2b3f-4c6d-8e9f-0a1b2c3d4e5f", slug: "new-one", title: "New one", description: "", objectiveType: "taps",
      target: 5, rewardCoins: 10, xpReward: 0, frequency: "daily", status: "draft", sortOrder: 0,
      createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z", claimsTotal: 0, claimsLast7Days: 0,
    };
    useDatabase({ ve_admin_save_task: { data: task, error: null } });
    const input = { slug: "new-one", title: "New one", description: "", objectiveType: "taps", target: 5, rewardCoins: 10, xpReward: 0, frequency: "daily", status: "draft", sortOrder: 0 };

    const created = await createTask(jsonRequest("http://localhost/api/admin/tasks", "POST", input));
    expect(created.status).toBe(201);

    const invalid = await createTask(jsonRequest("http://localhost/api/admin/tasks", "POST", { ...input, rewardCoins: 0 }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: expect.stringContaining("rewardCoins") });
  });

  it("updates the tap policy", async () => {
    const policy = { rewardCoins: 3, cooldownMs: 800, dailyLimit: 600, xpPerTap: 2, perMinuteLimit: 50 };
    useDatabase({ ve_admin_update_tap_policy: { data: policy, error: null } });
    const response = await updateSettings(jsonRequest("http://localhost/api/admin/settings", "PATCH", policy));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tapPolicy: policy });
  });

  it("ignores invalid audit filters instead of failing", async () => {
    useDatabase({ ve_admin_list_audit_logs: { data: { items: [], hasMore: false }, error: null } });
    const response = await auditLogs(new NextRequest("http://localhost/api/admin/audit-logs?action=DROP%20TABLE&from=yesterday"));
    expect(response.status).toBe(200);
    expect(fake.rpc).toHaveBeenCalledWith("ve_admin_list_audit_logs", expect.objectContaining({ p_action: null, p_from: null }));
  });
});
