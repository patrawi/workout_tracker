import { eq, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mapNutritionLogRow } from "../db/mappers";
import { nutritionLogs } from "../schema";
import type { NutritionItem, NutritionRow } from "../types";

export function createNutritionRepository(dbInstance: PostgresJsDatabase) {
  return {
    async insertBatch(date: string, items: NutritionItem[]): Promise<NutritionRow[]> {
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

      const inserted = await dbInstance
        .insert(nutritionLogs)
        .values(values)
        .returning();

      return inserted.map(mapNutritionLogRow);
    },

    async update(
      id: number,
      updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "calories">>,
    ): Promise<NutritionRow | null> {
      const [updated] = await dbInstance
        .update(nutritionLogs)
        .set(updates)
        .where(eq(nutritionLogs.id, id))
        .returning();

      if (!updated) return null;
      return mapNutritionLogRow(updated);
    },

    async getByDate(date: string): Promise<NutritionRow[]> {
      const rows = await dbInstance
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
    },

    async getDates(): Promise<string[]> {
      const rows = await dbInstance
        .selectDistinct({ date: nutritionLogs.date })
        .from(nutritionLogs)
        .orderBy(desc(nutritionLogs.date));

      return rows.map((r) => r.date);
    },

    async deleteItem(id: number): Promise<void> {
      await dbInstance.delete(nutritionLogs).where(eq(nutritionLogs.id, id));
    },

    async deleteByDate(date: string): Promise<void> {
      await dbInstance.delete(nutritionLogs).where(eq(nutritionLogs.date, date));
    },
  };
}
