import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
// CI: build step runs first, preview serves the dist on port 4173.
// Local: reuse an already-running dev server on port 5173.
const port = isCI ? 4173 : 5173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}/granfondo-ranking`,
    trace: "on-first-retry",
  },
  webServer: {
    command: isCI ? "npm run preview" : "npm run dev",
    url: `http://localhost:${port}/granfondo-ranking`,
    reuseExistingServer: !isCI,
    timeout: isCI ? 30_000 : 120_000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 14"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
