import { eq, desc, sql } from "drizzle-orm";
import { mapNutritionLogRow } from "../db/mappers";
import { nutritionLogs } from "../schema";
import db from "../db/client";
import type { NutritionItem, NutritionRow } from "../types";

export async function insertNutritionItems(
  date: string,
  items: NutritionItem[],
): Promise<NutritionRow[]> {
  if (items.length === 0) return [];

  const values = items.map((item) => ({
    date,
    meal: item.meal,
    food_name: item.food_name,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    calories: item.calories,
  }));

  const inserted = await db
    .insert(nutritionLogs)
    .values(values)
    .returning();

  return inserted.map(mapNutritionLogRow);
}

export async function updateNutritionItem(
  id: number,
  updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "calories">>,
): Promise<NutritionRow | null> {
  const [updated] = await db
    .update(nutritionLogs)
    .set(updates)
    .where(eq(nutritionLogs.id, id))
    .returning();

  if (!updated) return null;
  return mapNutritionLogRow(updated);
}

export async function getNutritionByDate(
  date: string,
): Promise<NutritionRow[]> {
  const rows = await db
    .select()
    .from(nutritionLogs)
    .where(eq(nutritionLogs.date, date))
    .orderBy(
      sql`CASE ${nutritionLogs.meal}
        WHEN 'Breakfast' THEN 1
        WHEN 'Lunch' THEN 2
        WHEN 'Dinner' THEN 3
        WHEN 'Snack' THEN 4
        ELSE 5
      END`,
      nutritionLogs.id,
    );

  return rows.map(mapNutritionLogRow);
}

export async function getNutritionDates(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ date: nutritionLogs.date })
    .from(nutritionLogs)
    .orderBy(desc(nutritionLogs.date));

  return rows.map((r) => r.date);
}

export async function deleteNutritionItem(id: number): Promise<void> {
  await db.delete(nutritionLogs).where(eq(nutritionLogs.id, id));
}

export async function deleteNutritionByDate(date: string): Promise<void> {
  await db.delete(nutritionLogs).where(eq(nutritionLogs.date, date));
}

