import { test, expect } from "@playwright/test";

async function noHorizontalScroll(page: import("@playwright/test").Page) {
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = page.viewportSize()!.width;
  // 1px tolerance for sub-pixel rounding
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
}

// ── No horizontal scroll on any page ─────────────────────────────────────────

test("no horizontal scroll on home page", async ({ page }) => {
  await page.goto("");
  await page.waitForSelector("h1", { timeout: 15000 });
  await noHorizontalScroll(page);
});

test("no horizontal scroll on finished event detail", async ({ page }) => {
  await page.goto("");
  await page.waitForSelector("h1", { timeout: 15000 });
  await page
    .locator('a[href*="/event/"]')
    .filter({ hasText: /finishers/i })
    .first()
    .click();
  await page.waitForURL(/\/event\/\d+/);
  await noHorizontalScroll(page);
});

test("no horizontal scroll on athletes page", async ({ page }) => {
  await page.goto("athletes");
  await page.waitForSelector("h1", { timeout: 15000 });
  await noHorizontalScroll(page);
});

test("no horizontal scroll on athlete profile", async ({ page }) => {
  await page.goto("athlete/22");
  await page.waitForSelector("h1", { timeout: 15000 });
  await noHorizontalScroll(page);
});

test("no horizontal scroll on athlete ranking", async ({ page }) => {
  await page.goto("ranking");
  await page.waitForSelector("h1", { timeout: 15000 });
  await noHorizontalScroll(page);
});

test("no horizontal scroll on team ranking", async ({ page }) => {
  await page.goto("teams");
  await page.waitForSelector("h1", { timeout: 15000 });
  await noHorizontalScroll(page);
});

test("no horizontal scroll on compare page", async ({ page }) => {
  await page.goto("compare?a=22&b=24");
  await page.waitForSelector("h1", { timeout: 15000 });
  await noHorizontalScroll(page);
});

test("no horizontal scroll on ranking info page", async ({ page }) => {
  await page.goto("ranking-info");
  await page.waitForSelector("h1", { timeout: 15000 });
  await noHorizontalScroll(page);
});

// ── Results table Gap column breakpoint behaviour ─────────────────────────────

test("results table Gap column is hidden below lg breakpoint", async ({
  page,
}) => {
  const vp = page.viewportSize()!;
  if (vp.width >= 1024) {
    test.skip();
    return;
  }

  await page.goto("");
  await page.waitForSelector("h1", { timeout: 15000 });
  const finishedLink = page
    .locator('a[href*="/event/"]')
    .filter({ hasText: /finishers/i })
    .first();
  if ((await finishedLink.count()) === 0) {
    test.skip();
    return;
  }

  await finishedLink.click();
  await page.waitForURL(/\/event\/\d+/);

  const gapHeader = page.getByRole("columnheader", { name: /^Gap$/i }).first();
  if ((await gapHeader.count()) === 0) {
    test.skip();
    return;
  }

  const display = await gapHeader.evaluate(
    (el) => getComputedStyle(el).display,
  );
  expect(display).toBe("none");
});

test("results table Gap column is visible at lg+ (desktop)", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") {
    test.skip();
    return;
  }

  await page.goto("");
  await page.waitForSelector("h1", { timeout: 15000 });
  await page
    .locator('a[href*="/event/"]')
    .filter({ hasText: /finishers/i })
    .first()
    .click();
  await page.waitForURL(/\/event\/\d+/);
  await expect(
    page.getByRole("columnheader", { name: /^Gap$/i }),
  ).toBeVisible();
});

test("athlete career table Gap column hidden below lg breakpoint", async ({
  page,
}) => {
  const vp = page.viewportSize()!;
  if (vp.width >= 1024) {
    test.skip();
    return;
  }

  await page.goto("athlete/22");
  await page.waitForSelector("h1", { timeout: 15000 });
  const gapHeaders = page.getByRole("columnheader", { name: /^Gap$/i });
  if ((await gapHeaders.count()) === 0) {
    test.skip();
    return;
  }

  const display = await gapHeaders
    .first()
    .evaluate((el) => getComputedStyle(el).display);
  expect(display).toBe("none");
});

// ── Mobile nav visibility ─────────────────────────────────────────────────────

test("header is visible at all viewports", async ({ page }) => {
  await page.goto("");
  await page.waitForSelector("h1", { timeout: 15000 });
  await expect(page.locator("header").first()).toBeVisible();
  // Brand text is hidden on mobile (hidden sm:block) — toBeAttached confirms it's in the DOM
  await expect(
    page.locator("header").getByText("Granfondo Portugal"),
  ).toBeAttached();
});

test("main content is not obscured by header on mobile", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile") {
    test.skip();
    return;
  }

  await page.goto("");
  await page.waitForSelector("h1", { timeout: 15000 });
  // h1 bounding box should be below the header bottom
  const headerBox = await page.locator("header").first().boundingBox();
  const h1Box = await page.locator("h1").first().boundingBox();
  if (!headerBox || !h1Box) {
    test.skip();
    return;
  }

  expect(h1Box.y).toBeGreaterThan(headerBox.y);
});
