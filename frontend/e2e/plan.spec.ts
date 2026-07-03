import { test, expect, ok } from "./fixtures";

//authenticated user opens Coach →
// clicks Plan tab → sees their saved plan rows.

test("see plan", async ({ authedPage: page, mock }) => {
  await mock(
    "**/api/coach/plan",
    ok({
      Push: [
        {
          id: 1,
          day_type: "Push",
          position: 1,
          exercise_name: "Bench Press",
          is_bodyweight: false,
          target_weight: 100,
          sets: 4,
          rep_low: 6,
          rep_high: 8,
          rpe_low: 7,
          rpe_high: 9,
          exercise_role: "compound",
          progression_ladder: "double_12",
          notes: "",
          updated_at: null,
        },
      ],
      Pull: [],
      Legs: [],
    }),
  );
  await page.goto("/coach");

  await expect(
    page.getByRole("button", { name: "Plan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByText("Bench Press")).toBeVisible();
  await expect(page.getByText("Push")).toBeVisible();
  await expect(page.getByText("Pull")).toBeVisible();
  await expect(page.getByText("Legs Day")).toBeVisible();
  await expect(page.getByText("100kg")).toBeVisible();
  await expect(page.getByText("4 × 6–8")).toBeVisible();
  await expect(page.getByText("7–9")).toBeVisible();
});
