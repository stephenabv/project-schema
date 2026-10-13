import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// Signed-in players never land on guest pages, and no page scrolls sideways on a phone.
test.describe.configure({ mode: "serial" });

const PHONE = { width: 360, height: 760 };

async function expectNoHorizontalOverflow(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${path} is wider than the screen`).toBeLessThanOrEqual(clientWidth);
}

test("guests see the landing page and no overflow at phone width", async ({ page }) => {
  await page.setViewportSize(PHONE);
  expect(await (await page.request.get("/api/auth/session")).json()).toEqual({ authenticated: false });
  for (const path of ["/", "/about", "/login", "/register"]) await expectNoHorizontalOverflow(page, path);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "I have an account" })).toBeVisible();
});

test("signed-in players are sent from guest pages to the app", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(PHONE);
  const suffix = randomUUID().slice(0, 8);
  const email = `session_${suffix}@example.test`;

  await page.goto("/register");
  await page.getByLabel("Username").fill(`session_${suffix}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  for (const path of ["/", "/login", "/register"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/dashboard$/);
  }
  await page.goto("/login?next=%2Fwallet");
  await expect(page).toHaveURL(/\/wallet$/);
  await page.goto("/login?next=%2F%2Fevil.example");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/about");
  await expect(page.getByRole("link", { name: "Open app" })).toBeVisible();

  for (const path of ["/dashboard", "/earn", "/missions", "/wallet", "/profile", "/settings", "/leaderboard", "/shop"]) {
    await expectNoHorizontalOverflow(page, path);
  }

  // Back after signing in returns to the app, not to the sign-in form.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await page.getByRole("link", { name: "I have an account" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
});
