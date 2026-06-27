import { test, expect, ok, fulfilJson } from "./fixtures";
import type { Route } from "@playwright/test";

// Edit + delete a logged set. Seeds the workouts list via a mocked GET, then
// drives the EditModal (PATCH) and the inline delete confirm (DELETE), asserting
// the outgoing requests. The delete confirm is an in-app modal, NOT window.confirm,
// so Playwright can click it safely.

const SEED_ROW = {
  id: 42, session_id: 7, exercise_name: "Bench Press",
  weight: 80, reps: 10, rpe: 8, is_bodyweight: false, is_assisted: false,
  pain: false, variant_details: "", notes_thai: "", notes_english: "",
  tags: [], muscle_group: "Chest", created_at: "2026-06-27 10:00:00",
};

// The /history/:date page loads workouts + nutrition + profile in one Promise.all,
// so ALL three must be mocked or the failing fetch rejects the whole query and the
// card never renders.
async function seedDay(mock: (g: string, b: unknown) => Promise<void>) {
  await mock("**/api/workouts/date/*", ok([SEED_ROW]));
  await mock("**/api/nutrition/date/*", ok([]));
  await mock("**/api/profile", ok({ id: 1, weight_kg: 72 }));
}

test("edit a logged set sends a PATCH with the new weight", async ({ authedPage: page, mock }) => {
  await seedDay(mock);
  // Echo the PATCH body back as the updated row.
  await page.route("**/api/workouts/42", async (route: Route) => {
    if (route.request().method() === "PATCH") {
      const patched = { ...SEED_ROW, ...route.request().postDataJSON() };
      return fulfilJson(route, ok(patched));
    }
    return route.fallback();
  });

  await page.goto("/history/2026-06-27");

  // Open the edit modal for the seeded set.
  await page.getByRole("button", { name: "Edit set 1" }).click();
  await expect(page.getByText("💾 Save Changes")).toBeVisible();

  // Weight is the first number field in the modal (labels aren't htmlFor-associated,
  // so target by role; order is Weight, Reps, RPE). Confirm it's the 80kg one first.
  const weight = page.getByRole("spinbutton").first();
  await expect(weight).toHaveValue("80");
  await weight.fill("82.5");
  const patchReq = page.waitForRequest(
    (r) => r.url().includes("/api/workouts/42") && r.method() === "PATCH",
  );
  await page.getByRole("button", { name: /Save Changes/ }).click();
  const body = (await patchReq).postDataJSON();

  expect(body.weight).toBe(82.5);
});

test("delete a logged set sends a DELETE after inline confirm", async ({ authedPage: page, mock }) => {
  await seedDay(mock);
  await page.route("**/api/workouts/42", (route: Route) =>
    route.request().method() === "DELETE"
      ? fulfilJson(route, ok({ deleted: true }))
      : route.fallback(),
  );

  await page.goto("/history/2026-06-27");

  // Click delete → inline confirm appears (in-app, not a native dialog).
  await page.getByRole("button", { name: "Delete set 1" }).click();
  await expect(page.getByText(/This cannot be undone/)).toBeVisible();

  // Confirm → capture the DELETE.
  const delReq = page.waitForRequest(
    (r) => r.url().includes("/api/workouts/42") && r.method() === "DELETE",
  );
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  expect((await delReq).method()).toBe("DELETE");
});
