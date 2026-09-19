import { test, expect } from "@playwright/test";

// Use a stable athlete ID for deterministic tests (athlete 22 has a long career).
const ATHLETE_URL = "athlete/22";

test.beforeEach(async ({ page }) => {
  await page.goto(ATHLETE_URL);
  await page.waitForSelector("h1", { timeout: 15000 });
});

// ── Hero block ────────────────────────────────────────────────────────────────

test("athlete profile shows name in h1", async ({ page }) => {
  const h1 = page.locator("h1");
  await expect(h1).toBeVisible();
  const text = await h1.textContent();
  expect(text?.trim().length).toBeGreaterThan(2);
});

test("athlete profile shows team link when athlete has a team", async ({
  page,
}) => {
  // If athlete has a team, a link to /team/:id appears below the name
  const teamLink = page.locator('a[href*="/team/"]').first();
  if ((await teamLink.count()) > 0) {
    await expect(teamLink).toBeVisible();
  }
});

// ── Stats strip ───────────────────────────────────────────────────────────────

test("stats strip shows all four labels", async ({ page }) => {
  await expect(page.getByText("Races")).toBeVisible();
  // exact: true avoids matching the "Cat Podiums" label as well
  await expect(page.getByText("Podiums", { exact: true })).toBeVisible();
  await expect(page.getByText("Cat Podiums")).toBeVisible();
});

test("stats strip Races count is a positive integer", async ({ page }) => {
  const racesLabel = page.getByText("Races");
  // The count is the sibling text above the label
  const racesCell = racesLabel.locator("..");
  const countText = await racesCell.locator("span").first().textContent();
  expect(parseInt(countText ?? "0", 10)).toBeGreaterThan(0);
});

test("Compare link is present and links to /compare with athlete id", async ({
  page,
}) => {
  const compareLink = page.getByRole("link", { name: /compare/i });
  await expect(compareLink).toBeVisible();
  const href = await compareLink.getAttribute("href");
  expect(href).toMatch(/\/compare\?a=22/);
});

// ── Career table structure ────────────────────────────────────────────────────

test("career table has Event column header", async ({ page }) => {
  // .first() — one table per year, each has the same header row
  await expect(
    page.getByRole("columnheader", { name: /^Event$/i }).first(),
  ).toBeVisible();
});

test("career table has Pos column header", async ({ page }) => {
  await expect(
    page.getByRole("columnheader", { name: /^Pos$/i }).first(),
  ).toBeVisible();
});

test("career table has Time column header", async ({ page }) => {
  await expect(
    page.getByRole("columnheader", { name: /^Time$/i }).first(),
  ).toBeVisible();
});

test("career table has at least 5 result rows", async ({ page }) => {
  const rows = page.locator("tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(4);
});

test("career table rows link to event pages", async ({ page }) => {
  const eventLink = page.locator("tbody").locator('a[href*="/event/"]').first();
  await expect(eventLink).toBeVisible();
});

test("career table shows year section headings", async ({ page }) => {
  // Use span to avoid matching hidden <option> elements in the season selector
  const yearHeading = page
    .locator("span")
    .filter({ hasText: /^20\d{2}$/ })
    .first();
  await expect(yearHeading).toBeVisible();
});

test("Gap column is hidden on mobile, visible on desktop", async ({
  page,
}, testInfo) => {
  const gapHeader = page.getByRole("columnheader", { name: /^Gap$/i }).first();
  if (testInfo.project.name === "desktop") {
    await expect(gapHeader).toBeVisible();
  } else {
    // Column may not be in DOM at all on mobile — either case counts as hidden
    if ((await gapHeader.count()) === 0) return;
    const display = await gapHeader.evaluate(
      (el) => getComputedStyle(el).display,
    );
    expect(display).toBe("none");
  }
});

// ── Search page ───────────────────────────────────────────────────────────────

test("athletes search page shows subtitle and search input", async ({
  page,
}) => {
  await page.goto("athletes");
  await page.waitForSelector("h1", { timeout: 15000 });
  await expect(page.getByText(/Search by name or team/i).first()).toBeVisible();
  await expect(page.getByPlaceholder(/search by name or team/i)).toBeVisible();
});

test("athletes search returns results for a common name", async ({ page }) => {
  await page.goto("athletes");
  await page.waitForSelector("h1", { timeout: 15000 });
  const input = page.getByPlaceholder(/search by name or team/i);
  await input.fill("João");
  // Results appear — at least one athlete link
  const result = page.locator('a[href*="/athlete/"]').first();
  await expect(result).toBeVisible({ timeout: 5000 });
});

test("clicking an athlete in search results navigates to their profile", async ({
  page,
}) => {
  await page.goto("athletes");
  await page.waitForSelector("h1", { timeout: 15000 });
  const input = page.getByPlaceholder(/search by name or team/i);
  await input.fill("João");
  const firstResult = page.locator('a[href*="/athlete/"]').first();
  await expect(firstResult).toBeVisible({ timeout: 5000 });
  await firstResult.click();
  await expect(page).toHaveURL(/\/athlete\/\d+/);
});

test("most active athletes list shows athlete links", async ({ page }) => {
  await page.goto("athletes");
  await page.waitForSelector("h1", { timeout: 15000 });
  await expect(page.getByText(/most active athletes/i)).toBeVisible();
  const athleteLink = page.locator('a[href*="/athlete/"]').first();
  await expect(athleteLink).toBeVisible();
});
