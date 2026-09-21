// src/services/workout.service.ts

import type { WorkoutData, WorkoutRow, SessionActivityData } from "../types";
import type { WorkoutUpdateData } from "../repositories/workout.repository";
import type { AIService } from "./ai.service";
import { DEFAULT_WORKOUT_LIMIT, DEFAULT_RECENT_NOTES_LIMIT } from "../constants";
import { ValidationError } from "../lib/errors";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("workout-service");

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export interface WorkoutService {
  getRecent(limit?: number, userId?: number): Promise<WorkoutRow[]>;
  getByDate(date: string, userId?: number): Promise<WorkoutRow[]>;
  getDates(userId?: number): Promise<string[]>;
  create(item: WorkoutData, createdAt?: string, sessionId?: number, userId?: number): Promise<WorkoutRow>;
  update(id: number, data: WorkoutUpdateData, userId?: number): Promise<WorkoutRow | null>;
  delete(id: number, userId?: number): Promise<boolean>;
  parseWorkoutText(rawText: string): Promise<WorkoutData[]>;
  confirmSession(rawText: string, items: WorkoutData[], createdAt: string, activity?: SessionActivityData, userId?: number): Promise<WorkoutRow[]>;
  getDistinctExercises(userId?: number): Promise<string[]>;
  getByExercise(exercise: string, daysBack?: number, userId?: number): Promise<WorkoutRow[]>;
  getRecentNotes(exercise: string, userId?: number): Promise<WorkoutRow[]>;
}

export function createWorkoutService(
  repo: ReturnType<typeof import("../repositories/workout.repository").createWorkoutRepository>,
  aiService: AIService
): WorkoutService {
  return {
    async getRecent(limit = DEFAULT_WORKOUT_LIMIT, userId: number = DEFAULT_USER_ID): Promise<WorkoutRow[]> {
      return repo.getRecent(limit, userId);
    },

    async getByDate(date: string, userId: number = DEFAULT_USER_ID): Promise<WorkoutRow[]> {
      return repo.getByDate(date, userId);
    },

    async getDates(userId: number = DEFAULT_USER_ID): Promise<string[]> {
      return repo.getDates(userId);
    },

    async create(item: WorkoutData, createdAt?: string, sessionId?: number, userId: number = DEFAULT_USER_ID): Promise<WorkoutRow> {
      if (!item.exercise_name || item.exercise_name.trim().length === 0) {
        throw new ValidationError("exercise_name cannot be empty");
      }
      const effectiveCreatedAt = createdAt || new Date().toISOString();
      logger.debug("Creating workout", { exercise: item.exercise_name, sessionId, userId });
      return repo.create(item, effectiveCreatedAt, sessionId, userId);
    },

    async update(id: number, data: WorkoutUpdateData, userId: number = DEFAULT_USER_ID): Promise<WorkoutRow | null> {
      return repo.update(id, data, userId);
    },

    async delete(id: number, userId: number = DEFAULT_USER_ID): Promise<boolean> {
      return repo.delete(id, userId);
    },

    async parseWorkoutText(rawText: string): Promise<WorkoutData[]> {
      if (!rawText || rawText.trim().length === 0) {
        throw new ValidationError("raw_text cannot be empty");
      }
      return aiService.parseWorkoutText(rawText);
    },

    async confirmSession(rawText: string, items: WorkoutData[], createdAt: string, activity?: SessionActivityData, userId: number = DEFAULT_USER_ID): Promise<WorkoutRow[]> {
      if (!items || items.length === 0) {
        throw new ValidationError("No workout items to save");
      }
      return repo.createBatch(rawText, items, createdAt, activity, userId);
    },

    async getDistinctExercises(userId: number = DEFAULT_USER_ID): Promise<string[]> {
      return repo.getDistinctExercises(userId);
    },

    async getByExercise(exercise: string, daysBack = 0, userId: number = DEFAULT_USER_ID): Promise<WorkoutRow[]> {
      return repo.getByExercise(exercise, daysBack, userId);
    },

    async getRecentNotes(exercise: string, userId: number = DEFAULT_USER_ID): Promise<WorkoutRow[]> {
      return repo.getRecentNotes(exercise, DEFAULT_RECENT_NOTES_LIMIT, userId);
    },
  };
}
