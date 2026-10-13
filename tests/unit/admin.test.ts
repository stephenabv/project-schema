import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccountSuspendedError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { decodeCursor } from "@/lib/pagination/cursor";
import { toAppError } from "@/lib/supabase/errors";
import {
  achievementInputSchema,
  adjustmentInputSchema,
  tapPolicyInputSchema,
  taskInputSchema,
  userActionSchema,
} from "@/lib/validation/admin";
import { AdminService } from "@/services/admin";
import { createFakeSupabase } from "./support/fake-supabase";

const USER = "8a0e0aa5-44c3-42fc-a7fe-6be77eab9562";
const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";

const taskInput = {
  slug: "tap-starter",
  title: "Tap Starter",
  description: "Complete 10 taps",
  objectiveType: "taps",
  target: "10",
  rewardCoins: "50",
  xpReward: "20",
  frequency: "daily",
  status: "published",
  sortOrder: "10",
};

afterEach(() => vi.restoreAllMocks());

describe("admin input validation", () => {
  it("coerces form values for missions and rejects unknown fields", () => {
    expect(taskInputSchema.parse(taskInput)).toMatchObject({ target: 10, rewardCoins: 50, sortOrder: 10 });
    expect(taskInputSchema.safeParse({ ...taskInput, rewardCoins: "0" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...taskInput, target: "2.5" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...taskInput, slug: "Bad Slug" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...taskInput, frequency: "hourly" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...taskInput, id: USER }).success).toBe(false);
  });

  it("only accepts whitelisted badge icons and metrics", () => {
    const badge = {
      slug: "big-tapper",
      title: "Big Tapper",
      description: "",
      metric: "total_taps",
      threshold: "500",
      rewardCoins: "0",
      xpReward: "0",
      icon: "zap",
      sortOrder: "1",
      isActive: true,
    };
    expect(achievementInputSchema.safeParse(badge).success).toBe(true);
    expect(achievementInputSchema.safeParse({ ...badge, icon: "<script>" }).success).toBe(false);
    expect(achievementInputSchema.safeParse({ ...badge, metric: "balance" }).success).toBe(false);
  });

  it("bounds the tap policy like the database does", () => {
    const policy = { rewardCoins: "2", cooldownMs: "1000", dailyLimit: "500", xpPerTap: "1", perMinuteLimit: "40" };
    expect(tapPolicyInputSchema.parse(policy)).toEqual({ rewardCoins: 2, cooldownMs: 1000, dailyLimit: 500, xpPerTap: 1, perMinuteLimit: 40 });
    expect(tapPolicyInputSchema.safeParse({ ...policy, perMinuteLimit: "0" }).success).toBe(false);
    expect(tapPolicyInputSchema.safeParse({ ...policy, perMinuteLimit: "241" }).success).toBe(false);
    expect(tapPolicyInputSchema.safeParse({ ...policy, cooldownMs: "100" }).success).toBe(false);
    expect(tapPolicyInputSchema.safeParse({ ...policy, rewardCoins: "1001" }).success).toBe(false);
  });

  it("requires a reason to suspend and a non-zero adjustment", () => {
    expect(userActionSchema.safeParse({ action: "suspend" }).success).toBe(false);
    expect(userActionSchema.safeParse({ action: "suspend", reason: "Bot traffic" }).success).toBe(true);
    expect(userActionSchema.safeParse({ action: "set_role", role: "owner" }).success).toBe(false);
    expect(userActionSchema.safeParse({ action: "delete" }).success).toBe(false);

    expect(adjustmentInputSchema.safeParse({ amountCoins: "0", reason: "Oops", idempotencyKey: KEY }).success).toBe(false);
    expect(adjustmentInputSchema.parse({ amountCoins: "-25", reason: "Correction", idempotencyKey: KEY }).amountCoins).toBe(-25);
  });
});

describe("toAppError (admin codes)", () => {
  it.each([
    ["VE006", AccountSuspendedError, 403, "ACCOUNT_SUSPENDED"],
    ["VE008", ConflictError, 409, "INSUFFICIENT_BALANCE"],
    ["VE011", ConflictError, 409, "ACTION_NOT_ALLOWED"],
    ["VE012", NotFoundError, 404, "NOT_FOUND"],
    ["23505", ConflictError, 409, "ALREADY_EXISTS"],
    ["23502", ValidationError, 400, "VALIDATION_FAILED"],
  ])("maps %s", (code, ErrorClass, status, apiCode) => {
    const error = toAppError({ code }, "op");
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error.status).toBe(status);
    expect(error.code).toBe(apiCode);
  });
});

describe("AdminService", () => {
  it("pages users with a fixed page size", async () => {
    const fake = createFakeSupabase({ rpc: { ve_admin_list_users: { data: { items: [], total: 0 }, error: null } } });
    await new AdminService(fake.client).listUsers("bob", 3);
    expect(fake.rpc).toHaveBeenCalledWith("ve_admin_list_users", { p_search: "bob", p_limit: 25, p_offset: 50 });
  });

  it("routes user actions to the right database function", async () => {
    const fake = createFakeSupabase({
      rpc: {
        ve_admin_set_suspension: { data: { userId: USER, suspendedAt: null, suspensionReason: null }, error: null },
        ve_admin_set_role: { data: { userId: USER, role: "admin" }, error: null },
      },
    });
    const admin = new AdminService(fake.client);
    await admin.applyUserAction(USER, { action: "suspend", reason: "Bot traffic" });
    await admin.applyUserAction(USER, { action: "restore" });
    await admin.applyUserAction(USER, { action: "set_role", role: "admin" });

    expect(fake.rpc).toHaveBeenNthCalledWith(1, "ve_admin_set_suspension", { p_user_id: USER, p_suspended: true, p_reason: "Bot traffic" });
    expect(fake.rpc).toHaveBeenNthCalledWith(2, "ve_admin_set_suspension", { p_user_id: USER, p_suspended: false, p_reason: null });
    expect(fake.rpc).toHaveBeenNthCalledWith(3, "ve_admin_set_role", { p_user_id: USER, p_role: "admin" });
  });

  it("turns audit log pages into opaque cursors and inclusive date filters", async () => {
    const entry = {
      id: "0b9d0c56-6d55-4b4b-9a43-5f2c8f1c1a11",
      actorId: USER,
      actorUsername: "chief",
      action: "user.suspend",
      targetType: "user",
      targetId: USER,
      metadata: { reason: "Bot traffic" },
      createdAt: "2026-10-13T01:00:00.123456+00:00",
    };
    const fake = createFakeSupabase({
      rpc: { ve_admin_list_audit_logs: { data: { items: [entry], hasMore: true }, error: null } },
    });
    const page = await new AdminService(fake.client).listAuditLogs({ action: "user.", from: "2026-10-01", to: "2026-10-13" });

    expect(fake.rpc).toHaveBeenCalledWith("ve_admin_list_audit_logs", {
      p_action: "user.",
      p_target_id: null,
      p_from: "2026-10-01T00:00:00Z",
      p_to: "2026-10-14T00:00:00.000Z",
      p_before_created_at: null,
      p_before_id: null,
      p_limit: 50,
    });
    expect(decodeCursor(page.nextCursor!)).toEqual({ createdAt: entry.createdAt, id: entry.id });
  });

  it("maps the activity series to camelCase numbers", async () => {
    const fake = createFakeSupabase({
      rpc: {
        ve_admin_activity_series: {
          data: [
            { day: "2026-10-13", active_players: "2", new_players: 1, taps: "30", coins_issued: "300", missions_claimed: 1, duplicate_requests: 0 },
          ],
          error: null,
        },
      },
    });
    await expect(new AdminService(fake.client).activitySeries(1)).resolves.toEqual([
      { day: "2026-10-13", activePlayers: 2, newPlayers: 1, taps: 30, coinsIssued: 300, missionsClaimed: 1, duplicateRequests: 0 },
    ]);
  });
});
