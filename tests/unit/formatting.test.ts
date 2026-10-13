import { describe, expect, it } from "vitest";
import { formatCoins, formatCount, formatSignedCoins } from "@/lib/formatting/coins";
import { formatDateTimeUtc, formatShortDay } from "@/lib/formatting/dates";
import { transactionTypeLabel } from "@/lib/formatting/transactions";

describe("formatting", () => {
  it("formats virtual coin amounts", () => {
    expect(formatCoins(0)).toBe("0 VC");
    expect(formatCoins(1234567)).toBe("1,234,567 VC");
    expect(formatSignedCoins(10)).toBe("+10 VC");
    expect(formatSignedCoins(-5)).toBe("−5 VC");
    expect(formatCount(1000)).toBe("1,000");
  });

  it("formats dates in UTC regardless of the host time zone", () => {
    expect(formatShortDay("2026-10-12")).toBe("Oct 12");
    expect(formatDateTimeUtc("2026-10-12T23:59:30.5+00:00")).toBe("Oct 12, 2026, 23:59:30 UTC");
  });

  it("labels transaction types", () => {
    expect(transactionTypeLabel("tap_reward")).toBe("Tap reward");
    expect(transactionTypeLabel("admin_adjustment")).toBe("Adjustment");
  });
});
