import { test, expect } from "@playwright/test";

// Find the next upcoming event's predictions page by following the hero card.
async function goToPredictions(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForSelector("h1", { timeout: 15000 });
  const predictionsLink = page.getByRole("link", { name: /predictions/i }).first();
  if ((await predictionsLink.count()) === 0) {
    return false;
  }
  await predictionsLink.click();
  await page.waitForURL(/\/predictions$/);
  await page.waitForSelector("h2, [class*='font-display']", { timeout: 15000 });
  return true;
}

// ── Hero block ───────────────────────────────────────────────────────────────

test("predictions page shows Pre-Race Predictions label", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  await expect(page.getByText("Pre-Race Predictions")).toBeVisible();
});

test("predictions page shows event name in hero", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  // The h2 inside the hero block shows the event name — non-empty
  const heroHeading = page.locator("h2").first();
  await expect(heroHeading).toBeVisible();
  const text = await heroHeading.textContent();
  expect(text?.trim().length).toBeGreaterThan(0);
});

test("predictions hero has amber top accent", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  const accent = page.locator('[class*="via-amber-400"]').first();
  await expect(accent).toBeAttached();
});

test("predictions page shows How it works link", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  await expect(page.getByRole("link", { name: /how it works/i })).toBeVisible();
});

test("predictions page shows Back to event link", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  await expect(page.getByRole("link", { name: /back to event/i })).toBeVisible();
});

// ── Distance tabs ────────────────────────────────────────────────────────────

test("predictions distance tabs are visible when multiple distances", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  const tablist = page.locator('[role="tablist"]').first();
  if ((await tablist.count()) === 0) {
    // Only one distance — no tablist rendered, just assert the panel exists
    await expect(page.locator('[class*="rounded-2xl"]').first()).toBeVisible();
    return;
  }
  await expect(tablist).toBeVisible();
});

test("predictions tab buttons have flex-1 stretch class", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  const tablist = page.locator('[role="tablist"]').first();
  if ((await tablist.count()) === 0) { test.skip(); return; }
  const firstTab = tablist.locator('[role="tab"]').first();
  const cls = await firstTab.getAttribute("class");
  expect(cls).toContain("flex-1");
});

test("predictions active tab has selected aria state", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  const tablist = page.locator('[role="tablist"]').first();
  if ((await tablist.count()) === 0) { test.skip(); return; }
  const selectedTab = tablist.locator('[aria-selected="true"]');
  await expect(selectedTab).toBeVisible();
});

test("predictions tab click switches active tab", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  const tablist = page.locator('[role="tablist"]').first();
  if ((await tablist.count()) === 0) { test.skip(); return; }
  const tabs = tablist.locator('[role="tab"]');
  if ((await tabs.count()) < 2) { test.skip(); return; }
  const secondTab = tabs.nth(1);
  const secondTabText = await secondTab.textContent();
  await secondTab.click();
  const selectedTab = tablist.locator('[aria-selected="true"]');
  await expect(selectedTab).toHaveText(secondTabText!.trim());
});

// ── Tab overflow fade gradient ────────────────────────────────────────────────

test("predictions fade gradient appears when tabs overflow viewport", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  const tablist = page.locator('[role="tablist"]').first();
  if ((await tablist.count()) === 0) { test.skip(); return; }

  // Shrink the viewport to 300px wide to force tab overflow regardless of tab count
  await page.setViewportSize({ width: 300, height: 800 });
  // Wait for ResizeObserver to fire and React to re-render
  await page.waitForTimeout(150);

  const overflows = await page.evaluate(() => {
    const el = document.querySelector('[role="tablist"]') as HTMLElement | null;
    return el ? el.scrollWidth > el.clientWidth : false;
  });

  if (!overflows) {
    // Not enough tabs to overflow even at 300px — skip rather than false-fail
    test.skip();
    return;
  }

  // The fade div has bg-gradient-to-l from-[#060d1a]
  const fade = page.locator('[class*="from-\\[#060d1a\\]"]').first();
  await expect(fade).toBeVisible();
});

// ── Athlete cards ─────────────────────────────────────────────────────────────

test("predictions panel shows athlete prediction cards", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  // At least one athlete link in the prediction list
  const athleteLink = page.locator('a[href*="/athlete/"]').first();
  await expect(athleteLink).toBeVisible();
});

test("predictions athlete cards link to athlete profiles", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  const firstAthleteLink = page.locator('a[href*="/athlete/"]').first();
  await firstAthleteLink.click();
  await expect(page).toHaveURL(/\/athlete\/\d+/);
});

// ── Gender toggle ─────────────────────────────────────────────────────────────

test("predictions panel has gender toggle (M/F)", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  // GenderToggle renders M and F buttons
  await expect(page.getByRole("button", { name: "M" })).toBeVisible();
  await expect(page.getByRole("button", { name: "F" })).toBeVisible();
});

test("predictions gender toggle switches to female athletes", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  const femaleBtn = page.getByRole("button", { name: "F" });
  await femaleBtn.click();
  // After switching, F button should have active styling
  const cls = await femaleBtn.getAttribute("class");
  expect(cls).toContain("text-white");
});

// ── Info page ─────────────────────────────────────────────────────────────────

test("predictions info page shows How it works heading", async ({ page }) => {
  const found = await goToPredictions(page);
  if (!found) { test.skip(); return; }
  await page.getByRole("link", { name: /how it works/i }).click();
  await page.waitForURL(/\/predictions\/info$/);
  await expect(page.getByRole("heading", { name: /how it works/i })).toBeVisible();
});
