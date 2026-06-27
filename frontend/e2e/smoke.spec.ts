import { test, expect, fulfilJson, ok } from "./fixtures";

// Smoke: app boots, and a signed-OUT user lands on the login screen.
// Uses plain { page } (not authedPage) because this is the unauthenticated case.
// Demonstrates auto-waiting: the login button only appears after the async
// /api/auth/verify round-trip resolves (Layout.tsx).
test("home shows the login screen when signed out", async ({ page }) => {
  await page.route("**/api/auth/verify", (r) => fulfilJson(r, ok({ authenticated: false })));

  await page.goto("/");

  await expect(page).toHaveTitle("Frictionless Tracker");
  await expect(page.getByRole("button", { name: /log in/i })).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});
