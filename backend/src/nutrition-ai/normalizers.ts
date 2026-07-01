// src/nutrition-ai/normalizers.ts

import type { NutritionItem, MealType, RawLLMItem } from "../types";

const ALCOHOL_TERMS = [
  "beer",
  "lager",
  "ale",
  "cider",
  "stout",
  "ipa",
  "wine",
  "prosecco",
  "champagne",
  "vodka",
  "gin",
  "whisky",
  "whiskey",
  "rum",
  "tequila",
  "cocktail",
  "เบียร์",
  "ไวน์",
  "เหล้า",
];

/**
 * Round a number to 1 decimal place.
 */
export function roundTo1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function isAlcoholicItemName(foodName: string): boolean {
  const normalized = foodName.toLowerCase();
  return ALCOHOL_TERMS.some((term) => normalized.includes(term));
}

function traceAwareMacro(value: number | null | undefined, isTrace: boolean | undefined, isAlcoholic: boolean): number {
  if (isAlcoholic && isTrace) return 0;
  return Number(value ?? 0);
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
  const foodName = String(item.food_name || "Unknown Food");
  const isAlcoholic = isAlcoholicItemName(foodName);

  const baseProtein = traceAwareMacro(item.protein, item.protein_is_trace, isAlcoholic);
  const baseCarbs = traceAwareMacro(item.carbs, item.carbs_is_trace, isAlcoholic);
  const baseFat = traceAwareMacro(item.fat, item.fat_is_trace, isAlcoholic);
  const baseAlcohol = Number(item.alcohol ?? 0);
  const rawCalories = item.calories === null || item.calories === undefined ? null : Number(item.calories);
  const baseCalories = rawCalories !== null && Number.isFinite(rawCalories) ? rawCalories : null;

  const protein = roundTo1(baseProtein * scaleFactor);
  const carbs = roundTo1(baseCarbs * scaleFactor);
  const fat = roundTo1(baseFat * scaleFactor);
  const explicitAlcohol = roundTo1(baseAlcohol * scaleFactor);
  const labelCalories = baseCalories === null ? null : roundTo1(baseCalories * scaleFactor);
  const knownCalories = (protein * 4) + (carbs * 4) + (fat * 9);
  const inferredAlcohol = isAlcoholic && labelCalories !== null && explicitAlcohol === 0
    ? roundTo1(Math.max(0, (labelCalories - knownCalories) / 7))
    : 0;
  const alcohol = explicitAlcohol || inferredAlcohol;
  const calories = labelCalories ?? roundTo1(knownCalories + (alcohol * 7));
  const hasMissingMacros = baseProtein === 0 && baseCarbs === 0 && baseFat === 0 && alcohol === 0;

  return {
    food_name: foodName,
    meal: normalizeMeal(String(item.meal || "Snack")),
    protein,
    carbs,
    fat,
    alcohol,
    calories,
    amount: amountEaten,
    unit: String(item.amount_eaten_unit || "g"),
    has_missing_macros: hasMissingMacros,
  };
}
