// src/nutrition-ai/normalizers.ts

import type { NutritionItem, MealType } from "../types";

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
 * Normalize a single nutrition item from AI response.
 */
export function normalizeNutritionItem(item: Record<string, unknown>): NutritionItem {
  return {
    food_name: String(item.food_name || "Unknown Food"),
    meal: normalizeMeal(String(item.meal || "Snack")),
    protein: roundTo1(Number(item.protein) || 0),
    carbs: roundTo1(Number(item.carbs) || 0),
    fat: roundTo1(Number(item.fat) || 0),
    calories: roundTo1(Number(item.calories) || 0),
    has_missing_macros: Boolean(item.has_missing_macros),
  };
}
