import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateRobotPending, RobotClient } from "@/lib/api/robot-client";
import { RedemptionClient } from "@/lib/api/redemption-client";
import { maskAccountNumber, PayoutDetailsCipher } from "@/lib/crypto/payout-details";
import { NotConfiguredError } from "@/lib/errors";
import { centavosToInput, estimateCentavos, formatPhp, formatRate, parsePesosToCentavos } from "@/lib/formatting/money";
import {
  exchangeRateInputSchema,
  payoutRequestSchema,
  payoutTransitionSchema,
  redemptionPolicyInputSchema,
} from "@/lib/validation/redemption";
import { coinsPerMinute, paybackHours, robotInputSchema, robotPolicyInputSchema } from "@/lib/validation/robots";

const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";
const ID = "5d7e9a1c-2b3f-4c6d-8e9f-0a1b2c3d4e5f";
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

afterEach(() => vi.unstubAllEnvs());

describe("peso money helpers", () => {
  it("formats centavos as pesos", () => {
    expect(formatPhp(123450)).toBe("₱1,234.50");
    expect(formatPhp(0)).toBe("₱0.00");
    expect(centavosToInput(1050)).toBe("10.50");
    expect(formatRate(1000, 1000)).toBe("1,000 VC = ₱10.00");
  });

  it("parses typed pesos exactly, never through floating point", () => {
    expect(parsePesosToCentavos("10")).toBe(1000);
    expect(parsePesosToCentavos("10.5")).toBe(1050);
    expect(parsePesosToCentavos(" 1,234.56 ")).toBe(123456);
    expect(parsePesosToCentavos("0.29")).toBe(29);
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "10.", ".5"]) expect(parsePesosToCentavos(bad)).toBeNull();
  });

  it("rounds conversion estimates down like the database", () => {
    expect(estimateCentavos(1000, 1000, 1000)).toBe(1000);
    expect(estimateCentavos(1999, 1000, 1000)).toBe(1999);
    expect(estimateCentavos(7, 3, 1)).toBe(2);
    expect(estimateCentavos(Number.MAX_SAFE_INTEGER, 1, 100)).toBe(Number(BigInt(Number.MAX_SAFE_INTEGER) * BigInt(100)));
    expect(estimateCentavos(0, 1000, 1000)).toBe(0);
    expect(estimateCentavos(1.5, 1000, 1000)).toBe(0);
  });
});

describe("PayoutDetailsCipher", () => {
  const details = { accountName: "Juan Dela Cruz", accountNumber: "0917 123 4567" };

  it("round-trips details and never stores them in plain text", () => {
    const cipher = new PayoutDetailsCipher(TEST_KEY);
    const envelope = cipher.encrypt(details);
    expect(envelope).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(envelope).not.toContain("4567");
    expect(cipher.decrypt(envelope)).toEqual(details);
    expect(cipher.encrypt(details)).not.toBe(envelope);
  });

  it("rejects tampered, foreign or malformed envelopes", () => {
    const cipher = new PayoutDetailsCipher(TEST_KEY);
    const envelope = cipher.encrypt(details);
    const [v, iv, tag, data] = envelope.split(".");
    const flipped = `${data[0] === "A" ? "B" : "A"}${data.slice(1)}`;
    expect(cipher.decrypt([v, iv, tag, flipped].join("."))).toBeNull();
    expect(new PayoutDetailsCipher(Buffer.alloc(32, 9).toString("base64")).decrypt(envelope)).toBeNull();
    expect(cipher.decrypt("v2.a.b.c")).toBeNull();
    expect(cipher.decrypt("not-an-envelope")).toBeNull();
  });

  it("refuses to run without a 32-byte key", () => {
    vi.stubEnv("PAYOUT_DETAILS_KEY", "");
    expect(() => PayoutDetailsCipher.fromEnvironment()).toThrow(NotConfiguredError);
    expect(() => new PayoutDetailsCipher(Buffer.alloc(16).toString("base64"))).toThrow(NotConfiguredError);
    vi.stubEnv("PAYOUT_DETAILS_KEY", TEST_KEY);
    expect(PayoutDetailsCipher.fromEnvironment()).toBeInstanceOf(PayoutDetailsCipher);
  });

  it("masks account numbers to the last four characters", () => {
    expect(maskAccountNumber("0917-123-4567")).toBe("•••• 4567");
  });
});

describe("redemption validation", () => {
  it("validates payout requests strictly", () => {
    const request = { methodId: ID, amountCentavos: 10000, accountName: "Ma. José O'Neil", accountNumber: "0917 123 4567", idempotencyKey: KEY };
    expect(payoutRequestSchema.safeParse(request).success).toBe(true);
    expect(payoutRequestSchema.safeParse({ ...request, accountName: "<script>" }).success).toBe(false);
    expect(payoutRequestSchema.safeParse({ ...request, accountNumber: "12;DROP" }).success).toBe(false);
    expect(payoutRequestSchema.safeParse({ ...request, amountCentavos: 100.5 }).success).toBe(false);
    expect(payoutRequestSchema.safeParse({ ...request, status: "paid" }).success).toBe(false);
  });

  it("only marks a payout paid with a reference and a verified confirmation", () => {
    const base = { to: "paid", note: "", reason: "", paymentReference: "", verified: false };
    expect(payoutTransitionSchema.safeParse(base).success).toBe(false);
    expect(payoutTransitionSchema.safeParse({ ...base, paymentReference: "GC-12345" }).success).toBe(false);
    expect(payoutTransitionSchema.safeParse({ ...base, paymentReference: "GC-12345", verified: true }).success).toBe(true);
    expect(payoutTransitionSchema.safeParse({ ...base, to: "rejected" }).success).toBe(false);
    expect(payoutTransitionSchema.safeParse({ ...base, to: "rejected", reason: "Name mismatch" }).success).toBe(true);
  });

  it("parses exchange rates in pesos and caps them at one peso per VC", () => {
    const input = { rateCoins: "1000", ratePesos: "10.00", effectiveAt: "", reason: "Launch rate", confirmLargeChange: false };
    expect(exchangeRateInputSchema.parse(input)).toEqual({ ...input, rateCoins: 1000, ratePesos: 1000, effectiveAt: null });
    expect(exchangeRateInputSchema.parse({ ...input, effectiveAt: "2026-11-01T08:30" }).effectiveAt).toBe("2026-11-01T08:30:00.000Z");
    expect(exchangeRateInputSchema.safeParse({ ...input, ratePesos: "1000.01" }).success).toBe(false);
    expect(exchangeRateInputSchema.safeParse({ ...input, effectiveAt: "tomorrow" }).success).toBe(false);
    expect(exchangeRateInputSchema.safeParse({ ...input, reason: "" }).success).toBe(false);
  });

  it("keeps policy minimums below maximums", () => {
    const policy = {
      enabled: false, minConversionCoins: "10000", maxConversionCoins: "1000000", minPayoutPesos: "100", maxPayoutPesos: "50000",
      processingDays: "7", reason: "Initial limits", confirmation: "",
    };
    expect(redemptionPolicyInputSchema.parse(policy)).toMatchObject({ minPayoutPesos: 10000, maxPayoutPesos: 5000000 });
    expect(redemptionPolicyInputSchema.safeParse({ ...policy, minConversionCoins: "2000000" }).success).toBe(false);
    expect(redemptionPolicyInputSchema.safeParse({ ...policy, minPayoutPesos: "60000" }).success).toBe(false);
  });
});

describe("robot validation", () => {
  it("bounds robot definitions and limits", () => {
    const robot = {
      slug: "scout-bot", name: "Scout Bot", description: "", tier: "common", imageKey: "scout", priceCoins: "500",
      coinsPerHour: "10", maxPerUser: "5", levelRequired: "1", status: "active", sortOrder: "10",
    };
    expect(robotInputSchema.parse(robot)).toMatchObject({ priceCoins: 500, coinsPerHour: 10 });
    expect(robotInputSchema.safeParse({ ...robot, tier: "mythic" }).success).toBe(false);
    expect(robotInputSchema.safeParse({ ...robot, slug: "Bad Slug" }).success).toBe(false);
    expect(robotPolicyInputSchema.safeParse({ maxOwned: "5", maxActive: "6", accrualCapHours: "24" }).success).toBe(false);
  });

  it("derives display rates", () => {
    expect(coinsPerMinute(45)).toBe(0.75);
    expect(paybackHours(2000, 45)).toBe(45);
  });

  it("estimates pending robot coins without passing the storage cap", () => {
    const robot = { isActive: true, pendingCoins: 10, coinsPerHour: 60 };
    expect(estimateRobotPending(robot, 24, 0, 30 * 60_000)).toBe(40);
    expect(estimateRobotPending(robot, 1, 0, 10 * 3_600_000)).toBe(60);
    expect(estimateRobotPending({ ...robot, isActive: false }, 24, 0, 3_600_000)).toBe(0);
  });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("RobotClient and RedemptionClient", () => {
  it("posts only the idempotency key for purchases and maps outcomes", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, balanceCoins: 0 }));
    const client = new RobotClient(fetch, async () => {}, []);
    await expect(client.purchase(ID, KEY)).resolves.toMatchObject({ kind: "success" });
    expect(fetch).toHaveBeenCalledWith(`/api/robots/${ID}/purchase`, expect.objectContaining({ body: JSON.stringify({ idempotencyKey: KEY }) }));

    fetch.mockResolvedValue(jsonResponse(409, { error: "Not enough", code: "INSUFFICIENT_BALANCE" }));
    await expect(client.purchase(ID, KEY)).resolves.toEqual({ kind: "error", code: "INSUFFICIENT_BALANCE", message: "Not enough" });
    fetch.mockResolvedValue(jsonResponse(401, { error: "Sign in", code: "AUTHENTICATION_REQUIRED" }));
    await expect(client.setActive(ID, false, KEY)).resolves.toEqual({ kind: "unauthenticated" });
  });

  it("sends the rate the player saw with a conversion request", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(201, { reference: "CNV-261013-ABCDEFGH" }));
    const client = new RedemptionClient(fetch, async () => {}, []);
    await expect(client.requestConversion(10000, ID, KEY)).resolves.toMatchObject({ kind: "success" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/conversions",
      expect.objectContaining({ body: JSON.stringify({ coins: 10000, rateId: ID, idempotencyKey: KEY }) }),
    );
    fetch.mockResolvedValue(jsonResponse(409, { error: "Rate changed", code: "RATE_CHANGED" }));
    await expect(client.requestConversion(10000, ID, KEY)).resolves.toMatchObject({ kind: "error", code: "RATE_CHANGED" });
  });
});
