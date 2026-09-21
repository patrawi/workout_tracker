// src/services/analytics.service.ts

import type { HeatmapDay, VolumeData, VolumeTrendData } from "../repositories/analytics.repository";
import type { WorkoutRow } from "../types";
import { ANALYTICS_DEFAULT_DAYS_BACK, ANALYTICS_DEFAULT_DAYS_BACK_FOR_EXERCISE, DEFAULT_RECENT_NOTES_LIMIT } from "../constants";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("analytics-service");

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export interface AnalyticsService {
  getExercises(userId?: number): Promise<string[]>;
  getAnalytics(exercise: string, daysBack?: number, userId?: number): Promise<WorkoutRow[]>;
  getVolume(daysBack?: number, userId?: number): Promise<VolumeData[]>;
  getVolumeTrend(daysBack?: number, userId?: number): Promise<VolumeTrendData[]>;
  getNotes(exercise: string, userId?: number): Promise<WorkoutRow[]>;
  getHeatmap(userId?: number): Promise<HeatmapDay[]>;
}

export function createAnalyticsService(
  analyticsRepo: ReturnType<typeof import("../repositories/analytics.repository").createAnalyticsRepository>,
  workoutRepo: ReturnType<typeof import("../repositories/workout.repository").createWorkoutRepository>
): AnalyticsService {
  return {
    async getExercises(userId: number = DEFAULT_USER_ID): Promise<string[]> {
      return workoutRepo.getDistinctExercises(userId);
    },

    async getAnalytics(exercise: string, daysBack = ANALYTICS_DEFAULT_DAYS_BACK_FOR_EXERCISE, userId: number = DEFAULT_USER_ID): Promise<WorkoutRow[]> {
      return workoutRepo.getByExercise(exercise, daysBack, userId);
    },

    async getVolume(daysBack = ANALYTICS_DEFAULT_DAYS_BACK, userId: number = DEFAULT_USER_ID): Promise<VolumeData[]> {
      return analyticsRepo.getVolume(daysBack, userId);
    },

    async getVolumeTrend(daysBack = 14, userId: number = DEFAULT_USER_ID): Promise<VolumeTrendData[]> {
      return analyticsRepo.getVolumeTrend(daysBack, userId);
    },

    async getNotes(exercise: string, userId: number = DEFAULT_USER_ID): Promise<WorkoutRow[]> {
      return workoutRepo.getRecentNotes(exercise, DEFAULT_RECENT_NOTES_LIMIT, userId);
    },

    async getHeatmap(userId: number = DEFAULT_USER_ID): Promise<HeatmapDay[]> {
      return analyticsRepo.getHeatmap(userId);
    },
  };
}
