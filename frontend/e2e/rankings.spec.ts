import { test, expect } from "@playwright/test";

// ── Athlete ranking ───────────────────────────────────────────────────────────

test.describe("Athlete ranking", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ranking");
    await page.waitForSelector("h1", { timeout: 15000 });
  });

  test("page heading reads Athlete Ranking", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /athlete ranking/i }),
    ).toBeVisible();
  });

  test("stats show athletes scored count", async ({ page }) => {
    await expect(page.getByText(/athletes scored/i)).toBeVisible();
  });

  test("podium shows three cards for ranks 1, 2, 3", async ({ page }) => {
    // All three podium positions are rendered — check for rank numbers in cards
    const podiumNumbers = page
      .locator('[class*="font-black"]')
      .filter({ hasText: /^[123]$/ });
    expect(await podiumNumbers.count()).toBeGreaterThanOrEqual(3);
  });

  test("rank-1 podium card has amber/gold styling", async ({ page }) => {
    const goldCard = page.locator('[class*="amber"]').first();
    await expect(goldCard).toBeAttached();
  });

  test("table has Rank column header", async ({ page }) => {
    await expect(
      page.getByRole("columnheader", { name: /^Rank$/i }),
    ).toBeVisible();
  });

  test("table has Athlete column header", async ({ page }) => {
    await expect(
      page.getByRole("columnheader", { name: /^Athlete$/i }),
    ).toBeVisible();
  });

  test("table has Points column header", async ({ page }) => {
    await expect(
      page.getByRole("columnheader", { name: /^Points$/i }),
    ).toBeVisible();
  });

  test("table has at least 10 data rows", async ({ page }) => {
    const rows = page.locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(9);
  });

  test("table rows have athlete links", async ({ page }) => {
    const athleteLink = page
      .locator("tbody")
      .locator('a[href*="/athlete/"]')
      .first();
    await expect(athleteLink).toBeVisible();
  });

  test("clicking athlete in table navigates to athlete profile", async ({
    page,
  }) => {
    const athleteLink = page
      .locator("tbody")
      .locator('a[href*="/athlete/"]')
      .first();
    await athleteLink.click();
    await expect(page).toHaveURL(/\/athlete\/\d+/);
  });

  test("season filter shows year options", async ({ page }) => {
    // Season buttons or segmented control renders year options like "2025"
    const seasonOption = page.getByText(/^20\d{2}$/).first();
    await expect(seasonOption).toBeVisible();
  });

  test("How it works link navigates to ranking-info page", async ({ page }) => {
    await page.getByRole("link", { name: /how it works/i }).click();
    await expect(page).toHaveURL(/\/ranking-info/);
  });
});

// ── Team ranking ──────────────────────────────────────────────────────────────

test.describe("Team ranking", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/teams");
    await page.waitForSelector("h1", { timeout: 15000 });
  });

  test("page heading reads Team Ranking", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /team ranking/i }),
    ).toBeVisible();
  });

  test("stats show teams scored count", async ({ page }) => {
    await expect(page.getByText(/teams scored/i)).toBeVisible();
  });

  test("podium shows three cards", async ({ page }) => {
    const goldCard = page.locator('[class*="amber"]').first();
    await expect(goldCard).toBeAttached();
  });

  test("table has Rank column header", async ({ page }) => {
    await expect(
      page.getByRole("columnheader", { name: /^Rank$/i }),
    ).toBeVisible();
  });

  test("table has Team column header", async ({ page }) => {
    await expect(
      page.getByRole("columnheader", { name: /^Team$/i }),
    ).toBeVisible();
  });

  test("table has Points column header", async ({ page }) => {
    await expect(
      page.getByRole("columnheader", { name: /^Points$/i }),
    ).toBeVisible();
  });

  test("table has at least 5 data rows", async ({ page }) => {
    const rows = page.locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(4);
  });

  test("table rows have team profile links", async ({ page }) => {
    const teamLink = page.locator("tbody").locator('a[href*="/team/"]').first();
    await expect(teamLink).toBeVisible();
  });

  test("clicking team in table navigates to team profile", async ({ page }) => {
    const teamLink = page.locator("tbody").locator('a[href*="/team/"]').first();
    await teamLink.click();
    await expect(page).toHaveURL(/\/team\/\d+/);
  });

  test("How it works link navigates to teams-info page", async ({ page }) => {
    await page.getByRole("link", { name: /how it works/i }).click();
    await expect(page).toHaveURL(/\/teams-info/);
  });
});

// ── Info pages ────────────────────────────────────────────────────────────────

test.describe("Ranking info pages", () => {
  test("athlete ranking info shows points table with 1st row", async ({
    page,
  }) => {
    await page.goto("/ranking-info");
    await page.waitForSelector("h1", { timeout: 15000 });
    await expect(page.getByText(/how it works/i)).toBeVisible();
    await expect(page.getByText(/base_points/i)).toBeVisible();
    await expect(page.getByText("1st")).toBeVisible();
  });

  test("team ranking info shows eligible_teams formula", async ({ page }) => {
    await page.goto("/teams-info");
    await page.waitForSelector("h1", { timeout: 15000 });
    await expect(page.getByText(/how it works/i)).toBeVisible();
    await expect(page.getByText(/eligible_teams/i)).toBeVisible();
  });
});
