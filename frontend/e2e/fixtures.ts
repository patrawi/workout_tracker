import { test as base, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

// Shared E2E base for the workout_tracker suite.
// Extends Playwright's `test` with reusable fixtures so per-spec boilerplate
// (auth mocking, JSON route helper) is written ONCE here. Import `test`/`expect`
// from this file instead of "@playwright/test".
//
// Layers:
//   { page }       — plain Playwright page (use for testing auth itself, e.g. login).
//   { authedPage } — page with auth pre-mocked as logged-in; skips the login gate.
//   { mock }       — helper to stub any endpoint with a JSON body.

// Fulfil a route with a 200 JSON response.
export function fulfilJson(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

// The app's API envelope: { success, data }. Most endpoints return this shape.
export const ok = <T>(data: T) => ({ success: true, data });

interface Fixtures {
  authedPage: Page;
  mock: (glob: string, body: unknown) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  // A page that registers a `mock(glob, body)` helper bound to it.
  // Note the `await` + braces: page.route() returns Promise<Disposable>, so we
  // swallow it to satisfy the helper's Promise<void> contract.
  mock: async ({ page }, use) => {
    await use(async (glob, body) => {
      await page.route(glob, (r) => fulfilJson(r, body));
    });
  },

  // A page already past the auth gate. Everything BEFORE use() is setup that
  // runs prior to the test body; nothing after = no teardown needed (the page
  // fixture tears itself down).
  authedPage: async ({ page }, use) => {
    await page.route("**/api/auth/verify", (r) => fulfilJson(r, ok({ authenticated: true })));
    await use(page);
  },
});

export { expect };
