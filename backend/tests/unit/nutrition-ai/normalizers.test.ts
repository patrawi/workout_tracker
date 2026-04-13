import { test, expect, describe } from "bun:test";
import {
  normalizeNutritionItem,
  normalizeMeal,
  roundTo1,
} from "../../../src/nutrition-ai/normalizers";

describe("roundTo1", () => {
  test("rounds to 1 decimal place", () => {
    expect(roundTo1(1.234)).toBe(1.2);
    expect(roundTo1(1.256)).toBe(1.3);
    expect(roundTo1(0)).toBe(0);
    expect(roundTo1(10.55)).toBe(10.6);
  });
});

describe("normalizeMeal", () => {
  test("recognizes English meal names", () => {
    expect(normalizeMeal("Breakfast")).toBe("Breakfast");
    expect(normalizeMeal("LUNCH")).toBe("Lunch");
    expect(normalizeMeal("dinner")).toBe("Dinner");
    expect(normalizeMeal("Snack")).toBe("Snack");
  });

  test("recognizes Thai meal terms", () => {
    expect(normalizeMeal("มื้อเช้า")).toBe("Breakfast");
    expect(normalizeMeal("มื้อกลางวัน")).toBe("Lunch");
    expect(normalizeMeal("มื้อเที่ยง")).toBe("Lunch");
    expect(normalizeMeal("มื้อเย็น")).toBe("Dinner");
    expect(normalizeMeal("ของว่าง")).toBe("Snack");
    expect(normalizeMeal("ขนม")).toBe("Snack");
  });

  test("defaults to Snack for unknown terms", () => {
    expect(normalizeMeal("unknown")).toBe("Snack");
    expect(normalizeMeal("")).toBe("Snack");
  });
});

describe("normalizeNutritionItem", () => {
  test("applies defaults to empty object", () => {
    const result = normalizeNutritionItem({});

    expect(result.food_name).toBe("Unknown Food");
    expect(result.meal).toBe("Snack");
    expect(result.protein).toBe(0);
    expect(result.carbs).toBe(0);
    expect(result.fat).toBe(0);
    expect(result.calories).toBe(0);
    expect(result.has_missing_macros).toBe(false);
  });

  test("preserves provided values", () => {
    const result = normalizeNutritionItem({
      food_name: "Chicken Breast",
      meal: "Lunch",
      protein: 30.5,
      carbs: 0,
      fat: 3.6,
      calories: 165,
      has_missing_macros: true,
    });

    expect(result.food_name).toBe("Chicken Breast");
    expect(result.meal).toBe("Lunch");
    expect(result.protein).toBe(30.5);
    expect(result.has_missing_macros).toBe(true);
  });

  test("rounds numbers to 1 decimal", () => {
    const result = normalizeNutritionItem({
      food_name: "Rice",
      protein: 2.345,
      carbs: 45.678,
      fat: 0.123,
      calories: 205.55,
    });

    expect(result.protein).toBe(2.3);
    expect(result.carbs).toBe(45.7);
    expect(result.fat).toBe(0.1);
    expect(result.calories).toBe(205.6);
  });
});
