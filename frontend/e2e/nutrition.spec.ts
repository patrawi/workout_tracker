import { test, expect, ok } from "./fixtures";

// Mirrors the workout-logging flow for nutrition: parse food → NutritionReviewModal
// → confirm. Asserts the confirm payload carries the parsed item + date. Mocked.

const PARSED_FOOD = {
  food_name: "Scrambled Eggs", meal: "Breakfast",
  protein: 12, carbs: 1, fat: 10, calories: 142,
  amount: 100, unit: "g", has_missing_macros: false,
};

test("parse → review → confirm sends the nutrition item", async ({ authedPage: page, mock }) => {
  await mock("**/api/nutrition/parse", ok([PARSED_FOOD]));
  await mock("**/api/nutrition/confirm", ok([]));

  await page.goto("/nutrition");

  await page.getByPlaceholder(/Paste your food log/).fill("Breakfast: 2 eggs");
  await page.getByRole("button", { name: "Parse with AI" }).click();

  // Review modal opens with the parsed item (the food name fills a text input).
  await expect(page.getByText("Review Parsed Nutrition")).toBeVisible();
  await expect(page.locator('input[value="Scrambled Eggs"]')).toBeVisible();

  // Confirm → capture the payload.
  const confirmReq = page.waitForRequest("**/api/nutrition/confirm");
  await page.getByRole("button", { name: /Confirm & Save/ }).click();
  const body = (await confirmReq).postDataJSON();

  expect(body.items[0].food_name).toBe("Scrambled Eggs");
  expect(body.items[0].meal).toBe("Breakfast");
  expect(typeof body.date).toBe("string"); // "YYYY-MM-DD"
});
