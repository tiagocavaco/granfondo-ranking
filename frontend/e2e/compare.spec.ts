import { test, expect } from "@playwright/test";

// Athletes 22 and 24 share multiple events — reliable for comparison tests.
const COMPARE_URL = "compare?a=22&b=24";

test.describe("Compare — empty state", () => {
  test("heading reads Head-to-Head", async ({ page }) => {
    await page.goto("compare");
    await page.waitForSelector("h1", { timeout: 15000 });
    await expect(
      page.getByRole("heading", { name: /head.to.head/i }),
    ).toBeVisible();
  });

  test("shows VS prompt and subtitle", async ({ page }) => {
    await page.goto("compare");
    await page.waitForSelector("h1", { timeout: 15000 });
    await expect(page.getByText(/pick two athletes/i)).toBeVisible();
    await expect(page.locator("text=⚡ VS ⚡")).toBeVisible();
  });

  test("shows Compare athletes subtitle text", async ({ page }) => {
    await page.goto("compare");
    await page.waitForSelector("h1", { timeout: 15000 });
    await expect(page.getByText(/compare two athletes/i)).toBeVisible();
  });
});

test.describe("Compare — loaded with two athletes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COMPARE_URL);
    await page.waitForSelector("h1", { timeout: 15000 });
  });

  // ── Two hero cards ──────────────────────────────────────────────────────────

  test("shows two athlete name headings", async ({ page }) => {
    // Each ComparisonHeroCard renders an h2 with the athlete name
    const heroHeadings = page.locator("h2").filter({ hasText: /\w{3,}/ });
    const count = await heroHeadings.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("each hero card shows Wins stat", async ({ page }) => {
    const winsLabels = page.getByText("Wins");
    expect(await winsLabels.count()).toBeGreaterThanOrEqual(2);
  });

  test("each hero card shows Podiums stat", async ({ page }) => {
    const podiumsLabels = page.getByText("Podiums");
    expect(await podiumsLabels.count()).toBeGreaterThanOrEqual(2);
  });

  test("each hero card shows Races stat", async ({ page }) => {
    const racesLabels = page.getByText("Races");
    expect(await racesLabels.count()).toBeGreaterThanOrEqual(2);
  });

  test("hero cards link to individual athlete profiles", async ({ page }) => {
    const athleteLinks = page.locator('a[href*="/athlete/"]');
    const count = await athleteLinks.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ── Chart ───────────────────────────────────────────────────────────────────

  test("Overall Trend chart heading is visible", async ({ page }) => {
    await expect(page.getByText("Overall Trend")).toBeVisible();
  });

  test("chart SVG is rendered", async ({ page }) => {
    // Recharts renders an SVG inside the chart container
    const chart = page.locator(".recharts-wrapper").first();
    await expect(chart).toBeVisible();
  });

  // ── Shared events table ─────────────────────────────────────────────────────

  test("shared events table has Event column header", async ({ page }) => {
    // .first() — one table per year group, each repeats the header
    await expect(
      page.getByRole("columnheader", { name: /^Event$/i }).first(),
    ).toBeVisible();
  });

  test("shared events table has Winner column header", async ({ page }) => {
    await expect(
      page.getByRole("columnheader", { name: /^Winner$/i }).first(),
    ).toBeVisible();
  });

  test("shared events table has at least one data row", async ({ page }) => {
    const rows = page.locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test("shared events rows link to event pages", async ({ page }) => {
    const eventLink = page
      .locator("tbody")
      .locator('a[href*="/event/"]')
      .first();
    await expect(eventLink).toBeVisible();
  });

  test("shared events table year heading is shown", async ({ page }) => {
    // Year headings are h2 elements in SharedEventsTable
    const yearHeading = page
      .locator("h2")
      .filter({ hasText: /^20\d{2}$/ })
      .first();
    await expect(yearHeading).toBeVisible();
  });

  // ── URL state ───────────────────────────────────────────────────────────────

  test("page URL contains both athlete IDs as query params", async ({
    page,
  }) => {
    await expect(page).toHaveURL(/a=22/);
    await expect(page).toHaveURL(/b=24/);
  });
});
