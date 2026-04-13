// src/lib/defaults.ts

import {
  DEFAULT_NUMBER,
  DEFAULT_EMPTY_STRING,
  DEFAULT_BOOLEAN_FALSE,
  DEFAULT_TAGS,
  DEFAULT_EXERCISE_NAME,
  DEFAULT_MUSCLE_GROUP,
} from "../constants";

/**
 * Apply defaults to a workout data object.
 * Used by: repositories (insert), mappers (map), AI (normalize).
 */
export function withWorkoutDefaults<T extends Record<string, unknown>>(
  item: T
): T & {
  weight: number;
  reps: number;
  rpe: number;
  is_bodyweight: boolean;
  is_assisted: boolean;
  variant_details: string;
  notes_thai: string;
  notes_english: string;
  tags: string[];
  muscle_group: string;
  exercise_name: string;
} {
  return {
    ...item,
    exercise_name: (item.exercise_name as string) || DEFAULT_EXERCISE_NAME,
    weight: (item.weight as number) ?? DEFAULT_NUMBER,
    reps: (item.reps as number) ?? DEFAULT_NUMBER,
    rpe: (item.rpe as number) ?? DEFAULT_NUMBER,
    is_bodyweight: (item.is_bodyweight as boolean) ?? DEFAULT_BOOLEAN_FALSE,
    is_assisted: (item.is_assisted as boolean) ?? DEFAULT_BOOLEAN_FALSE,
    variant_details: (item.variant_details as string) ?? DEFAULT_EMPTY_STRING,
    notes_thai: (item.notes_thai as string) ?? DEFAULT_EMPTY_STRING,
    notes_english: (item.notes_english as string) ?? DEFAULT_EMPTY_STRING,
    tags: (item.tags as string[]) ?? DEFAULT_TAGS,
    muscle_group: (item.muscle_group as string) ?? DEFAULT_MUSCLE_GROUP,
  } as any;
}

/** Generic default helpers for other entities */
export function defaultNumber(value: unknown): number {
  return (value as number) ?? DEFAULT_NUMBER;
}

export function defaultString(value: unknown): string {
  return (value as string) ?? DEFAULT_EMPTY_STRING;
}

export function defaultBoolean(value: unknown): boolean {
  return (value as boolean) ?? DEFAULT_BOOLEAN_FALSE;
}

export function defaultArray<T>(value: unknown): T[] {
  return (value as T[]) ?? [];
}
