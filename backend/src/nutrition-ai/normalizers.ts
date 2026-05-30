// src/nutrition-ai/normalizers.ts

import type { NutritionItem, MealType, RawLLMItem } from "../types";

/**
 * Round a number to 1 decimal place.
 */
export function roundTo1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Normalize a meal type string to a valid MealType.
 */
export function normalizeMeal(meal: string): MealType {
  const lower = meal.toLowerCase().trim();
  if (lower.includes("breakfast") || lower.includes("มื้อเช้า")) return "Breakfast";
  if (lower.includes("lunch") || lower.includes("มื้อกลางวัน") || lower.includes("มื้อเที่ยง")) return "Lunch";
  if (lower.includes("dinner") || lower.includes("มื้อเย็น")) return "Dinner";
  if (lower.includes("snack") || lower.includes("ของว่าง") || lower.includes("ขนม")) return "Snack";
  return "Snack";
}

/**
 * Normalize a raw LLM item into a validated NutritionItem.
 * All math (scaling, calorie computation) is deterministic — the LLM
 * only extracts raw text/numbers.
 */
export function normalizeNutritionItem(item: RawLLMItem): NutritionItem {
  const servingSize = Number(item.serving_size_value) || 1;
  const amountEaten = Number(item.amount_eaten_value) || 1;

  const scaleFactor = servingSize > 0 ? (amountEaten / servingSize) : 1;

  const baseProtein = Number(item.protein ?? 0);
  const baseCarbs = Number(item.carbs ?? 0);
  const baseFat = Number(item.fat ?? 0);

  const protein = roundTo1(baseProtein * scaleFactor);
  const carbs = roundTo1(baseCarbs * scaleFactor);
  const fat = roundTo1(baseFat * scaleFactor);
  const calories = roundTo1((protein * 4) + (carbs * 4) + (fat * 9));
  const hasMissingMacros = baseProtein === 0 && baseCarbs === 0 && baseFat === 0;

  return {
    food_name: String(item.food_name || "Unknown Food"),
    meal: normalizeMeal(String(item.meal || "Snack")),
    protein,
    carbs,
    fat,
    calories,
    amount: amountEaten,
    unit: String(item.amount_eaten_unit || "g"),
    has_missing_macros: hasMissingMacros,
  };
}
