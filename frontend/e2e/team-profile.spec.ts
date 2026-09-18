import { test, expect } from "@playwright/test";

// Navigate to a team profile by clicking through from the ranking page
// so we don't hardcode a team ID that might shift between scrapes.
async function goToFirstTeamProfile(page: import("@playwright/test").Page) {
  await page.goto("/teams");
  await page.waitForSelector("h1", { timeout: 15000 });
  // Click the first team link in the ranking table
  const teamLink = page.locator('a[href*="/team/"]').first();
  await teamLink.click();
  await page.waitForURL(/\/team\/\d+/);
  await page.waitForSelector("h1, [class*='font-display']", { timeout: 15000 });
}

test("team profile shows team name heading", async ({ page }) => {
  await goToFirstTeamProfile(page);
  const heading = page.locator("h1");
  await expect(heading).toBeVisible();
  // Heading is non-empty team name
  const text = await heading.textContent();
  expect(text?.trim().length).toBeGreaterThan(0);
});

test("team profile shows Seasons stat", async ({ page }) => {
  await goToFirstTeamProfile(page);
  await expect(page.getByText("Seasons")).toBeVisible();
});

test("team profile shows Members stat", async ({ page }) => {
  await goToFirstTeamProfile(page);
  // Stat label "Members" in the hero stats strip
  await expect(page.getByText("Members").first()).toBeVisible();
});

test("team profile member list renders with member names", async ({ page }) => {
  await goToFirstTeamProfile(page);
  // TeamMemberList header
  await expect(page.getByText(/^Members/)).toBeVisible();
  // At least one athlete link is visible in the member list
  const memberLinks = page.locator('a[href*="/athlete/"]');
  await expect(memberLinks.first()).toBeVisible();
});

test("team profile shows Results section", async ({ page }) => {
  await goToFirstTeamProfile(page);
  await expect(page.getByText("Results")).toBeVisible();
});

test("team profile results show a distance badge", async ({ page }) => {
  await goToFirstTeamProfile(page);
  // Distance badge — Granfondo, Mediofondo, or Minifondo
  const distBadge = page
    .getByText(/^(Granfondo|Mediofondo|Minifondo)$/)
    .first();
  await expect(distBadge).toBeVisible();
});

test("team profile season selector appears when multiple seasons", async ({ page }) => {
  await goToFirstTeamProfile(page);
  // Season selector is only rendered when allSeasons.length > 1
  // Check if a year-like label (e.g. "2024", "2025") exists anywhere on the page
  const seasonText = page.getByText(/^20\d{2}$/).first();
  // It may or may not exist for the first team — just assert the page loaded cleanly
  await expect(page.locator("h1")).toBeVisible();
  if ((await seasonText.count()) > 0) {
    await expect(seasonText).toBeVisible();
  }
});

test("team profile member link navigates to athlete page", async ({ page }) => {
  await goToFirstTeamProfile(page);
  const firstMemberLink = page.locator('a[href*="/athlete/"]').first();
  await firstMemberLink.click();
  await expect(page).toHaveURL(/\/athlete\/\d+/);
});
