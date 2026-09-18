import { test, expect } from "@playwright/test";

// Navigate to a finished event (one with results) via the home page.
async function goToFinishedEvent(page: import("@playwright/test").Page) {
  await page.goto("");
  await page.waitForSelector("h1", { timeout: 15000 });
  const link = page
    .locator('a[href*="/event/"]')
    .filter({ hasText: /\d+\s*finishers/i })
    .first();
  await link.click();
  await page.waitForURL(/\/event\/\d+/);
  await page.waitForSelector("h1", { timeout: 10000 });
}

// ── Hero block ────────────────────────────────────────────────────────────────

test("finished event shows event name in h1", async ({ page }) => {
  await goToFinishedEvent(page);
  const h1 = page.locator("h1");
  await expect(h1).toBeVisible();
  const text = await h1.textContent();
  expect(text?.trim().length).toBeGreaterThan(3);
});

test("finished event shows Finished status badge", async ({ page }) => {
  await goToFinishedEvent(page);
  await expect(page.getByText("Finished")).toBeVisible();
});

test("finished event hero has green top accent line", async ({ page }) => {
  await goToFinishedEvent(page);
  const accent = page.locator('[class*="via-emerald-500"]').first();
  await expect(accent).toBeAttached();
});

test("finished event shows location text", async ({ page }) => {
  await goToFinishedEvent(page);
  // Location appears as plain text in the hero — non-empty
  // The location is inside a row below the heading
  const locationRow = page.getByText(
    /Portugal|Lisboa|Porto|Algarve|Setúbal|Sintra|Cascais|Évora|Aveiro|Braga|Coimbra|Alentejo|Madeira/i,
  );
  await expect(locationRow.first()).toBeVisible();
});

test("finished event shows finisher count", async ({ page }) => {
  await goToFinishedEvent(page);
  await expect(page.getByText(/\d[\d,]*/).first()).toBeVisible();
  await expect(page.getByText("finishers").first()).toBeVisible();
});

test("event detail has back-to-events link", async ({ page }) => {
  await goToFinishedEvent(page);
  // "← " or similar back arrow exists somewhere
  await expect(
    page
      .locator("a")
      .filter({ hasText: /events|back/i })
      .first(),
  ).toBeVisible();
});

// ── Results table structure ───────────────────────────────────────────────────

test("results table has Pos column header", async ({ page }) => {
  await goToFinishedEvent(page);
  await expect(
    page.getByRole("columnheader", { name: /^Pos$/i }),
  ).toBeVisible();
});

test("results table has Athlete column header", async ({ page }) => {
  await goToFinishedEvent(page);
  await expect(
    page.getByRole("columnheader", { name: /^Athlete$/i }),
  ).toBeVisible();
});

test("results table has Time column header", async ({ page }) => {
  await goToFinishedEvent(page);
  await expect(
    page.getByRole("columnheader", { name: /^Time$/i }),
  ).toBeVisible();
});

test("results table has at least 10 data rows", async ({ page }) => {
  await goToFinishedEvent(page);
  const rows = page.locator("tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(9);
});

test("results table row 1 has position badge with rank 1", async ({ page }) => {
  await goToFinishedEvent(page);
  // First data row — position cell shows "1"
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toContainText("1");
});

test("results table athlete names link to athlete profiles", async ({
  page,
}) => {
  await goToFinishedEvent(page);
  const athleteLink = page
    .locator("tbody")
    .locator('a[href*="/athlete/"]')
    .first();
  await expect(athleteLink).toBeVisible();
});

test("results table has distance filter above the table", async ({ page }) => {
  await goToFinishedEvent(page);
  // Distance selector / segmented control above the table
  const distanceControl = page
    .getByText(/Granfondo|Mediofondo|Minifondo/)
    .first();
  await expect(distanceControl).toBeVisible();
});

test("results table search input filters rows", async ({ page }) => {
  await goToFinishedEvent(page);
  const search = page.getByPlaceholder(/search/i).first();
  await search.fill("zzznomatch999");
  // No results — either 0 rows or empty state text
  const rows = page.locator("tbody tr");
  const emptyText = page.getByText(/no results found|no athletes/i);
  const rowCount = await rows.count();
  const emptyCount = await emptyText.count();
  expect(rowCount === 0 || emptyCount > 0).toBeTruthy();
});

// ── Desktop Gap column ─────────────────────────────────────────────────────────

test("Gap column header is visible at desktop width", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") {
    test.skip();
    return;
  }
  await goToFinishedEvent(page);
  const gapHeader = page.getByRole("columnheader", { name: /^Gap$/i });
  await expect(gapHeader).toBeVisible();
});

// ── Athlete profile navigation ────────────────────────────────────────────────

test("clicking athlete name in results navigates to athlete profile", async ({
  page,
}) => {
  await goToFinishedEvent(page);
  const athleteLink = page
    .locator("tbody")
    .locator('a[href*="/athlete/"]')
    .first();
  await athleteLink.click();
  await expect(page).toHaveURL(/\/athlete\/\d+/);
  await expect(page.locator("h1")).toBeVisible();
});
