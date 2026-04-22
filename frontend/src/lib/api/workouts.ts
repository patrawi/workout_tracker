import { api } from "../api-client";
import type { WorkoutRow, WorkoutData, SessionActivityData } from "@/types";

export interface AddWorkoutInput {
  exercise_name: string;
  weight?: number;
  reps?: number;
  rpe?: number;
  is_bodyweight?: boolean;
  is_assisted?: boolean;
  variant_details?: string;
  notes_thai?: string;
  notes_english?: string;
  tags?: string[];
  muscle_group?: string;
  created_at?: string;
  session_id?: number;
}

export const workoutsApi = {
  list: () => api.get<WorkoutRow[]>("/workouts"),

  getDates: () => api.get<string[]>("/workouts/dates"),

  getByDate: (date: string) => api.get<WorkoutRow[]>(`/workouts/date/${date}`),

  create: (rawText: string, items: WorkoutData[], createdAt: string, activity?: SessionActivityData) =>
    api.post<WorkoutRow[]>("/confirm", {
      raw_text: rawText,
      items,
      created_at: createdAt,
      activity,
    }),

  add: (workout: AddWorkoutInput) => api.post<WorkoutRow>("/workouts", workout),

  update: (
    id: number,
    data: {
      exercise_name: string;
      weight: number;
      reps: number;
      rpe: number;
      is_bodyweight: boolean;
      is_assisted: boolean;
      variant_details: string;
      notes_thai: string;
      notes_english: string;
    },
  ) => api.patch<WorkoutRow>(`/workouts/${id}`, data),

  delete: (id: number) => api.del<{ deleted: boolean }>(`/workouts/${id}`),

  parse: (rawText: string) =>
    api.post<WorkoutData[]>("/parse", { raw_text: rawText }),
};
