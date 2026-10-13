import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// The full vertical slice against a real Supabase stack:
// register -> dashboard -> tap (+ first badge) -> persisted balance -> mission claim -> ledger
// -> daily bonus -> shop -> leaderboard -> notifications -> sign out.
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

  // The first tap pays 2 VC and unlocks the "First Tap" badge (+10 VC).
  const tapButton = page.getByRole("button", { name: /Tap to earn/ });
  await tapButton.click();
  await expect(page.getByText("12 VC", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 / 500")).toBeVisible();
  await expect(page.getByText(/New badge unlocked: First Tap/)).toBeVisible();

  // Wait out the one-second server cooldown, then tap again.
  await expect(tapButton).toHaveAttribute("aria-disabled", "false", { timeout: 5_000 });
  await tapButton.click();
  await expect(page.getByText("14 VC", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("2 / 500")).toBeVisible();

  // The balance is persisted server-side, not just in the browser.
  await page.reload();
  await expect(page.getByText("14 VC", { exact: true }).first()).toBeVisible();

  // The one-time "First Steps" mission is complete; claiming it also unlocks "On a Mission".
  await page.goto("/missions");
  await page.getByRole("button", { name: "Claim First Steps" }).click();
  await expect(page.getByText(/Claimed First Steps/)).toBeVisible();
  await expect(page.getByText(/On a Mission/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Claim First Steps" })).toHaveCount(0);

  // Claims cannot be replayed with a new key once paid.
  const missions = (await (await page.request.get("/api/tasks")).json()) as { missions: { id: string; slug: string }[] };
  const firstSteps = missions.missions.find((m) => m.slug === "first-steps");
  expect(firstSteps).toBeDefined();
  const again = await page.request.post(`/api/tasks/${firstSteps!.id}/claim`, { data: { idempotencyKey: randomUUID() } });
  expect(again.status()).toBe(409);

  await page.goto("/achievements");
  await expect(page.getByText("2 of 13 badges unlocked")).toBeVisible();

  await page.goto("/wallet");
  await expect(page.getByRole("complementary", { name: "Virtual currency disclosure" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Tap reward" })).toHaveCount(2);
  await expect(page.getByRole("cell", { name: "Badge reward" })).toHaveCount(2);

  await page.goto("/dashboard");
  await expect(page.getByText("Taps completed")).toBeVisible();
  // 2 taps (4) + First Tap (10) + First Steps (25) + On a Mission (50).
  await expect(page.getByText("89 VC", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("figure")).toBeVisible();

  // Daily check-in: day one pays 20 VC, and a second claim the same UTC day is refused.
  await page.getByRole("button", { name: "Claim +20 VC" }).click();
  await expect(page.getByText(/Claimed \+20 VC/)).toBeVisible();
  await expect(page.getByText("109 VC", { exact: true }).first()).toBeVisible();
  const bonusAgain = await page.request.post("/api/daily-bonus", { data: { idempotencyKey: randomUUID() } });
  expect(bonusAgain.status()).toBe(409);

  // The shop prices in virtual coins and the server enforces balance and level.
  await page.goto("/shop");
  await expect(page.getByRole("button", { name: "Buy Tapper for 150 VC" })).toBeDisabled();
  await expect(page.getByText("Level 8 required")).toBeVisible();
  const shop = (await (await page.request.get("/api/shop")).json()) as { items: { id: string; slug: string }[] };
  const tapper = shop.items.find((i) => i.slug === "title-tapper");
  const broke = await page.request.post(`/api/shop/${tapper!.id}/purchase`, { data: { idempotencyKey: randomUUID() } });
  expect(broke.status()).toBe(409);

  await page.goto("/leaderboard");
  await expect(page.getByRole("listitem").filter({ hasText: username }).getByText("(you)")).toBeVisible();

  await page.goto("/notifications");
  await expect(page.getByText("Badge unlocked: First Tap")).toBeVisible();
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("All caught up")).toBeVisible();

  // The idle generator costs more than a new player holds, and nothing accrues before it is built.
  await page.goto("/generator");
  await expect(page.getByRole("heading", { name: "Starter generator" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Build for 150 VC" })).toBeDisabled();
  const early = await page.request.post("/api/generator/collect", { data: { idempotencyKey: randomUUID() } });
  expect(early.status()).toBe(404);

  // Robots are bought with virtual coins only, and the server refuses a purchase the balance cannot cover.
  await page.goto("/robots");
  await expect(page.getByRole("heading", { name: "Scout Bot" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy Scout Bot for 500 VC" })).toBeDisabled();
  const robots = (await (await page.request.get("/api/robots")).json()) as { robots: { id: string; slug: string }[] };
  const scout = robots.robots.find((r) => r.slug === "scout-bot");
  expect(scout).toBeDefined();
  const unaffordable = await page.request.post(`/api/robots/${scout!.id}/purchase`, { data: { idempotencyKey: randomUUID() } });
  expect(unaffordable.status()).toBe(409);

  // The browser session cannot be used to inflate the balance directly.
  const forged = await page.request.post("/api/earn/tap", {
    data: { idempotencyKey: randomUUID(), rewardCoins: 1_000_000 },
  });
  expect(forged.status()).toBe(400);

  // Players cannot reach the admin console or its API.
  // (A streamed page cannot change its status code, so check the rendered result.)
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=/);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);

  // A fresh, unauthenticated client gets nothing.
  expect((await request.get("/api/wallet")).status()).toBe(401);
  expect((await request.get("/api/admin/analytics")).status()).toBe(401);
});
