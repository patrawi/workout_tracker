import type { SessionType } from "./constants";

export interface WorkoutData {
  exercise_name: string;
  weight: number;
  reps: number;
  rpe: number;
  is_bodyweight: boolean;
  is_assisted: boolean;
  pain: boolean;
  variant_details: string;
  notes_thai: string;
  notes_english: string;
  tags: string[];
  muscle_group: string;
}

export interface WorkoutRow extends WorkoutData {
  id: number;
  session_id: number;
  created_at: string;
}

export interface SessionRow {
  id: number;
  raw_input: string;
  walked_10k: boolean;
  did_liss: boolean;
  did_stretch: boolean;
  notes: string;
  session_type: SessionType;
  gym_profile: string;
  created_at: string;
}

export interface ProfileData {
  weight_kg: number;
  height_cm: number;
  tdee: number;
  calories_intake: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  water_target_glasses: number;
}

export interface ProfileRow extends ProfileData {
  id: number;
  updated_at: string;
}

export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export interface RawLLMItem {
  food_name?: string;
  meal?: string;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  alcohol?: number | null;
  calories?: number | null;
  protein_is_trace?: boolean;
  carbs_is_trace?: boolean;
  fat_is_trace?: boolean;
  serving_size_value?: number;
  serving_size_unit?: string;
  amount_eaten_value?: number;
  amount_eaten_unit?: string;
}

export interface NutritionItem {
  food_name: string;
  meal: MealType;
  protein: number;       // grams (after scaling)
  carbs: number;
  fat: number;
  alcohol: number;
  calories: number;      // label kcal, or computed in code: P*4 + C*4 + F*9 + alcohol*7
  amount: number;        // how much was eaten
  unit: string;          // "g" | "ml" | "serving" | "piece"
  has_missing_macros: boolean;  // true when LLM couldn't extract macros
  // ——— Catalog grounding (RAG) — optional, populated by the grounding pass ———
  matched_food_name?: string;   // name of the catalog food the macros came from
  matched_food_id?: string;     // catalog id of that food
  uncertain?: boolean;          // true when no confident catalog match — needs manual review
  unit_mismatch?: boolean;      // matched, but logged unit ≠ catalog unit — macros are best-effort, verify amount
  // Catalog basis for the matched row (per `per_amount` `per_unit`), so the client
  // can re-scale macros live when the user edits the amount.
  catalog?: {
    per_amount: number;
    per_unit: string;
    protein: number;
    carbs: number;
    fat: number;
    alcohol?: number;
  };
}

export interface NutritionRow {
  id: number;
  date: string;
  meal: MealType;
  food_name: string;
  protein: number;
  carbs: number;
  fat: number;
  alcohol: number;
  calories: number;
  created_at: string;
}

export interface LogRequest {
  raw_text: string;
}

export interface SessionActivityData {
  walked_10k: boolean;
  did_liss: boolean;
  did_stretch: boolean;
  notes: string;
  session_type?: SessionType;   // spec §3.3; defaults to "working"
  gym_profile?: string;         // spec §3.4; defaults to DEFAULT_GYM_PROFILE
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
