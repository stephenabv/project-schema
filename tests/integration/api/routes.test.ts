import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeResult } from "../../unit/support/fake-supabase";

// Route handlers are exercised end to end with the auth boundary replaced by
// a controllable fake: `currentUser` decides whether the caller is signed in.
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

const { POST: tap } = await import("@/app/api/earn/tap/route");
const { GET: wallet } = await import("@/app/api/wallet/route");
const { GET: transactions } = await import("@/app/api/transactions/route");
const { GET: dashboard } = await import("@/app/api/dashboard/route");

const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";
const tapResult = {
  success: true,
  duplicate: false,
  transactionId: "9b2f9c3e-1d4a-4c55-8a7e-0c3f4d2b1a90",
  rewardCoins: 10,
  balanceCoins: 510,
  tapsToday: 51,
  currency: "VC",
  redeemable: false,
};

function tapRequest(body: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) {
  return new Request("http://localhost/api/earn/tap", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function useDatabase(rpc: Record<string, FakeResult> = {}, table?: FakeResult) {
  fake = createFakeSupabase({ rpc, table });
}

beforeEach(() => {
  currentUser = { id: "user-1" };
  useDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/earn/tap", () => {
  it("returns 401 for unauthenticated callers without touching the database", async () => {
    currentUser = null;
    const response = await tap(tapRequest({ idempotencyKey: KEY }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required", code: "AUTHENTICATION_REQUIRED" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("returns the server-decided reward", async () => {
    useDatabase({ process_tap: { data: tapResult, error: null } });
    const response = await tap(tapRequest({ idempotencyKey: KEY }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(tapResult);
    expect(fake.rpc).toHaveBeenCalledWith("process_tap", { p_idempotency_key: KEY });
  });

  it.each([
    [{}, 400],
    [{ idempotencyKey: "nope" }, 400],
    [{ idempotencyKey: KEY, rewardCoins: 999999 }, 400],
    ["{not json", 400],
  ])("rejects invalid body %j", async (body, status) => {
    const response = await tap(tapRequest(body));
    expect(response.status).toBe(status);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("rejects non-JSON content types and oversized bodies", async () => {
    expect((await tap(tapRequest({ idempotencyKey: KEY }, { "Content-Type": "text/plain" }))).status).toBe(400);
    expect((await tap(tapRequest({ idempotencyKey: KEY, pad: "x".repeat(4096) }))).status).toBe(413);
  });

  it.each([
    ["VE001", 429, "COOLDOWN_ACTIVE"],
    ["VE002", 429, "DAILY_LIMIT_REACHED"],
    ["VE003", 409, "IDEMPOTENCY_CONFLICT"],
    ["P0002", 404, "NOT_FOUND"],
    ["28000", 401, "AUTHENTICATION_REQUIRED"],
    ["XX000", 500, "INTERNAL_ERROR"],
  ])("maps database error %s to HTTP %i", async (code, status, apiCode) => {
    useDatabase({ process_tap: { data: null, error: { code, message: "raw database detail" } } });
    const response = await tap(tapRequest({ idempotencyKey: KEY }));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.code).toBe(apiCode);
    expect(JSON.stringify(body)).not.toContain("raw database detail");
  });

  it("sets Retry-After on cooldown", async () => {
    useDatabase({ process_tap: { data: null, error: { code: "VE001" } } });
    const response = await tap(tapRequest({ idempotencyKey: KEY }));
    expect(response.headers.get("Retry-After")).toBe("1");
  });
});

describe("GET /api/wallet", () => {
  it("returns 401 when signed out", async () => {
    currentUser = null;
    expect((await wallet()).status).toBe(401);
  });

  it("returns the virtual balance for the verified user only", async () => {
    useDatabase({}, { data: { balance_coins: 510, updated_at: "2026-10-12T00:00:00+00:00" }, error: null });
    const response = await wallet();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      balanceCoins: 510,
      currency: "VC",
      label: "Virtual coins",
      redeemable: false,
    });
    expect(fake.chain.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
});

describe("GET /api/transactions", () => {
  const request = (query: string) => new NextRequest(`http://localhost/api/transactions${query}`);

  it("returns 401 when signed out", async () => {
    currentUser = null;
    expect((await transactions(request(""))).status).toBe(401);
  });

  it("validates query parameters", async () => {
    for (const query of ["?limit=1000", "?type=withdrawal", "?from=2026-10-12&to=2026-10-01", "?cursor=bogus"]) {
      expect((await transactions(request(query))).status, query).toBe(400);
    }
  });

  it("returns a page of the ledger", async () => {
    useDatabase({ list_transactions: { data: [], error: null } });
    const response = await transactions(request("?type=tap_reward&limit=5"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [], nextCursor: null, currency: "VC", redeemable: false });
    expect(fake.rpc.mock.calls[0][1]).toMatchObject({ p_limit: 6, p_type: "tap_reward" });
  });
});

describe("GET /api/dashboard", () => {
  it("returns 401 when signed out", async () => {
    currentUser = null;
    expect((await dashboard()).status).toBe(401);
  });
});
