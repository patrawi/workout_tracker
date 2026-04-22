export interface WorkoutData {
  exercise_name: string;
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
}

export interface ProfileRow extends ProfileData {
  id: number;
  updated_at: string;
}

export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export interface NutritionItem {
  food_name: string;
  meal: MealType;
  protein: number;       // grams (after scaling)
  carbs: number;
  fat: number;
  calories: number;      // computed: P×4 + C×4 + F×9
  has_missing_macros: boolean;  // AI flag, used in review UI only
}

export interface NutritionRow {
  id: number;
  date: string;
  meal: MealType;
  food_name: string;
  protein: number;
  carbs: number;
  fat: number;
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
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
