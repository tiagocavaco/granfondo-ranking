import { chromium } from "@playwright/test";

// Runs once before any test workers start. Discovers two racemates who share
// at least two events (needed for the HeadToHeadChart to render) and stores
// the compare URL in process.env so compare.spec.ts tests can navigate
// directly without re-doing discovery under concurrent-worker CPU load.
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

    const eventLinks = page
      .locator('a[href*="/event/"]')
      .filter({ hasText: /\d+\s*finishers/i });

    const eventCount = await eventLinks.count();

    for (let i = 0; i < Math.min(eventCount, 10); i++) {
      // Re-query after each navigation back to home
      await page.goto(baseURL);
      await page.waitForSelector('a[href*="/event/"]', { timeout: 60000 });

      const links = page
        .locator('a[href*="/event/"]')
        .filter({ hasText: /\d+\s*finishers/i });

      await links.nth(i).click();
      await page.waitForURL(/\/event\/\d+/);
      await page.waitForSelector("tbody tr", { timeout: 60000 });

      const athleteLinks = page
        .locator("tbody")
        .locator('a[href*="/athlete/"]');
      const href0 = (await athleteLinks.nth(0).getAttribute("href")) ?? "";
      const href1 = (await athleteLinks.nth(1).getAttribute("href")) ?? "";
      const idA = href0.match(/\/athlete\/(\d+)/)?.[1] ?? "";
      const idB = href1.match(/\/athlete\/(\d+)/)?.[1] ?? "";

      if (!idA || !idB) continue;

      // Check if these two athletes have enough shared events for the chart
      await page.goto(`${baseURL}compare?a=${idA}&b=${idB}`);
      await page.waitForSelector("h1", { timeout: 30000 });

      const hasChart = await page
        .getByText("Overall Trend")
        .isVisible()
        .catch(() => false);

      if (hasChart) {
        process.env.E2E_COMPARE_URL = `compare?a=${idA}&b=${idB}`;
        break;
      }
    }

    if (!process.env.E2E_COMPARE_URL) {
      console.warn(
        "[global-setup] Could not find two athletes with a shared trend chart in first 10 events",
      );
    }
  } catch (err) {
    console.warn("[global-setup] Could not discover compare URL:", err);
  } finally {
    await context.close();
    await browser.close();
  }
}
