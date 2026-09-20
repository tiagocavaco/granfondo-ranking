import { test, expect } from "@playwright/test";

// ── Privacy page ──────────────────────────────────────────────────────────────

test.describe("Privacy page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("privacy");
    await page.waitForSelector("h1", { timeout: 15000 });
  });

  test("renders Privacy Policy heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /privacy policy/i }),
    ).toBeVisible();
  });

  test("shows LEGAL eyebrow label", async ({ page }) => {
    await expect(page.getByText(/^legal$/i)).toBeVisible();
  });

  test("has Terms of Use cross-link", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /terms of use/i }),
    ).toBeVisible();
  });

  test("Terms of Use link navigates to /terms", async ({ page }) => {
    await page.getByRole("link", { name: /terms of use/i }).click();
    await expect(page).toHaveURL(/\/terms/);
  });

  test("footer Privacy link is present", async ({ page }) => {
    await expect(
      page.locator("footer").getByRole("link", { name: /privacy/i }),
    ).toBeVisible();
  });

  test("footer Terms link navigates to /terms", async ({ page }) => {
    await page.locator("footer").getByRole("link", { name: /terms/i }).click();
    await expect(page).toHaveURL(/\/terms/);
  });

  test("page title includes Privacy Policy", async ({ page }) => {
    await expect(page).toHaveTitle(/Privacy Policy/);
  });
});

// ── Terms page ────────────────────────────────────────────────────────────────

test.describe("Terms page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("terms");
    await page.waitForSelector("h1", { timeout: 15000 });
  });

  test("renders Terms of Use heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /terms of use/i }),
    ).toBeVisible();
  });

  test("shows LEGAL eyebrow label", async ({ page }) => {
    await expect(page.getByText(/^legal$/i)).toBeVisible();
  });

  test("has Privacy Policy cross-link", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /privacy policy/i }),
    ).toBeVisible();
  });

  test("Privacy Policy link navigates to /privacy", async ({ page }) => {
    await page.getByRole("link", { name: /privacy policy/i }).click();
    await expect(page).toHaveURL(/\/privacy/);
  });

  test("page title includes Terms of Use", async ({ page }) => {
    await expect(page).toHaveTitle(/Terms of Use/);
  });
});

// ── Scroll reset on navigation ────────────────────────────────────────────────

test.describe("Scroll reset", () => {
  test("Privacy page opens at top when navigated from footer", async ({
    page,
  }) => {
    await page.goto("");
    await page.waitForSelector("h1", { timeout: 15000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.locator("footer").getByRole("link", { name: /privacy/i }).click();
    await expect(page).toHaveURL(/\/privacy/);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });

  test("Terms page opens at top when navigated from footer", async ({
    page,
  }) => {
    await page.goto("");
    await page.waitForSelector("h1", { timeout: 15000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.locator("footer").getByRole("link", { name: /terms/i }).click();
    await expect(page).toHaveURL(/\/terms/);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });
});

// ── Footer links (from home) ──────────────────────────────────────────────────

test.describe("Footer legal links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("");
    await page.waitForSelector("h1", { timeout: 15000 });
  });

  test("footer shows Privacy link on home page", async ({ page }) => {
    await expect(
      page.locator("footer").getByRole("link", { name: /privacy/i }),
    ).toBeVisible();
  });

  test("footer Privacy link navigates to /privacy", async ({ page }) => {
    await page
      .locator("footer")
      .getByRole("link", { name: /privacy/i })
      .click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(
      page.getByRole("heading", { name: /privacy policy/i }),
    ).toBeVisible();
  });

  test("footer shows Terms link on home page", async ({ page }) => {
    await expect(
      page.locator("footer").getByRole("link", { name: /terms/i }),
    ).toBeVisible();
  });

  test("footer Terms link navigates to /terms", async ({ page }) => {
    await page.locator("footer").getByRole("link", { name: /terms/i }).click();
    await expect(page).toHaveURL(/\/terms/);
    await expect(
      page.getByRole("heading", { name: /terms of use/i }),
    ).toBeVisible();
  });
});
