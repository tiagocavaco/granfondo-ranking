import { test, expect, type Page } from "@playwright/test";

// Pick the first two athletes from a finished event's results page.
// Athletes who finished the same race definitely share at least one event,
// and top granfondo finishers race multiple events per season, making the
// head-to-head chart (which needs ≥2 shared events) reliable.
async function findTwoRacemates(page: Page): Promise<string> {
  // Navigate to home and click the first event that has results
  await page.goto("");
  await page.waitForSelector('a[href*="/event/"]', { timeout: 30000 });
  const eventLink = page
    .locator('a[href*="/event/"]')
    .filter({ hasText: /\d+\s*finishers/i })
    .first();
  await eventLink.click();
  await page.waitForURL(/\/event\/\d+/);
  await page.waitForSelector("tbody tr", { timeout: 30000 });

  const athleteLinks = page.locator("tbody").locator('a[href*="/athlete/"]');
  const href0 = (await athleteLinks.nth(0).getAttribute("href")) ?? "";
  const href1 = (await athleteLinks.nth(1).getAttribute("href")) ?? "";
  const idA = href0.match(/\/athlete\/(\d+)/)?.[1] ?? "";
  const idB = href1.match(/\/athlete\/(\d+)/)?.[1] ?? "";

  return `compare?a=${idA}&b=${idB}`;
}

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

// serial mode: all tests run in one worker sharing one page — beforeAll gets
// the page fixture directly, the DB is downloaded once, and beforeEach just
// navigates to the compare URL on the already-loaded page.
test.describe("Compare — loaded with two athletes", () => {
  test.describe.configure({ mode: "serial" });

  let compareUrl = "";

  test.beforeAll(async ({ page }) => {
    compareUrl = await findTwoRacemates(page);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(compareUrl);
    await page.waitForSelector("h1", { timeout: 15000 });
  });

  // ── Two hero cards ──────────────────────────────────────────────────────────

  test("shows two athlete names", async ({ page }) => {
    // ComparisonHeroCard renders the athlete name as a profile link
    const nameLinks = page.locator('a[href*="/athlete/"]');
    const count = await nameLinks.count();
    expect(count).toBeGreaterThanOrEqual(2);
    const name0 = await nameLinks.nth(0).textContent();
    const name1 = await nameLinks.nth(1).textContent();
    expect(name0?.trim().length).toBeGreaterThan(2);
    expect(name1?.trim().length).toBeGreaterThan(2);
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
    // Winner column is hidden md:table-cell — display:none below 768px so getByRole can't find it
    // Use a CSS locator so DOM-attached but non-visible elements are matched
    await expect(
      page
        .locator("th")
        .filter({ hasText: /^Winner$/ })
        .first(),
    ).toBeAttached();
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
    await expect(page).toHaveURL(/a=\d+/);
    await expect(page).toHaveURL(/b=\d+/);
  });
});
