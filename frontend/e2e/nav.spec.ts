import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("");
  // Wait for DB to load — spinner disappears, heading appears
  await page.waitForSelector("h1", { timeout: 15000 });
});

test("nav has gold top accent border", async ({ page }) => {
  const header = page.locator("header").first();
  const borderTop = await header.evaluate(
    (el) => getComputedStyle(el).borderTopColor,
  );
  // rgba(212,175,55,0.35) — gold accent
  expect(borderTop).toMatch(/rgba?\(212,\s*175,\s*55/);
});

test("nav logo shows cycling icon", async ({ page }) => {
  // SVG with two wheel circles
  await expect(page.locator("header svg circle").first()).toBeVisible();
});

test("nav shows site name", async ({ page }) => {
  // Brand name is inside "hidden sm:block" — hidden on mobile but always in the DOM
  await expect(
    page.locator("header").getByText("Granfondo Portugal"),
  ).toBeAttached();
});

test("nav subtitle reads Race Events", async ({ page }) => {
  // Subtitle is inside "hidden sm:block" — hidden on mobile but always in the DOM
  await expect(page.locator("header").getByText(/race events/i)).toBeAttached();
});

test("nav Events link is active on home", async ({ page }) => {
  const eventsLink = page
    .locator("header")
    .getByRole("link", { name: /events/i })
    .first();
  await expect(eventsLink).toBeVisible();
  // Active state: bg-blue-500/20 text-blue-300 border border-blue-500/30
  const cls = await eventsLink.getAttribute("class");
  expect(cls).toContain("bg-blue-500");
});

test("nav Athletes link navigates to athletes page", async ({ page }) => {
  await page
    .locator("header")
    .getByRole("link", { name: /athletes/i })
    .click();
  await expect(page).toHaveURL(/\/athletes/);
  await expect(page.getByRole("heading", { name: /athletes/i })).toBeVisible();
});

// ── Desktop-only: direct ranking links in header ─────────────────────────────

test("desktop nav shows Athlete Ranking and Team Ranking links", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") {
    test.skip();
    return;
  }

  await expect(
    page.locator("header").getByRole("link", { name: /athlete ranking/i }),
  ).toBeVisible();
  await expect(
    page.locator("header").getByRole("link", { name: /team ranking/i }),
  ).toBeVisible();
});

test("desktop Athlete Ranking link navigates to /ranking", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") {
    test.skip();
    return;
  }

  await page
    .locator("header")
    .getByRole("link", { name: /athlete ranking/i })
    .click();
  await expect(page).toHaveURL(/\/ranking/);
});

test("desktop Team Ranking link navigates to /teams", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") {
    test.skip();
    return;
  }

  await page
    .locator("header")
    .getByRole("link", { name: /team ranking/i })
    .click();
  await expect(page).toHaveURL(/\/teams/);
});

// ── Mobile-only: Rankings dropdown in header ──────────────────────────────────

test("mobile nav has Rankings dropdown button", async ({ page }, testInfo) => {
  if (testInfo.project.name !== "mobile") {
    test.skip();
    return;
  }

  const rankingsBtn = page
    .locator("header")
    .getByRole("button", { name: /rankings/i });
  await expect(rankingsBtn).toBeVisible();
});

test("mobile nav Rankings dropdown reveals Athletes and Teams options", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile") {
    test.skip();
    return;
  }

  const rankingsBtn = page
    .locator("header")
    .getByRole("button", { name: /rankings/i });
  await rankingsBtn.click();
  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /athletes/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /teams/i })).toBeVisible();
});

test("mobile nav Rankings dropdown navigates to athlete ranking", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile") {
    test.skip();
    return;
  }

  await page
    .locator("header")
    .getByRole("button", { name: /rankings/i })
    .click();
  await page
    .locator('[role="menu"]')
    .getByRole("menuitem", { name: /athletes/i })
    .click();
  await expect(page).toHaveURL(/\/ranking/);
});

test("mobile nav Rankings dropdown navigates to team ranking", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile") {
    test.skip();
    return;
  }

  await page
    .locator("header")
    .getByRole("button", { name: /rankings/i })
    .click();
  await page
    .locator('[role="menu"]')
    .getByRole("menuitem", { name: /teams/i })
    .click();
  await expect(page).toHaveURL(/\/teams/);
});
