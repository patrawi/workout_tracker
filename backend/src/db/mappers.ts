import { workouts, profile, restDays, bodyweightLogs, nutritionLogs } from "../schema";
import type { WorkoutRow, ProfileRow, NutritionRow } from "../types";
import {
  defaultNumber,
  defaultString,
  defaultBoolean,
  defaultArray,
} from "../lib/defaults";

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
    weight: defaultNumber(row.weight),
    reps: defaultNumber(row.reps),
    rpe: defaultNumber(row.rpe),
    is_bodyweight: defaultBoolean(row.is_bodyweight),
    is_assisted: defaultBoolean(row.is_assisted),
    variant_details: defaultString(row.variant_details),
    notes_thai: defaultString(row.notes_thai),
    notes_english: defaultString(row.notes_english),
    tags: defaultArray<string>(row.tags),
    muscle_group: row.muscle_group ?? "Other",
    created_at: defaultString(row.created_at),
  };
}

export function mapProfileRow(row: typeof profile.$inferSelect): ProfileRow {
  return {
    id: row.id,
    weight_kg: defaultNumber(row.weight_kg),
    height_cm: defaultNumber(row.height_cm),
    tdee: defaultNumber(row.tdee),
    calories_intake: defaultNumber(row.calories_intake),
    protein_target: defaultNumber(row.protein_target),
    carbs_target: defaultNumber(row.carbs_target),
    fat_target: defaultNumber(row.fat_target),
    updated_at: defaultString(row.updated_at),
  };
}

export function mapRestDayRow(row: typeof restDays.$inferSelect): RestDayRow {
  return {
    id: row.id,
    date: row.date,
    walked_10k: defaultBoolean(row.walked_10k),
    did_liss: defaultBoolean(row.did_liss),
    did_stretch: defaultBoolean(row.did_stretch),
    notes: defaultString(row.notes),
    created_at: defaultString(row.created_at),
  };
}

export function mapBodyweightLogRow(
  row: typeof bodyweightLogs.$inferSelect,
): BodyweightLogRow {
  return {
    id: row.id,
    date: row.date,
    weight_kg: row.weight_kg,
    created_at: defaultString(row.created_at),
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
    protein: defaultNumber(row.protein),
    carbs: defaultNumber(row.carbs),
    fat: defaultNumber(row.fat),
    calories: defaultNumber(row.calories),
    created_at: defaultString(row.created_at),
  };
}
