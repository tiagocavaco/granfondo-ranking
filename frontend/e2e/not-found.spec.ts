import { test, expect } from "@playwright/test";

// ── /events redirect ──────────────────────────────────────────────────────────

test("/events redirects to / (events list)", async ({ page }) => {
  await page.goto("events");
  await expect(page).toHaveURL(/\/granfondo-ranking\/?$/);
  await page.waitForSelector("h1", { timeout: 15000 });
  await expect(page.locator("h1")).toContainText(/race events/i);
});

// ── Catch-all 404 ─────────────────────────────────────────────────────────────

test("unknown route shows luxury 404 with Events link", async ({ page }) => {
  await page.goto("this-does-not-exist");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByText(/page not found/i)).toBeVisible();
  await expect(
    page.locator("main").getByRole("link", { name: /events/i }),
  ).toBeVisible();
});

test("404 Events link navigates to home", async ({ page }) => {
  await page.goto("this-does-not-exist");
  await page
    .locator("main")
    .getByRole("link", { name: /events/i })
    .click();
  await expect(page).toHaveURL(/\/granfondo-ranking\/?$/);
});

// ── Athlete not found ─────────────────────────────────────────────────────────

test("invalid athlete ID shows luxury 404 with Athletes link", async ({
  page,
}) => {
  await page.goto("athlete/999999999");
  await page.waitForSelector("h1", { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByText(/athlete not found/i)).toBeVisible();
  await expect(
    page.locator("main").getByRole("link", { name: /athletes/i }),
  ).toBeVisible();
});

test("athlete 404 Athletes link navigates to athletes page", async ({
  page,
}) => {
  await page.goto("athlete/999999999");
  await page.waitForSelector("h1", { timeout: 15000 });
  await page
    .locator("main")
    .getByRole("link", { name: /athletes/i })
    .click();
  await expect(page).toHaveURL(/\/athletes/);
});

// ── Team not found ────────────────────────────────────────────────────────────

test("invalid team ID shows luxury 404 with Events link", async ({ page }) => {
  await page.goto("team/999999999");
  await page.waitForSelector("h1", { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByText(/team not found/i)).toBeVisible();
  await expect(
    page.locator("main").getByRole("link", { name: /events/i }),
  ).toBeVisible();
});

test("team 404 Events link navigates to home", async ({ page }) => {
  await page.goto("team/999999999");
  await page.waitForSelector("h1", { timeout: 15000 });
  await page
    .locator("main")
    .getByRole("link", { name: /events/i })
    .click();
  await expect(page).toHaveURL(/\/granfondo-ranking\/?$/);
});

// ── Event not found ───────────────────────────────────────────────────────────

test("invalid event ID shows luxury 404 with Events link", async ({ page }) => {
  await page.goto("event/999999999");
  await page.waitForSelector("h1", { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByText(/event not found/i)).toBeVisible();
  await expect(
    page.locator("main").getByRole("link", { name: /events/i }),
  ).toBeVisible();
});

test("event 404 Events link navigates to home", async ({ page }) => {
  await page.goto("event/999999999");
  await page.waitForSelector("h1", { timeout: 15000 });
  await page
    .locator("main")
    .getByRole("link", { name: /events/i })
    .click();
  await expect(page).toHaveURL(/\/granfondo-ranking\/?$/);
});
