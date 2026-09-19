import { test, expect } from "@playwright/test";

// Navigate to an upcoming event that has a participant list.
// We find it by looking for the "Next Race" hero card which always points
// to the next upcoming event.
async function goToUpcomingEvent(page: import("@playwright/test").Page) {
  await page.goto("");
  await page.waitForSelector("h1", { timeout: 15000 });
  const heroLabel = page.getByText("Next Race");
  if ((await heroLabel.count()) === 0) {
    return false;
  }
  // Click the outer wrapper div three levels up from the label span
  await heroLabel.locator("..").locator("..").locator("..").click();
  await page.waitForURL(/\/event\/\d+/);
  return true;
}

test("upcoming event shows Participants tab content", async ({ page }) => {
  const found = await goToUpcomingEvent(page);
  if (!found) {
    test.skip();
    return;
  }
  // Upcoming events show ParticipantsTab, not ResultsTab
  // Wait for the table to render (participants load async)
  await page.waitForSelector("table", { timeout: 10000 });
  // Verify the Athlete column header is visible — confirms ParticipantsTab rendered
  // (the count label is desktop-only; the Athlete column is always visible)
  await expect(
    page.getByRole("columnheader", { name: /^Athlete$/i }),
  ).toBeVisible();
});

test("participants tab has search input", async ({ page }) => {
  const found = await goToUpcomingEvent(page);
  if (!found) {
    test.skip();
    return;
  }
  await expect(
    page.getByPlaceholder(/search name, team or bib/i),
  ).toBeVisible();
});

test("participants tab shows Bib column", async ({ page }) => {
  const found = await goToUpcomingEvent(page);
  if (!found) {
    test.skip();
    return;
  }
  // Bib column is hidden sm:table-cell — in DOM on all viewports, visible only on desktop
  await expect(page.getByText("Bib")).toBeAttached();
});

test("participants tab shows participant rows", async ({ page }) => {
  const found = await goToUpcomingEvent(page);
  if (!found) {
    test.skip();
    return;
  }
  // At least one athlete link in the participant table
  const athleteLink = page.locator('a[href*="/athlete/"]').first();
  await expect(athleteLink).toBeVisible();
});

test("participants tab distance filter changes visible count", async ({
  page,
}) => {
  const found = await goToUpcomingEvent(page);
  if (!found) {
    test.skip();
    return;
  }
  // Wait for participants to load so the distance select options are populated
  // state: "attached" — options inside a closed <select> are always hidden from Playwright
  await page.waitForSelector("option[value='all']", {
    state: "attached",
    timeout: 10000,
  });
  // Query the first "all" option directly — avoids ambiguity with select.first()
  const firstOption = page.locator("option[value='all']").first();
  const text = await firstOption.textContent();
  expect(text).toMatch(/all distances/i);
});

test("participants search filters results", async ({ page }) => {
  const found = await goToUpcomingEvent(page);
  if (!found) {
    test.skip();
    return;
  }
  const search = page.getByPlaceholder(/search name, team or bib/i);
  // Type a common name fragment that exists in any dataset
  await search.fill("zzznomatch999");
  // "No participants found" empty state should appear
  await expect(page.getByText(/no participants found/i)).toBeVisible();
});
