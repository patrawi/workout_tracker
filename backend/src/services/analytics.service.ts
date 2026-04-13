// src/services/analytics.service.ts

import type { HeatmapDay, VolumeData } from "../repositories/analytics.repository";
import type { WorkoutRow } from "../types";
import { ANALYTICS_DEFAULT_DAYS_BACK, ANALYTICS_DEFAULT_DAYS_BACK_FOR_EXERCISE, DEFAULT_RECENT_NOTES_LIMIT } from "../constants";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("analytics-service");

export interface AnalyticsService {
  getExercises(): Promise<string[]>;
  getAnalytics(exercise: string, daysBack?: number): Promise<WorkoutRow[]>;
  getVolume(daysBack?: number): Promise<VolumeData[]>;
  getNotes(exercise: string): Promise<WorkoutRow[]>;
  getHeatmap(): Promise<HeatmapDay[]>;
}

export function createAnalyticsService(
  analyticsRepo: ReturnType<typeof import("../repositories/analytics.repository").createAnalyticsRepository>,
  workoutRepo: ReturnType<typeof import("../repositories/workout.repository").createWorkoutRepository>
): AnalyticsService {
  return {
    async getExercises(): Promise<string[]> {
      return workoutRepo.getDistinctExercises();
    },

    async getAnalytics(exercise: string, daysBack = ANALYTICS_DEFAULT_DAYS_BACK_FOR_EXERCISE): Promise<WorkoutRow[]> {
      return workoutRepo.getByExercise(exercise, daysBack);
    },

    async getVolume(daysBack = ANALYTICS_DEFAULT_DAYS_BACK): Promise<VolumeData[]> {
      return analyticsRepo.getVolume(daysBack);
    },

    async getNotes(exercise: string): Promise<WorkoutRow[]> {
      return workoutRepo.getRecentNotes(exercise, DEFAULT_RECENT_NOTES_LIMIT);
    },

    async getHeatmap(): Promise<HeatmapDay[]> {
      return analyticsRepo.getHeatmap();
    },
  };
}
