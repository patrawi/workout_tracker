import { workouts, profile, restDays, bodyweightLogs, nutritionLogs } from "../schema";
import type { WorkoutRow, ProfileRow, NutritionRow } from "../types";

export interface RestDayRow {
  id: number;
  date: string;
  walked_10k: boolean;
  did_liss: boolean;
  did_stretch: boolean;
  notes: string;
  created_at: string;
}

export interface BodyweightLogRow {
  id: number;
  date: string;
  weight_kg: number;
  created_at: string;
}

export function mapWorkoutRow(row: typeof workouts.$inferSelect): WorkoutRow {
  return {
    id: row.id,
    session_id: row.session_id,
    exercise_name: row.exercise_name,
    weight: row.weight ?? 0,
    reps: row.reps ?? 0,
    rpe: row.rpe ?? 0,
    is_bodyweight: row.is_bodyweight ?? false,
    is_assisted: row.is_assisted ?? false,
    variant_details: row.variant_details ?? "",
    notes_thai: row.notes_thai ?? "",
    notes_english: row.notes_english ?? "",
    tags: (row.tags as string[]) ?? [],
    muscle_group: row.muscle_group ?? "Other",
    created_at: row.created_at ?? "",
  };
}

export function mapProfileRow(row: typeof profile.$inferSelect): ProfileRow {
  return {
    id: row.id,
    weight_kg: row.weight_kg ?? 0,
    height_cm: row.height_cm ?? 0,
    tdee: row.tdee ?? 0,
    calories_intake: row.calories_intake ?? 0,
    protein_target: row.protein_target ?? 0,
    carbs_target: row.carbs_target ?? 0,
    fat_target: row.fat_target ?? 0,
    updated_at: row.updated_at ?? "",
  };
}

export function mapRestDayRow(row: typeof restDays.$inferSelect): RestDayRow {
  return {
    id: row.id,
    date: row.date,
    walked_10k: row.walked_10k ?? false,
    did_liss: row.did_liss ?? false,
    did_stretch: row.did_stretch ?? false,
    notes: row.notes ?? "",
    created_at: row.created_at ?? "",
  };
}

export function mapBodyweightLogRow(
  row: typeof bodyweightLogs.$inferSelect,
): BodyweightLogRow {
  return {
    id: row.id,
    date: row.date,
    weight_kg: row.weight_kg,
    created_at: row.created_at ?? "",
  };
}

export function mapNutritionLogRow(
  row: typeof nutritionLogs.$inferSelect,
): NutritionRow {
  return {
    id: row.id,
    date: row.date,
    meal: row.meal,
    food_name: row.food_name,
    protein: row.protein ?? 0,
    carbs: row.carbs ?? 0,
    fat: row.fat ?? 0,
    calories: row.calories ?? 0,
    created_at: row.created_at ?? "",
  };
}
