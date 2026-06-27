import { test, expect, ok } from "./fixtures";

// Drives the real workout-logging UI and proves the Progressive Overload capture
// fields (session_type, gym_profile, per-set pain) flow into the /api/confirm
// request. API mocked → no backend, no DB writes. Auth handled by the fixture.

const PARSED_ITEM = {
  exercise_name: "Barbell Squat", weight: 100, reps: 8, rpe: 8,
  is_bodyweight: false, is_assisted: false, pain: false,
  variant_details: null, notes_thai: "", notes_english: "", tags: [],
};

test("session_type + pain reach the /api/confirm payload", async ({ authedPage: page, mock }) => {
  await mock("**/api/parse", ok([PARSED_ITEM]));
  await mock("**/api/confirm", ok([]));

  await page.goto("/");

  await page.getByPlaceholder("Log your workout e.g. 'rdl 100kg 8 reps'...").fill("squat 100kg 8 reps");
  await page.getByRole("button", { name: "Log Workout" }).click();

  // Progressive Overload capture UI present (spec §3.2/§3.3/§3.4).
  await expect(page.getByText("Session Context")).toBeVisible();
  await expect(page.getByLabel("Session type")).toBeVisible();
  await expect(page.getByLabel("Gym")).toBeVisible();
  await expect(page.getByText("Pain on this set")).toBeVisible();

  // Conscious user choices: tag the session + flag pain on the set.
  await page.getByLabel("Session type").selectOption("working_compromised");
  await page.locator("label").filter({ hasText: "Pain on this set" }).getByRole("checkbox").check();

  // Capture what the app SENDS on confirm.
  const confirmReq = page.waitForRequest("**/api/confirm");
  await page.getByRole("button", { name: /Confirm & Save/ }).click();
  const body = (await confirmReq).postDataJSON();

  expect(body.activity.session_type).toBe("working_compromised");
  expect(body.activity.gym_profile).toBe("The Gym Group Edinburgh Meadowbank Branch");
  expect(body.items[0].pain).toBe(true);
});
