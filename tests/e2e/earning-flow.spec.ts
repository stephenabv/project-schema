import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// The full vertical slice against a real Supabase stack:
// register -> dashboard -> tap -> persisted balance -> ledger -> sign out.
test.describe.configure({ mode: "serial" });

test("a new user taps and sees server-confirmed running earnings", async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `player_${suffix}@example.test`;
  const username = `player_${suffix}`;

  await page.goto("/register");
  await expect(page.getByRole("complementary").or(page.getByText("no monetary value")).first()).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("0 VC").first()).toBeVisible();
  await expect(page.getByText("Virtual · non-redeemable").first()).toBeVisible();

  await page.getByRole("link", { name: "Start tapping" }).click();
  await expect(page).toHaveURL(/\/earn$/);

  const tapButton = page.getByRole("button", { name: /Tap to earn/ });
  await tapButton.click();
  await expect(page.getByText("10 VC").first()).toBeVisible();
  await expect(page.getByText("1 / 1,000")).toBeVisible();

  // Wait out the one-second server cooldown, then tap again.
  await expect(tapButton).toHaveAttribute("aria-disabled", "false", { timeout: 5_000 });
  await tapButton.click();
  await expect(page.getByText("20 VC").first()).toBeVisible();
  await expect(page.getByText("2 / 1,000")).toBeVisible();

  // The balance is persisted server-side, not just in the browser.
  await page.reload();
  await expect(page.getByText("20 VC").first()).toBeVisible();

  await page.goto("/wallet");
  await expect(page.getByRole("complementary", { name: "Virtual currency disclosure" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Tap reward" })).toHaveCount(2);

  await page.goto("/dashboard");
  await expect(page.getByText("Taps completed")).toBeVisible();
  await expect(page.getByRole("figure")).toBeVisible();

  // The browser session cannot be used to inflate the balance directly.
  const forged = await page.request.post("/api/earn/tap", {
    data: { idempotencyKey: randomUUID(), rewardCoins: 1_000_000 },
  });
  expect(forged.status()).toBe(400);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=/);

  // A fresh, unauthenticated client gets nothing.
  expect((await request.get("/api/wallet")).status()).toBe(401);
});
