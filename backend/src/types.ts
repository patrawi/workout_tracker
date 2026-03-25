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
  created_at: string;
}

export interface ProfileData {
  weight_kg: number;
  height_cm: number;
  tdee: number;
  calories_intake: number;
}

export interface ProfileRow extends ProfileData {
  id: number;
  updated_at: string;
}

export interface LogRequest {
  raw_text: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
