import { defineConfig } from "@playwright/test";

// LIVE config — real backend + local Postgres. Separate from playwright.config.ts
// (the fast, mocked suite) so the stateful/slow smoke never mixes with unit-style
// UI tests. Run: E2E_PASSWORD=… bunx playwright test --config=playwright.live.config.ts
export default defineConfig({
  testDir: "./e2e-live",
  fullyParallel: false,        // stateful DB round-trips — keep serial
  workers: 1,
  reporter: "list",

  use: {
    baseURL: "http://localhost:3000", // hit the API directly, no browser
  },

  // Auto-start the real backend against the local DB (Bun auto-loads backend/.env
  // → DATABASE_URL + MASTER_PASSWORD). Reuses an already-running server if present.
  webServer: {
    command: "bun src/index.ts",
    cwd: "../backend",
    url: "http://localhost:3000/api/auth/verify", // public, 200 when up
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
