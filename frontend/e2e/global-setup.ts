import { chromium } from "@playwright/test";

// Runs once before any test workers start. Discovers two racemates from a
// finished event and stores the compare URL in process.env so that
// compare.spec.ts tests can navigate directly without re-doing discovery
// under concurrent-worker CPU load (which caused 60s+ timeouts on mobile CI).
export default async function globalSetup() {
  const isCI = !!process.env.CI;
  const port = isCI ? 4173 : 5173;
  const baseURL = `http://localhost:${port}/granfondo-ranking/`;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(baseURL);
    await page.waitForSelector('a[href*="/event/"]', { timeout: 60000 });

    const eventLink = page
      .locator('a[href*="/event/"]')
      .filter({ hasText: /\d+\s*finishers/i })
      .first();
    await eventLink.click();
    await page.waitForURL(/\/event\/\d+/);
    await page.waitForSelector("tbody tr", { timeout: 60000 });

    const athleteLinks = page.locator("tbody").locator('a[href*="/athlete/"]');
    const href0 = (await athleteLinks.nth(0).getAttribute("href")) ?? "";
    const href1 = (await athleteLinks.nth(1).getAttribute("href")) ?? "";
    const idA = href0.match(/\/athlete\/(\d+)/)?.[1] ?? "";
    const idB = href1.match(/\/athlete\/(\d+)/)?.[1] ?? "";

    process.env.E2E_COMPARE_URL = `compare?a=${idA}&b=${idB}`;
  } catch (err) {
    // Non-fatal: compare tests will fail with a clear "no URL" message rather
    // than an opaque navigation timeout.
    console.warn("[global-setup] Could not discover compare URL:", err);
  } finally {
    await context.close();
    await browser.close();
  }
}
