import { expect, test } from "@playwright/test";

test.describe("public area", () => {
  test("landing page carries the virtual currency disclosure", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("virtual earnings");
    await expect(page.getByRole("complementary", { name: "Virtual currency disclosure" })).toContainText(
      "no monetary value",
    );
  });

  test("signed-out visitors are sent to login from protected pages", async ({ page }) => {
    for (const path of ["/dashboard", "/earn", "/wallet"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}`));
    }
  });

  test("protected APIs reject unauthenticated calls with 401", async ({ request }) => {
    const tap = await request.post("/api/earn/tap", {
      data: { idempotencyKey: "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10" },
    });
    expect(tap.status()).toBe(401);
    for (const path of ["/api/wallet", "/api/transactions", "/api/dashboard"]) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
  });

  test("auth callback refuses open redirects", async ({ page }) => {
    await page.goto("/auth/callback?next=//evil.example");
    await expect(page).toHaveURL(/\/login\?error=link_invalid$/);
  });
});
