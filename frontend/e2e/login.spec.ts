import { test, expect, fulfilJson, ok } from "./fixtures";

// Tests auth ITSELF, so it uses plain { page } (not authedPage) and mocks the
// gate as signed-out → fills password → asserts the app unlocks.
// Fake credential — the mock ignores it, so never put a real password in tests.
const TEST_PASSWORD = "test-password-123";

test("sign in unlocks the app", async ({ page }) => {
  await page.route("**/api/auth/verify", (r) => fulfilJson(r, ok({ authenticated: false })));
  await page.route("**/api/auth/login", (r) => fulfilJson(r, ok({ success: true })));

  await page.goto("/");

  await expect(page.getByLabel("Password")).toBeVisible();
  await page.getByLabel("Password").fill(TEST_PASSWORD);

  const loginReq = page.waitForRequest("**/api/auth/login");
  await page.getByRole("button", { name: "Log In" }).click();

  // The app sent our password…
  const body = (await loginReq).postDataJSON();
  expect(body.password).toBe(TEST_PASSWORD);

  // …and the gate opened (auto-waits through the auth state flip).
  await expect(page.getByPlaceholder("Log your workout e.g. 'rdl 100kg 8 reps'...")).toBeVisible();
});
