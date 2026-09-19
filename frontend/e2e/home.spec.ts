import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("");
  await page.waitForSelector("h1", { timeout: 15000 });
});

// ── Heading ───────────────────────────────────────────────────────────────────

test("heading reads Race Events with blue dot", async ({ page }) => {
  const h1 = page.locator("h1");
  await expect(h1).toContainText("Race Events");
  // The blue dot after "Events" is a <span> inside the same heading
  await expect(h1.locator("span.text-blue-400")).toBeAttached();
});

// ── Hero card structure ───────────────────────────────────────────────────────

test("hero card shows Next Race label with pulsing dot", async ({ page }) => {
  const label = page.getByText("Next Race");
  await expect(label).toBeVisible();
  // Amber pulsing dot sits before the label in a flex row
  const dot = label.locator("xpath=preceding-sibling::span").first();
  await expect(dot).toBeAttached();
});

test("hero card shows event name", async ({ page }) => {
  // Event name is an h2 inside the hero card (below the Next Race label)
  const heroSection = page
    .getByText("Next Race")
    .locator("xpath=ancestor::div[4]");
  const eventName = heroSection.locator("h2, [class*='font-display']").first();
  await expect(eventName).toBeVisible();
  const text = await eventName.textContent();
  expect(text?.trim().length).toBeGreaterThan(3);
});

test("hero card shows a days-until badge when event is in the future", async ({
  page,
}) => {
  // The badge shows "X days" or "Tomorrow"
  const badge = page.getByText(/^\d+ days$|^Tomorrow$/);
  await expect(badge.first()).toBeVisible();
});

test("hero card top line is amber gradient", async ({ page }) => {
  // The 2px top accent line uses via-amber-400
  const accent = page.locator('[class*="via-amber-400"]').first();
  await expect(accent).toBeAttached();
});

// ── Stats strip ───────────────────────────────────────────────────────────────

test("stats strip shows events count", async ({ page }) => {
  await expect(page.getByText(/\d+\s*events/i).first()).toBeVisible();
});

test("stats strip shows finishers count", async ({ page }) => {
  await expect(page.getByText(/\d[\d,]*\s*finishers/i).first()).toBeVisible();
});

// ── Event list rows ───────────────────────────────────────────────────────────

test("event list contains multiple event links", async ({ page }) => {
  const links = page.locator('a[href*="/event/"]');
  const count = await links.count();
  expect(count).toBeGreaterThan(3);
});

test("each event row has a visible event name", async ({ page }) => {
  // First non-hero event link leads to a page with the event name
  const firstLink = page.locator('a[href*="/event/"]').first();
  const name = await firstLink.textContent();
  expect(name?.trim().length).toBeGreaterThan(3);
});

test("year separator labels are rendered", async ({ page }) => {
  // Ghost year numbers (e.g. 2025, 2024) are rendered between event groups as spans
  const yearLabel = page
    .locator("span")
    .filter({ hasText: /^20\d{2}$/ })
    .first();
  await expect(yearLabel).toBeVisible();
});

test("finished event rows show finisher count badge", async ({ page }) => {
  await expect(page.getByText(/\d[\d,]*\s*finishers/i).first()).toBeVisible();
});

// ── Navigation from event rows ────────────────────────────────────────────────

test("clicking a finished event row navigates to event detail", async ({
  page,
}) => {
  const finishedLink = page
    .locator('a[href*="/event/"]')
    .filter({ hasText: /finishers/i })
    .first();
  await finishedLink.click();
  await expect(page).toHaveURL(/\/event\/\d+/);
  await expect(page.locator("h1")).toBeVisible();
});
