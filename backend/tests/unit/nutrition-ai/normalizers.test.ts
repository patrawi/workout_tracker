import { test, expect, describe } from "bun:test";
import {
  normalizeNutritionItem,
  normalizeMeal,
  roundTo1,
} from "../../../src/nutrition-ai/normalizers";
import type { RawLLMItem } from "../../../src/types";

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
    expect(result.amount).toBe(1);
    expect(result.unit).toBe("g");
    expect(result.has_missing_macros).toBe(true);
  });

  test("scales macros by amount eaten vs serving size", () => {
    const result = normalizeNutritionItem({
      food_name: "Chicken Breast",
      meal: "Lunch",
      protein: 31,
      carbs: 0,
      fat: 3.6,
      serving_size_value: 100,
      serving_size_unit: "g",
      amount_eaten_value: 200,
      amount_eaten_unit: "g",
    });

    expect(result.food_name).toBe("Chicken Breast");
    expect(result.meal).toBe("Lunch");
    expect(result.protein).toBe(62);   // 31 * 2
    expect(result.carbs).toBe(0);
    expect(result.fat).toBe(7.2);      // 3.6 * 2
    expect(result.calories).toBe(312.8); // 62*4 + 0*4 + 7.2*9 = 248 + 64.8
    expect(result.amount).toBe(200);
    expect(result.unit).toBe("g");
    expect(result.has_missing_macros).toBe(false);
  });

  test("scale factor is 1 when serving size equals amount eaten", () => {
    const result = normalizeNutritionItem({
      food_name: "Rice",
      protein: 2.6,
      carbs: 28,
      fat: 0.3,
      serving_size_value: 100,
      amount_eaten_value: 100,
    });

    expect(result.protein).toBe(2.6);
    expect(result.carbs).toBe(28);
    expect(result.fat).toBe(0.3);
    // (2.6*4) + (28*4) + (0.3*9) = 10.4 + 112 + 2.7 = 125.1
    expect(result.calories).toBe(125.1);
  });

  test("rounds macros to 1 decimal after scaling", () => {
    const result = normalizeNutritionItem({
      food_name: "Sauce",
      protein: 1.23,
      carbs: 12.34,
      fat: 5.67,
      serving_size_value: 100,
      amount_eaten_value: 33,
    });

    // Scale factor = 33/100 = 0.33
    // protein: 1.23 * 0.33 = 0.4059 -> 0.4
    // carbs: 12.34 * 0.33 = 4.0722 -> 4.1
    // fat: 5.67 * 0.33 = 1.8711 -> 1.9
    expect(result.protein).toBe(0.4);
    expect(result.carbs).toBe(4.1);
    expect(result.fat).toBe(1.9);
  });

  test("null macros become 0 and flag has_missing_macros", () => {
    const result = normalizeNutritionItem({
      food_name: "Banana",
      meal: "Snack",
      protein: null,
      carbs: null,
      fat: null,
      serving_size_value: 100,
      amount_eaten_value: 120,
    });

    expect(result.protein).toBe(0);
    expect(result.carbs).toBe(0);
    expect(result.fat).toBe(0);
    expect(result.calories).toBe(0);
    expect(result.has_missing_macros).toBe(true);
  });

  test("amount and unit come from amount_eaten fields", () => {
    const result = normalizeNutritionItem({
      food_name: "Milk",
      protein: 3.3,
      carbs: 5,
      fat: 3.6,
      amount_eaten_value: 250,
      amount_eaten_unit: "ml",
    });

    expect(result.amount).toBe(250);
    expect(result.unit).toBe("ml");
  });
});
