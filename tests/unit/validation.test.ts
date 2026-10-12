import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema, resetPasswordSchema, fieldErrorsOf } from "@/lib/validation/auth";
import { tapRequestSchema } from "@/lib/validation/earn";
import { queryRecord, transactionQuerySchema } from "@/lib/validation/transactions";

const validRegistration = {
  email: "  Player@Example.COM ",
  username: "player_1",
  password: "secret123",
  acknowledgeVirtual: "on",
};

describe("registerSchema", () => {
  it("normalises email and accepts a valid registration", () => {
    const result = registerSchema.parse(validRegistration);
    expect(result.email).toBe("player@example.com");
  });

  it.each([
    ["ab", "too short"],
    ["a".repeat(25), "too long"],
    ["bad name", "contains a space"],
    ["<script>", "contains markup"],
  ])("rejects username %j (%s)", (username) => {
    expect(registerSchema.safeParse({ ...validRegistration, username }).success).toBe(false);
  });

  it.each(["short1", "lettersonly", "12345678", "a1".repeat(40)])("rejects weak or oversized password %j", (password) => {
    expect(registerSchema.safeParse({ ...validRegistration, password }).success).toBe(false);
  });

  it("requires acknowledging that coins are virtual", () => {
    const result = registerSchema.safeParse({ ...validRegistration, acknowledgeVirtual: undefined });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsOf(result.error).acknowledgeVirtual).toMatch(/virtual/);
  });

  it("ignores extra fields such as a smuggled role", () => {
    const result = registerSchema.parse({ ...validRegistration, role: "admin" });
    expect(result).not.toHaveProperty("role");
  });
});

describe("loginSchema / resetPasswordSchema", () => {
  it("requires a password on login", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("requires matching passwords on reset", () => {
    const result = resetPasswordSchema.safeParse({ password: "secret123", confirmPassword: "secret124" });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsOf(result.error).confirmPassword).toBe("Passwords do not match");
  });
});

describe("tapRequestSchema", () => {
  it("accepts only an idempotency key", () => {
    expect(tapRequestSchema.safeParse({ idempotencyKey: "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10" }).success).toBe(true);
  });

  it("rejects client-supplied reward amounts", () => {
    expect(
      tapRequestSchema.safeParse({ idempotencyKey: "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10", rewardCoins: 1_000_000 })
        .success,
    ).toBe(false);
  });

  it.each([undefined, "", "not-a-uuid", 42])("rejects idempotency key %j", (idempotencyKey) => {
    expect(tapRequestSchema.safeParse({ idempotencyKey }).success).toBe(false);
  });
});

describe("transactionQuerySchema", () => {
  it("applies defaults", () => {
    expect(transactionQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it("coerces and bounds the limit", () => {
    expect(transactionQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(transactionQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(transactionQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("validates type and dates", () => {
    expect(transactionQuerySchema.safeParse({ type: "withdrawal" }).success).toBe(false);
    expect(transactionQuerySchema.safeParse({ from: "2026-13-01" }).success).toBe(false);
    expect(transactionQuerySchema.safeParse({ from: "2026-10-12", to: "2026-10-01" }).success).toBe(false);
    expect(transactionQuerySchema.parse({ type: "tap_reward", from: "2026-10-01", to: "2026-10-12" })).toMatchObject({
      type: "tap_reward",
    });
  });
});

describe("queryRecord", () => {
  it("drops empty values and takes the first array value", () => {
    expect(queryRecord({ type: "", from: ["2026-10-01", "x"], to: undefined, limit: " 5 " })).toEqual({
      from: "2026-10-01",
      limit: "5",
    });
    expect(queryRecord(new URLSearchParams("type=tap_reward&cursor="))).toEqual({ type: "tap_reward" });
  });
});
