import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaimClient } from "@/lib/api/claim-client";
import { ConflictError, ForbiddenError, InternalError, NotFoundError, ValidationError } from "@/lib/errors";
import { describeAchievementGoal, describeMissionGoal, formatBucket } from "@/lib/formatting/progression";
import { toAppError } from "@/lib/supabase/errors";
import { profileUpdateSchema } from "@/lib/validation/profile";
import { rewardRangeSchema } from "@/lib/validation/progression";
import { changePasswordSchema } from "@/lib/validation/auth";
import { MissionService } from "@/services/missions";
import { ProfileService } from "@/services/profile";
import { ProgressionService } from "@/services/progression";
import { createFakeSupabase } from "./support/fake-supabase";
import { achievement, claimResult, mission, progression } from "./support/progression-fixtures";

const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";
const TASK = mission.id;
const USER = "8a0e0aa5-44c3-42fc-a7fe-6be77eab9562";

afterEach(() => vi.restoreAllMocks());

describe("MissionService", () => {
  it("lists missions through the read model", async () => {
    const fake = createFakeSupabase({ rpc: { list_missions: { data: [mission], error: null } } });
    await expect(new MissionService(fake.client).list()).resolves.toEqual([mission]);
    expect(fake.rpc).toHaveBeenCalledWith("list_missions");
  });

  it("claims with only the task id and idempotency key", async () => {
    const fake = createFakeSupabase({ rpc: { claim_task: { data: claimResult, error: null } } });
    await expect(new MissionService(fake.client).claim(TASK, KEY)).resolves.toEqual(claimResult);
    expect(fake.rpc).toHaveBeenCalledWith("claim_task", { p_task_id: TASK, p_idempotency_key: KEY });
  });

  it.each([
    ["VE004", "ALREADY_CLAIMED"],
    ["VE005", "MISSION_INCOMPLETE"],
  ])("maps %s to a %s conflict", async (code, expected) => {
    const fake = createFakeSupabase({ rpc: { claim_task: { data: null, error: { code } } } });
    const error = await new MissionService(fake.client).claim(TASK, KEY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe(expected);
  });

  it("rejects a claim result that is marked redeemable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = createFakeSupabase({
      rpc: { claim_task: { data: { ...claimResult, redeemable: true }, error: null } },
    });
    await expect(new MissionService(fake.client).claim(TASK, KEY)).rejects.toBeInstanceOf(InternalError);
  });
});

describe("ProgressionService", () => {
  it("returns progression and achievements", async () => {
    const fake = createFakeSupabase({
      rpc: {
        get_progression: { data: progression, error: null },
        list_achievements: { data: [achievement], error: null },
      },
    });
    const service = new ProgressionService(fake.client);
    await expect(service.get()).resolves.toEqual(progression);
    await expect(service.listAchievements()).resolves.toEqual([achievement]);
  });

  it.each([
    ["14d", "day", 14],
    ["12w", "week", 12],
    ["12m", "month", 12],
  ] as const)("requests the %s range as %s buckets", async (range, bucket, points) => {
    const fake = createFakeSupabase({
      rpc: { get_reward_history: { data: [{ period_start: "2026-10-01", coins: 30 }], error: null } },
    });
    await expect(new ProgressionService(fake.client).getRewardHistory(range)).resolves.toEqual([
      { periodStart: "2026-10-01", coins: 30 },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith("get_reward_history", { p_bucket: bucket, p_points: points });
  });
});

describe("ProfileService", () => {
  const row = { id: USER, username: "stephen", avatar_key: "rocket", created_at: "2026-10-01T00:00:00+00:00" };

  it("reads only the caller's own profile columns", async () => {
    const fake = createFakeSupabase({ table: { data: row, error: null } });
    await expect(new ProfileService(fake.client).get(USER)).resolves.toEqual({
      id: USER,
      username: "stephen",
      avatarKey: "rocket",
      createdAt: row.created_at,
    });
    expect(fake.from).toHaveBeenCalledWith("player_profiles");
    expect(fake.chain.eq).toHaveBeenCalledWith("id", USER);
  });

  it("updates only username and avatar", async () => {
    const fake = createFakeSupabase({ table: { data: row, error: null } });
    await new ProfileService(fake.client).update(USER, { username: "stephen", avatarKey: "rocket" });
    expect(fake.chain.update).toHaveBeenCalledWith({ username: "stephen", avatar_key: "rocket" });
  });

  it("reports a taken username as a conflict", async () => {
    const fake = createFakeSupabase({ table: { data: null, error: { code: "23505" } } });
    const error = await new ProfileService(fake.client)
      .update(USER, { username: "taken", avatarKey: "coins" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe("USERNAME_TAKEN");
  });

  it("treats a missing row as not found", async () => {
    const fake = createFakeSupabase({ table: { data: null, error: null } });
    await expect(new ProfileService(fake.client).get(USER)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("toAppError (progression codes)", () => {
  it.each([
    ["VE010", NotFoundError, 404],
    ["23514", ValidationError, 400],
    ["42501", ForbiddenError, 403],
  ])("maps %s", (code, ErrorClass, status) => {
    const error = toAppError({ code }, "op");
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error.status).toBe(status);
  });
});

describe("ClaimClient", () => {
  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  function clientWith(...responses: Array<Response | Error>) {
    const fetchImpl = vi.fn(async () => {
      const next = responses.shift();
      if (!next || next instanceof Error) throw next ?? new Error("no response");
      return next;
    });
    return { client: new ClaimClient(fetchImpl, async () => {}, [1]), fetchImpl };
  }

  it("posts the key to the mission's claim URL", async () => {
    const { client, fetchImpl } = clientWith(respond(200, claimResult));
    await expect(client.claim(TASK, KEY)).resolves.toEqual({ kind: "success", data: claimResult });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/tasks/${TASK}/claim`);
    expect(JSON.parse(String(init.body))).toEqual({ idempotencyKey: KEY });
  });

  it.each([
    [409, { code: "ALREADY_CLAIMED", error: "x" }, { kind: "already_claimed" }],
    [409, { code: "MISSION_INCOMPLETE", error: "x" }, { kind: "incomplete" }],
    [401, { code: "AUTHENTICATION_REQUIRED", error: "x" }, { kind: "unauthenticated" }],
    [404, { code: "NOT_FOUND", error: "This mission is not available" }, { kind: "error", message: "This mission is not available" }],
  ])("maps HTTP %s responses", async (status, body, expected) => {
    const { client } = clientWith(respond(status, body));
    await expect(client.claim(TASK, KEY)).resolves.toEqual(expected);
  });

  it("retries a network failure with the same key, then reports it", async () => {
    const { client, fetchImpl } = clientWith(new TypeError("offline"), new TypeError("offline"));
    await expect(client.claim(TASK, KEY)).resolves.toMatchObject({ kind: "error" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("progression formatting and validation", () => {
  it("describes goals", () => {
    expect(describeMissionGoal({ objectiveType: "taps", progress: 4, target: 10 })).toBe("4 / 10 taps");
    expect(describeAchievementGoal({ metric: "total_taps", progress: 40, threshold: 100 })).toBe("40 / 100 taps");
    expect(describeAchievementGoal({ metric: "level", progress: 3, threshold: 5 })).toBe("Level 3 of level 5");
  });

  it("labels buckets in UTC", () => {
    expect(formatBucket("day", "2026-10-13")).toBe("Oct 13");
    expect(formatBucket("week", "2026-10-12")).toBe("Wk of Oct 12");
    expect(formatBucket("month", "2026-10-01")).toBe("Oct 26");
  });

  it("falls back to the default chart range for unknown values", () => {
    expect(rewardRangeSchema.parse("12w")).toBe("12w");
    expect(rewardRangeSchema.parse("all")).toBe("14d");
    expect(rewardRangeSchema.parse(undefined)).toBe("14d");
  });

  it("validates profile updates against the avatar whitelist", () => {
    expect(profileUpdateSchema.safeParse({ username: " player_1 ", avatarKey: "gem" }).data).toEqual({
      username: "player_1",
      avatarKey: "gem",
    });
    expect(profileUpdateSchema.safeParse({ username: "player_1", avatarKey: "https://evil" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ username: "a b", avatarKey: "gem" }).success).toBe(false);
  });

  it("requires a new, matching password", () => {
    const ok = { currentPassword: "old-pass1", password: "new-pass1", confirmPassword: "new-pass1" };
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, confirmPassword: "nope" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, password: "old-pass1", confirmPassword: "old-pass1" }).success).toBe(
      false,
    );
  });
});
