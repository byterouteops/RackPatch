import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke e2e config. By default it expects an app already running at `baseURL`
 * (e.g. `npm run dev` or a deployed instance). Set `E2E_WEB_SERVER=1` to let Playwright
 * start `npm run dev` itself. Install the browser once with `npx playwright install chromium`.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_WEB_SERVER
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
