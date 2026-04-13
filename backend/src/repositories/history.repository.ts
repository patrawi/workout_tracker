import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { workouts, restDays, nutritionLogs } from "../schema";

export interface HistoryDate {
  date: string;
  hasWorkout: boolean;
  hasRestDay: boolean;
  hasNutrition: boolean;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

export function createHistoryRepository(dbInstance: PostgresJsDatabase) {
  return {
    /**
     * Get all unique dates that have workout, rest day, or nutrition activity.
     * Returns macro totals for dates with nutrition data.
     */
    async getDates(): Promise<HistoryDate[]> {
      const rows = await dbInstance.execute<{
        date: string;
        has_workout: boolean;
        has_rest_day: boolean;
        has_nutrition: boolean;
        total_protein: number;
        total_carbs: number;
        total_fat: number;
        total_calories: number;
      }>(sql`
        SELECT
          d.date,
          COALESCE(w.has_workout, false) AS has_workout,
          COALESCE(r.has_rest_day, false) AS has_rest_day,
          COALESCE(n.has_nutrition, false) AS has_nutrition,
          COALESCE(n.total_protein, 0) AS total_protein,
          COALESCE(n.total_carbs, 0) AS total_carbs,
          COALESCE(n.total_fat, 0) AS total_fat,
          COALESCE(n.total_calories, 0) AS total_calories
        FROM (
          SELECT DISTINCT DATE(${workouts.created_at})::text AS date FROM ${workouts}
          UNION
          SELECT DISTINCT ${restDays.date} AS date FROM ${restDays}
          UNION
          SELECT DISTINCT ${nutritionLogs.date} AS date FROM ${nutritionLogs}
        ) d
        LEFT JOIN LATERAL (
          SELECT true AS has_workout
          FROM ${workouts}
          WHERE DATE(${workouts.created_at})::text = d.date
          LIMIT 1
        ) w ON true
        LEFT JOIN LATERAL (
          SELECT true AS has_rest_day
          FROM ${restDays}
          WHERE ${restDays.date} = d.date
          LIMIT 1
        ) r ON true
        LEFT JOIN LATERAL (
          SELECT
            true AS has_nutrition,
            SUM(${nutritionLogs.protein})::real AS total_protein,
            SUM(${nutritionLogs.carbs})::real AS total_carbs,
            SUM(${nutritionLogs.fat})::real AS total_fat,
            SUM(${nutritionLogs.calories})::real AS total_calories
          FROM ${nutritionLogs}
          WHERE ${nutritionLogs.date} = d.date
          HAVING COUNT(*) > 0
        ) n ON true
        ORDER BY d.date DESC
      `);

      return rows.map((row) => ({
        date: String(row.date),
        hasWorkout: Boolean(row.has_workout),
        hasRestDay: Boolean(row.has_rest_day),
        hasNutrition: Boolean(row.has_nutrition),
        protein: Number(row.total_protein) || 0,
        carbs: Number(row.total_carbs) || 0,
        fat: Number(row.total_fat) || 0,
        calories: Number(row.total_calories) || 0,
      }));
    },
  };
}
