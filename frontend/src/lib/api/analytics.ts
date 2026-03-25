import { api } from "../api-client";
import type { WorkoutRow, VolumeData } from "@/types";

export const analyticsApi = {
    getExerciseData: (exercise: string, days: string) =>
        api.get<WorkoutRow[]>(
            `/analytics?exercise=${encodeURIComponent(exercise)}&days=${days}`
        ),

    getNotes: (exercise: string) =>
        api.get<WorkoutRow[]>(
            `/notes?exercise=${encodeURIComponent(exercise)}`
        ),

    getExercises: () => api.get<string[]>("/exercises"),

    getVolume: (days: string) =>
        api.get<VolumeData[]>(`/analytics/volume?days=${days}`),
};
