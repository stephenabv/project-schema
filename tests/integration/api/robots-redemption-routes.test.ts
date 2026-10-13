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

const { GET: shop } = await import("@/app/api/robots/route");
const { POST: purchase } = await import("@/app/api/robots/[id]/purchase/route");
const { POST: collect } = await import("@/app/api/robots/generator/collect/route");
const { POST: setActive } = await import("@/app/api/robots/owned/[id]/active/route");
const { POST: requestConversion } = await import("@/app/api/conversions/route");
const { POST: cancelConversion } = await import("@/app/api/conversions/[id]/cancel/route");
const { POST: requestPayout } = await import("@/app/api/payouts/route");
const { GET: exportCsv } = await import("@/app/api/admin/exports/[dataset]/route");

const USER = "8a0e0aa5-44c3-42fc-a7fe-6be77eab9562";
const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";
const ID = "5d7e9a1c-2b3f-4c6d-8e9f-0a1b2c3d4e5f";
const TX = "9b2f9c3e-1d4a-4c55-8a7e-0c3f4d2b1a90";
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

function useDatabase(rpc: Record<string, FakeResult> = {}) {
  fake = createFakeSupabase({
    rpc: {
      get_account_status: { data: { isAdmin, suspended: false, suspendedAt: null, suspensionReason: null }, error: null },
      ...rpc,
    },
  });
}

function send(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  currentUser = { id: USER };
  isAdmin = false;
  useDatabase();
  vi.stubEnv("PAYOUT_DETAILS_KEY", TEST_KEY);
  for (const level of ["error", "warn", "info", "log"] as const) vi.spyOn(console, level).mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const conversion = {
  id: ID, reference: "CNV-261013-ABCDEFGH", coins: 10000, rateCoins: 1000, rateCentavos: 1000, phpCentavos: 10000,
  status: "pending", reviewNote: null, rejectionReason: null, createdAt: "2026-10-13T00:00:00+00:00",
  updatedAt: "2026-10-13T00:00:00+00:00", completedAt: null,
  events: [{ fromStatus: null, toStatus: "pending", note: null, createdAt: "2026-10-13T00:00:00+00:00" }], duplicate: false,
};

const payout = {
  id: ID, reference: "PAY-261013-ABCDEFGH", amountCentavos: 10000, status: "pending", methodCode: "gcash", methodName: "GCash",
  accountHint: "•••• 4567", reviewNote: null, rejectionReason: null, paymentReference: null,
  createdAt: "2026-10-13T00:00:00+00:00", updatedAt: "2026-10-13T00:00:00+00:00", paidAt: null, events: [], duplicate: false,
};

describe("robot routes", () => {
  it("returns 401 to signed-out callers", async () => {
    currentUser = null;
    expect((await shop()).status).toBe(401);
    expect((await purchase(send(`/api/robots/${ID}/purchase`, { idempotencyKey: KEY }), idParams(ID))).status).toBe(401);
  });

  it("buys with only the robot id and key; the price is never taken from the client", async () => {
    const result = {
      success: true, duplicate: false, transactionId: TX, robotId: ID, userRobotId: KEY, activated: true, priceCoins: 500,
      balanceCoins: 0, currency: "VC", redeemable: false,
    };
    useDatabase({ purchase_robot: { data: result, error: null } });
    const response = await purchase(send(`/api/robots/${ID}/purchase`, { idempotencyKey: KEY }), idParams(ID));
    expect(response.status).toBe(200);
    expect(fake.rpc).toHaveBeenCalledWith("purchase_robot", { p_robot_id: ID, p_idempotency_key: KEY });

    const forged = await purchase(send(`/api/robots/${ID}/purchase`, { idempotencyKey: KEY, priceCoins: 1 }), idParams(ID));
    expect(forged.status).toBe(400);
    expect((await purchase(send("/api/robots/x/purchase", { idempotencyKey: KEY }), idParams("x"))).status).toBe(404);
  });

  it.each([
    ["VE008", 409, "INSUFFICIENT_BALANCE"],
    ["VE017", 409, "LIMIT_REACHED"],
    ["VE014", 403, "FEATURE_DISABLED"],
  ])("maps purchase errors %s to %i %s", async (sqlstate, status, code) => {
    useDatabase({ purchase_robot: { data: null, error: { code: sqlstate } } });
    const response = await purchase(send(`/api/robots/${ID}/purchase`, { idempotencyKey: KEY }), idParams(ID));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it("collects and toggles with idempotency keys", async () => {
    useDatabase({ collect_robot_earnings: { data: null, error: { code: "VE015" } } });
    const nothing = await collect(send("/api/robots/generator/collect", { idempotencyKey: KEY }));
    expect(nothing.status).toBe(409);
    expect(fake.rpc).toHaveBeenCalledWith("collect_robot_earnings", { p_idempotency_key: KEY });

    const toggled = { success: true, userRobotId: ID, isActive: false, paidCoins: 12, balanceCoins: 112, currency: "VC", redeemable: false };
    useDatabase({ set_robot_active: { data: toggled, error: null } });
    const response = await setActive(send(`/api/robots/owned/${ID}/active`, { active: false, idempotencyKey: KEY }), idParams(ID));
    expect(response.status).toBe(200);
    expect(fake.rpc).toHaveBeenCalledWith("set_robot_active", { p_user_robot_id: ID, p_active: false, p_idempotency_key: KEY });
  });
});

describe("conversion routes", () => {
  it("creates a request from coins, the reviewed rate and a key; the peso amount comes from the database", async () => {
    useDatabase({ request_conversion: { data: conversion, error: null } });
    const response = await requestConversion(send("/api/conversions", { coins: 10000, rateId: ID, idempotencyKey: KEY }));
    expect(response.status).toBe(201);
    expect(fake.rpc).toHaveBeenCalledWith("request_conversion", { p_coins: 10000, p_expected_rate_id: ID, p_idempotency_key: KEY });

    const forged = await requestConversion(send("/api/conversions", { coins: 10000, rateId: ID, idempotencyKey: KEY, phpCentavos: 9e9 }));
    expect(forged.status).toBe(400);
  });

  it.each([
    ["VE014", 403, "FEATURE_DISABLED"],
    ["VE018", 409, "RATE_CHANGED"],
    ["VE019", 409, "AMOUNT_OUT_OF_RANGE"],
    ["VE022", 503, "NOT_CONFIGURED"],
  ])("maps %s to %i %s", async (sqlstate, status, code) => {
    useDatabase({ request_conversion: { data: null, error: { code: sqlstate } } });
    const response = await requestConversion(send("/api/conversions", { coins: 10000, rateId: ID, idempotencyKey: KEY }));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it("refuses to cancel a request that is no longer pending", async () => {
    useDatabase({ cancel_conversion: { data: null, error: { code: "VE020" } } });
    const response = await cancelConversion(send(`/api/conversions/${ID}/cancel`, {}), idParams(ID));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_STATUS" });
  });
});

describe("payout routes", () => {
  const body = { methodId: ID, amountCentavos: 10000, accountName: "Juan Dela Cruz", accountNumber: "0917 123 4567", idempotencyKey: KEY };

  it("encrypts account details before they reach the database", async () => {
    useDatabase({ request_payout: { data: payout, error: null } });
    const response = await requestPayout(send("/api/payouts", body));
    expect(response.status).toBe(201);
    const args = fake.rpc.mock.calls.find(([name]) => name === "request_payout")?.[1] as Record<string, unknown>;
    expect(args.p_account_details).toMatch(/^v1\./);
    expect(JSON.stringify(args)).not.toContain("123 4567");
    expect(JSON.stringify(args)).not.toContain("Juan");
    expect(args.p_account_hint).toBe("•••• 4567");
  });

  it("fails closed when the encryption key is missing", async () => {
    vi.stubEnv("PAYOUT_DETAILS_KEY", "");
    useDatabase({ request_payout: { data: payout, error: null } });
    const response = await requestPayout(send("/api/payouts", body));
    expect(response.status).toBe(503);
    expect(fake.rpc).not.toHaveBeenCalledWith("request_payout", expect.anything());
  });

  it("rejects unsafe account details without touching the database", async () => {
    const response = await requestPayout(send("/api/payouts", { ...body, accountName: "<img src=x>" }));
    expect(response.status).toBe(400);
    expect(fake.rpc).not.toHaveBeenCalledWith("request_payout", expect.anything());
  });
});

describe("request exports", () => {
  it("exports payouts without account details", async () => {
    isAdmin = true;
    const adminPayout = { ...payout, userId: USER, username: "juan", reviewedBy: null };
    useDatabase({ ve_admin_list_payouts: { data: { items: [adminPayout], total: 1 }, error: null } });
    const response = await exportCsv(new Request("http://localhost/api/admin/exports/payouts"), {
      params: Promise.resolve({ dataset: "payouts" }),
    });
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv.split("\n")[0]).toContain("account_hint");
    expect(csv).not.toContain("account_details");
    expect(csv).toContain("PAY-261013-ABCDEFGH");
  });

  it("is admin only", async () => {
    const response = await exportCsv(new Request("http://localhost/api/admin/exports/conversions"), {
      params: Promise.resolve({ dataset: "conversions" }),
    });
    expect(response.status).toBe(403);
  });
});
