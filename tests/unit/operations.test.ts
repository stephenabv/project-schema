import { describe, expect, it, vi } from "vitest";
import { estimatePending, GeneratorClient } from "@/lib/api/generator-client";
import { csvCell, toCsv } from "@/lib/csv/csv";
import { FeatureDisabledError, MaintenanceError } from "@/lib/errors";
import { toAppError } from "@/lib/supabase/errors";
import { scheduleInputSchema, toUtcInputValue, type GeneratorStatus } from "@/lib/validation/operations";

const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";
const noSleep = async () => {};

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("csvCell", () => {
  it.each([
    [null, ""],
    [undefined, ""],
    [42, "42"],
    [-3, "-3"],
    [true, "true"],
    ["plain", "plain"],
    ['say "hi", ok', '"say ""hi"", ok"'],
    ["line\nbreak", '"line\nbreak"'],
    ["=SUM(A1)", "'=SUM(A1)"],
    ["+1", "'+1"],
    ["-1", "'-1"],
    ["@cmd", "'@cmd"],
    ["\tTab", "'\tTab"],
    ["\rx", "\"'\rx\""],
  ])("encodes %j as %j", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it("builds CRLF CSV with a header row", () => {
    const csv = toCsv([{ header: "name", value: (r: { n: string }) => r.n }], [{ n: "a" }, { n: "b,c" }]);
    expect(csv).toBe('name\r\na\r\n"b,c"\r\n');
  });
});

describe("Phase 4 error mapping", () => {
  it("maps VE014 and VE007 to typed errors", () => {
    const disabled = toAppError({ code: "VE014", message: "x" }, "test");
    expect(disabled).toBeInstanceOf(FeatureDisabledError);
    expect(disabled.status).toBe(403);

    const maintenance = toAppError({ code: "VE007", message: "x" }, "test");
    expect(maintenance).toBeInstanceOf(MaintenanceError);
    expect(maintenance.status).toBe(503);
  });

  it("maps VE015 to 409 NOTHING_TO_COLLECT", () => {
    const error = toAppError({ code: "VE015", message: "x" }, "test");
    expect(error.status).toBe(409);
    expect(error.code).toBe("NOTHING_TO_COLLECT");
  });
});

describe("scheduleInputSchema", () => {
  it("reads datetime-local values as UTC and blanks as no limit", () => {
    expect(scheduleInputSchema.parse({ publishAt: "2026-10-14T09:30", unpublishAt: "" })).toEqual({
      publishAt: "2026-10-14T09:30:00.000Z",
      unpublishAt: null,
    });
  });

  it("rejects a window that ends before it starts and malformed values", () => {
    expect(scheduleInputSchema.safeParse({ publishAt: "2026-10-14T09:30", unpublishAt: "2026-10-14T09:00" }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ publishAt: "tomorrow", unpublishAt: "" }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ publishAt: "2026-02-31T09:00", unpublishAt: "" }).success).toBe(false);
  });

  it("round-trips to a datetime-local value", () => {
    expect(toUtcInputValue("2026-10-14T09:30:00Z")).toBe("2026-10-14T09:30");
    expect(toUtcInputValue(null)).toBe("");
  });
});

describe("estimatePending", () => {
  const status = {
    level: 1, maxLevel: 10, coinsPerHour: 6, capHours: 8, pendingCoins: 10, lastCollectedAt: null, fullAt: null,
    nextUpgradeCost: 600, nextCoinsPerHour: 12, balanceCoins: 0, currency: "VC", redeemable: false,
  } satisfies GeneratorStatus;

  it("adds accrual since render and caps at the generator's capacity", () => {
    expect(estimatePending(status, 0, 3_600_000)).toBe(16);
    expect(estimatePending(status, 0, 100 * 3_600_000)).toBe(48);
  });

  it("ignores clock skew and an unbuilt generator", () => {
    expect(estimatePending(status, 1000, 0)).toBe(10);
    expect(estimatePending({ ...status, level: 0 }, 0, 3_600_000)).toBe(0);
  });
});

describe("GeneratorClient", () => {
  it("posts the key and returns the server's result", async () => {
    const fetch = respond(200, { success: true, collectedCoins: 12 });
    expect(await new GeneratorClient(fetch, noSleep).collect(KEY)).toMatchObject({ kind: "success", data: { collectedCoins: 12 } });
    expect(fetch).toHaveBeenCalledWith("/api/generator/collect", expect.objectContaining({ body: JSON.stringify({ idempotencyKey: KEY }) }));
  });

  it.each([
    [409, "NOTHING_TO_COLLECT", "nothing_to_collect"],
    [409, "INSUFFICIENT_BALANCE", "insufficient_balance"],
    [409, "ACTION_NOT_ALLOWED", "max_level"],
  ])("maps %i %s", async (status, code, kind) => {
    expect(await new GeneratorClient(respond(status, { code, error: "x" }), noSleep).upgrade(KEY)).toEqual({ kind });
  });

  it("shows the server message for other failures and ignores prototype keys", async () => {
    expect(await new GeneratorClient(respond(403, { code: "FEATURE_DISABLED", error: "Off" }), noSleep).collect(KEY)).toEqual({
      kind: "error",
      message: "Off",
    });
    expect(await new GeneratorClient(respond(409, { code: "__proto__", error: "x" }), noSleep).collect(KEY)).toEqual({
      kind: "error",
      message: "x",
    });
    expect(await new GeneratorClient(respond(401, {}), noSleep).collect(KEY)).toEqual({ kind: "unauthenticated" });
  });

  it("retries a maintenance 503 with the same key", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    expect(await new GeneratorClient(fetch, noSleep).collect(KEY)).toMatchObject({ kind: "success" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1]?.body).toBe(fetch.mock.calls[1]?.[1]?.body);
  });

  it("returns null status on failure", async () => {
    expect(await new GeneratorClient(respond(500, {})).status()).toBeNull();
    expect(await new GeneratorClient(vi.fn(async () => Promise.reject(new Error("offline")))).status()).toBeNull();
  });
});
