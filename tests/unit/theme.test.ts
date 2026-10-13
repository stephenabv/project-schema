import { describe, expect, it } from "vitest";
import { isTheme, oppositeTheme, THEME_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme/theme";

describe("theme helpers", () => {
  it.each([
    ["light", true],
    ["dark", true],
    ["system", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("isTheme(%j) is %s", (value, expected) => {
    expect(isTheme(value)).toBe(expected);
  });

  it("flips between the two themes", () => {
    expect(oppositeTheme("light")).toBe("dark");
    expect(oppositeTheme("dark")).toBe("light");
  });

  it("the pre-paint script reads the same storage key the toggle writes", () => {
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(THEME_SCRIPT).toContain("prefers-color-scheme: dark");
  });
});
