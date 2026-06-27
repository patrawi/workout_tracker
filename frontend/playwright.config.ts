import { defineConfig, devices } from "@playwright/test";

// Playwright E2E config for the workout_tracker frontend.
// Docs: https://playwright.dev/docs/test-configuration
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,      // fail CI if someone left a test.only
  retries: process.env.CI ? 2 : 0,
  reporter: "html",                  // bunx playwright show-report

  use: {
    baseURL: "http://localhost:5173", // page.goto('/') resolves against this
    trace: "on-first-retry",          // time-travel debug on a retry
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Auto-start the Vite dev server before tests; reuse it if already running.
  webServer: {
    command: "bun run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
