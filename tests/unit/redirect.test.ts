import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/wallet", "/wallet"],
    ["/wallet?type=tap_reward", "/wallet?type=tap_reward"],
    ["/earn#tap", "/earn#tap"],
  ])("keeps same-origin path %j", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "",
    null,
    undefined,
    42,
    `/${"a".repeat(600)}`,
  ])("falls back for unsafe value %j", (input) => {
    expect(safeRedirectPath(input)).toBe("/dashboard");
  });

  it("uses the provided fallback", () => {
    expect(safeRedirectPath("//x", "/login")).toBe("/login");
  });
});
