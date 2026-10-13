import { describe, expect, it, vi } from "vitest";
import { TapClient } from "@/lib/api/tap-client";

const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";
const success = {
  success: true,
  duplicate: false,
  transactionId: "9b2f9c3e-1d4a-4c55-8a7e-0c3f4d2b1a90",
  rewardCoins: 10,
  balanceCoins: 20,
  tapsToday: 2,
  currency: "VC",
  redeemable: false,
};

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function clientWith(...responses: Array<Response | Error>) {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next || next instanceof Error) throw next ?? new Error("no response");
    return next;
  });
  const sleep = vi.fn(async () => {});
  return { client: new TapClient(fetchImpl, sleep, [1, 1]), fetchImpl, sleep };
}

describe("TapClient", () => {
  it("posts only the idempotency key", async () => {
    const { client, fetchImpl } = clientWith(respond(200, success));
    await expect(client.tap(KEY)).resolves.toEqual({ kind: "success", data: success });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/earn/tap");
    expect(JSON.parse(String(init.body))).toEqual({ idempotencyKey: KEY });
  });

  it("retries network failures with the same key", async () => {
    const { client, fetchImpl, sleep } = clientWith(new TypeError("offline"), respond(200, success));
    await expect(client.tap(KEY)).resolves.toMatchObject({ kind: "success" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)));
    expect(bodies[0]).toEqual(bodies[1]);
  });

  it("retries gateway errors, then gives up with a friendly message", async () => {
    const { client, fetchImpl } = clientWith(respond(503, {}), respond(503, {}), respond(503, { error: "down", code: "INTERNAL_ERROR" }));
    await expect(client.tap(KEY)).resolves.toEqual({ kind: "error", message: "down" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up after repeated network failures", async () => {
    const { client } = clientWith(new TypeError("x"), new TypeError("x"), new TypeError("x"));
    await expect(client.tap(KEY)).resolves.toMatchObject({ kind: "error" });
  });

  it("maps cooldown, daily limit and auth responses", async () => {
    await expect(
      clientWith(respond(429, { error: "", code: "COOLDOWN_ACTIVE" }, { "Retry-After": "2" })).client.tap(KEY),
    ).resolves.toEqual({ kind: "cooldown", retryAfterMs: 2000 });
    await expect(clientWith(respond(429, { error: "", code: "DAILY_LIMIT_REACHED" })).client.tap(KEY)).resolves.toEqual({
      kind: "daily_limit",
    });
    await expect(clientWith(respond(401, { error: "", code: "AUTHENTICATION_REQUIRED" })).client.tap(KEY)).resolves.toEqual({
      kind: "unauthenticated",
    });
  });

  it("does not retry client errors", async () => {
    const { client, fetchImpl } = clientWith(respond(400, { error: "bad", code: "VALIDATION_FAILED" }));
    await expect(client.tap(KEY)).resolves.toEqual({ kind: "error", message: "bad" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
