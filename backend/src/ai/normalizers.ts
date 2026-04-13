// src/ai/normalizers.ts

import type { WorkoutData } from "../types";
import { withWorkoutDefaults } from "../lib/defaults";

/**
 * Normalize a single workout item from AI response.
 * Uses withWorkoutDefaults to apply consistent defaults.
 */
export function normalizeWorkoutItem(item: Record<string, unknown>): WorkoutData {
  return withWorkoutDefaults({
    exercise_name: item.exercise_name ? String(item.exercise_name) : undefined,
    weight: Number(item.weight) || undefined,
    reps: Number(item.reps) || undefined,
    rpe: Number(item.rpe) || undefined,
    is_bodyweight: item.is_bodyweight !== undefined ? Boolean(item.is_bodyweight) : undefined,
    is_assisted: item.is_assisted !== undefined ? Boolean(item.is_assisted) : undefined,
    variant_details: item.variant_details ? String(item.variant_details) : undefined,
    notes_thai: item.notes_thai ? String(item.notes_thai) : undefined,
    notes_english: item.notes_english ? String(item.notes_english) : undefined,
    tags: Array.isArray(item.tags) ? item.tags.map(String) : undefined,
    muscle_group: item.muscle_group ? String(item.muscle_group) : undefined,
  });
}
