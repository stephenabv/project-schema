import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeResult } from "../../unit/support/fake-supabase";

let fake = createFakeSupabase();
let currentUser: { id: string } | null = null;

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

const bonusRoute = await import("@/app/api/daily-bonus/route");
const { GET: leaderboard } = await import("@/app/api/leaderboard/route");
const { GET: shop } = await import("@/app/api/shop/route");
const { POST: purchase } = await import("@/app/api/shop/[id]/purchase/route");
const { POST: equip } = await import("@/app/api/shop/[id]/equip/route");
const { GET: notifications } = await import("@/app/api/notifications/route");
const { POST: markRead } = await import("@/app/api/notifications/read/route");

const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";
const ITEM = "6a1d6a3e-2f7b-4c1e-9d55-1b2c3d4e5f60";
const TX = "9b2f9c3e-1d4a-4c55-8a7e-0c3f4d2b1a90";

function post(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const appConfig = (leaderboard = true) => ({
  data: {
    flags: { dailyBonus: true, leaderboard, shop: true, idleGenerator: true },
    maintenance: { enabled: false, message: "" },
  },
  error: null,
});

function useDatabase(rpc: Record<string, FakeResult> = {}) {
  fake = createFakeSupabase({ rpc: { get_app_config: appConfig(), ...rpc } });
}

beforeEach(() => {
  currentUser = { id: "user-1" };
  useDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const bonusStatus = {
  claimedToday: false,
  currentStreak: 2,
  longestStreak: 4,
  nextRewardCoins: 40,
  xpReward: 10,
  resetsAt: "2026-10-14T00:00:00+00:00",
  currency: "VC",
  redeemable: false,
};

const bonusClaim = {
  success: true,
  duplicate: false,
  transactionId: TX,
  rewardCoins: 40,
  xpReward: 10,
  currentStreak: 3,
  longestStreak: 4,
  balanceCoins: 140,
  xpTotal: 60,
  level: 1,
  unlockedAchievements: [],
  currency: "VC",
  redeemable: false,
};

describe("/api/daily-bonus", () => {
  it("requires a session for both reads and claims", async () => {
    currentUser = null;
    expect((await bonusRoute.GET()).status).toBe(401);
    expect((await bonusRoute.POST(post("/api/daily-bonus", { idempotencyKey: KEY }))).status).toBe(401);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("returns today's status", async () => {
    useDatabase({ get_daily_bonus_status: { data: bonusStatus, error: null } });
    const response = await bonusRoute.GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(bonusStatus);
  });

  it("claims with the client's idempotency key only", async () => {
    useDatabase({ claim_daily_bonus: { data: bonusClaim, error: null } });
    const response = await bonusRoute.POST(post("/api/daily-bonus", { idempotencyKey: KEY }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ rewardCoins: 40, currentStreak: 3, redeemable: false });
    expect(fake.rpc).toHaveBeenCalledWith("claim_daily_bonus", { p_idempotency_key: KEY });
  });

  it("rejects extra fields such as a client-chosen amount", async () => {
    const response = await bonusRoute.POST(post("/api/daily-bonus", { idempotencyKey: KEY, rewardCoins: 1_000_000 }));
    expect(response.status).toBe(400);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("maps a second claim on the same day to 409 ALREADY_CLAIMED", async () => {
    useDatabase({ claim_daily_bonus: { data: null, error: { code: "VE004" } } });
    const response = await bonusRoute.POST(post("/api/daily-bonus", { idempotencyKey: KEY }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "ALREADY_CLAIMED" });
  });

  it("maps a suspended account to 403", async () => {
    useDatabase({ claim_daily_bonus: { data: null, error: { code: "VE006" } } });
    const response = await bonusRoute.POST(post("/api/daily-bonus", { idempotencyKey: KEY }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
  });
});

describe("GET /api/leaderboard", () => {
  const board = {
    board: "weekly",
    entries: [
      { rank: 1, username: "ana", avatarKey: "star", level: 4, score: 900, title: "Tapper", frame: "gold", isYou: false },
    ],
    you: { rank: null, score: 0, optedOut: false },
    weekStartsOn: "2026-10-12",
  };

  it("passes a known board through", async () => {
    useDatabase({ get_leaderboard: { data: board, error: null } });
    const response = await leaderboard(new NextRequest("http://localhost/api/leaderboard?board=weekly"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(board);
    expect(fake.rpc).toHaveBeenCalledWith("get_leaderboard", { p_board: "weekly", p_limit: 25 });
  });

  it("falls back to the XP board for unknown values", async () => {
    useDatabase({ get_leaderboard: { data: { ...board, board: "xp" }, error: null } });
    await leaderboard(new NextRequest("http://localhost/api/leaderboard?board=coins';--"));
    expect(fake.rpc).toHaveBeenCalledWith("get_leaderboard", { p_board: "xp", p_limit: 25 });
  });

  it("returns 403 FEATURE_DISABLED when admins switched the leaderboard off", async () => {
    useDatabase({ get_app_config: appConfig(false), get_leaderboard: { data: board, error: null } });
    const response = await leaderboard(new NextRequest("http://localhost/api/leaderboard"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(fake.rpc).not.toHaveBeenCalledWith("get_leaderboard", expect.anything());
  });

  it("fails closed when rows break the display-only contract", async () => {
    useDatabase({ get_leaderboard: { data: { ...board, entries: [{ email: "x@example.com" }] }, error: null } });
    const response = await leaderboard(new NextRequest("http://localhost/api/leaderboard"));
    expect(response.status).toBe(500);
  });
});

describe("shop routes", () => {
  const item = {
    id: ITEM,
    slug: "skin-sunset",
    name: "Sunset",
    description: "A warm orange tap button.",
    category: "tap_skin",
    styleKey: "sunset",
    priceCoins: 300,
    levelRequired: 1,
    owned: false,
    equipped: false,
  };

  it("lists items with the virtual-currency labels", async () => {
    const data = { balanceCoins: 500, level: 2, items: [item], currency: "VC", redeemable: false };
    useDatabase({ list_shop: { data, error: null } });
    const response = await shop();
    await expect(response.json()).resolves.toEqual(data);
  });

  it("purchases by id and key; the price never comes from the client", async () => {
    const result = {
      success: true, duplicate: false, transactionId: TX, itemId: ITEM, priceCoins: 300, balanceCoins: 200,
      currency: "VC", redeemable: false,
    };
    useDatabase({ purchase_item: { data: result, error: null } });
    const response = await purchase(post(`/api/shop/${ITEM}/purchase`, { idempotencyKey: KEY }), params(ITEM));
    expect(response.status).toBe(200);
    expect(fake.rpc).toHaveBeenCalledWith("purchase_item", { p_item_id: ITEM, p_idempotency_key: KEY });

    const tampered = await purchase(post(`/api/shop/${ITEM}/purchase`, { idempotencyKey: KEY, priceCoins: 1 }), params(ITEM));
    expect(tampered.status).toBe(400);
  });

  it("returns 404 for a malformed item id without calling the database", async () => {
    const response = await purchase(post("/api/shop/not-a-uuid/purchase", { idempotencyKey: KEY }), params("not-a-uuid"));
    expect(response.status).toBe(404);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["VE008", 409, "INSUFFICIENT_BALANCE"],
    ["VE009", 409, "LEVEL_REQUIRED"],
    ["VE013", 409, "ALREADY_OWNED"],
    ["VE012", 404, "NOT_FOUND"],
  ])("maps %s to %i %s", async (sqlstate, status, code) => {
    useDatabase({ purchase_item: { data: null, error: { code: sqlstate } } });
    const response = await purchase(post(`/api/shop/${ITEM}/purchase`, { idempotencyKey: KEY }), params(ITEM));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it("equips an owned item and returns the equipped set", async () => {
    const equipped = { tapSkin: "sunset", avatarFrame: null, title: null };
    useDatabase({ equip_item: { data: equipped, error: null } });
    const response = await equip(post(`/api/shop/${ITEM}/equip`, { equip: true }), params(ITEM));
    await expect(response.json()).resolves.toEqual(equipped);
    expect(fake.rpc).toHaveBeenCalledWith("equip_item", { p_item_id: ITEM, p_equip: true });
  });

  it("rejects a non-boolean equip flag", async () => {
    const response = await equip(post(`/api/shop/${ITEM}/equip`, { equip: "yes" }), params(ITEM));
    expect(response.status).toBe(400);
  });
});

describe("notification routes", () => {
  const list = {
    items: [
      {
        id: KEY, kind: "badge", title: "Badge unlocked: First Steps", body: "", link: "/achievements",
        createdAt: "2026-10-13T00:00:00Z", read: false,
      },
    ],
    unread: 1,
  };

  it("lists the caller's notifications", async () => {
    useDatabase({ ve_list_notifications: { data: list, error: null } });
    const response = await notifications();
    await expect(response.json()).resolves.toEqual(list);
  });

  it("drops links that are not same-site paths", async () => {
    const hostile = { ...list, items: [{ ...list.items[0], link: "//evil.example/phish" }] };
    useDatabase({ ve_list_notifications: { data: hostile, error: null } });
    const body = await (await notifications()).json();
    expect(body.items[0].link).toBeNull();
  });

  it("marks everything read when no ids are given", async () => {
    useDatabase({ ve_mark_notifications_read: { data: 3, error: null } });
    const response = await markRead(post("/api/notifications/read", {}));
    await expect(response.json()).resolves.toEqual({ marked: 3 });
    expect(fake.rpc).toHaveBeenCalledWith("ve_mark_notifications_read", { p_ids: null });
  });

  it("marks only the given ids", async () => {
    useDatabase({ ve_mark_notifications_read: { data: 1, error: null } });
    await markRead(post("/api/notifications/read", { ids: [KEY] }));
    expect(fake.rpc).toHaveBeenCalledWith("ve_mark_notifications_read", { p_ids: [KEY] });
  });

  it("rejects malformed ids", async () => {
    const response = await markRead(post("/api/notifications/read", { ids: ["1 or 1=1"] }));
    expect(response.status).toBe(400);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});
