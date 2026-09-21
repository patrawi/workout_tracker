import { and, eq, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mapNutritionLogRow } from "../db/mappers";
import { nutritionLogs } from "../schema";
import type { NutritionItem, NutritionRow } from "../types";

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export function createNutritionRepository(dbInstance: PostgresJsDatabase) {
  return {
    async insertBatch(date: string, items: NutritionItem[], userId: number = DEFAULT_USER_ID): Promise<NutritionRow[]> {
      if (items.length === 0) return [];

      const values = items.map((item) => ({
        user_id: userId,
        date,
        meal: item.meal,
        food_name: item.food_name,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        alcohol: item.alcohol ?? 0,
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
      updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "alcohol" | "calories">>,
      userId: number = DEFAULT_USER_ID,
    ): Promise<NutritionRow | null> {
      const [updated] = await dbInstance
        .update(nutritionLogs)
        .set(updates)
        .where(and(eq(nutritionLogs.id, id), eq(nutritionLogs.user_id, userId)))
        .returning();

      if (!updated) return null;
      return mapNutritionLogRow(updated);
    },

    async getByDate(date: string, userId: number = DEFAULT_USER_ID): Promise<NutritionRow[]> {
      const rows = await dbInstance
        .select()
        .from(nutritionLogs)
        .where(and(eq(nutritionLogs.user_id, userId), eq(nutritionLogs.date, date)))
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

    async getDates(userId: number = DEFAULT_USER_ID): Promise<string[]> {
      const rows = await dbInstance
        .selectDistinct({ date: nutritionLogs.date })
        .from(nutritionLogs)
        .where(eq(nutritionLogs.user_id, userId))
        .orderBy(desc(nutritionLogs.date));

      return rows.map((r) => r.date);
    },

    async deleteItem(id: number, userId: number = DEFAULT_USER_ID): Promise<void> {
      await dbInstance
        .delete(nutritionLogs)
        .where(and(eq(nutritionLogs.id, id), eq(nutritionLogs.user_id, userId)));
    },

    async deleteByDate(date: string, userId: number = DEFAULT_USER_ID): Promise<void> {
      await dbInstance
        .delete(nutritionLogs)
        .where(and(eq(nutritionLogs.user_id, userId), eq(nutritionLogs.date, date)));
    },
  };
}
