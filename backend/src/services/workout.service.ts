// src/services/workout.service.ts

import type { WorkoutData, WorkoutRow, SessionActivityData } from "../types";
import type { WorkoutUpdateData } from "../repositories/workout.repository";
import type { AIService } from "./ai.service";
import { DEFAULT_WORKOUT_LIMIT, DEFAULT_RECENT_NOTES_LIMIT } from "../constants";
import { ValidationError } from "../lib/errors";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("workout-service");

export interface WorkoutService {
  getRecent(limit?: number): Promise<WorkoutRow[]>;
  getByDate(date: string): Promise<WorkoutRow[]>;
  getDates(): Promise<string[]>;
  create(item: WorkoutData, createdAt?: string, sessionId?: number): Promise<WorkoutRow>;
  update(id: number, data: WorkoutUpdateData): Promise<WorkoutRow | null>;
  delete(id: number): Promise<boolean>;
  parseWorkoutText(rawText: string): Promise<WorkoutData[]>;
  confirmSession(rawText: string, items: WorkoutData[], createdAt: string, activity?: SessionActivityData): Promise<WorkoutRow[]>;
  getDistinctExercises(): Promise<string[]>;
  getByExercise(exercise: string, daysBack?: number): Promise<WorkoutRow[]>;
  getRecentNotes(exercise: string): Promise<WorkoutRow[]>;
}

export function createWorkoutService(
  repo: ReturnType<typeof import("../repositories/workout.repository").createWorkoutRepository>,
  aiService: AIService
): WorkoutService {
  return {
    async getRecent(limit = DEFAULT_WORKOUT_LIMIT): Promise<WorkoutRow[]> {
      return repo.getRecent(limit);
    },

    async getByDate(date: string): Promise<WorkoutRow[]> {
      return repo.getByDate(date);
    },

    async getDates(): Promise<string[]> {
      return repo.getDates();
    },

    async create(item: WorkoutData, createdAt?: string, sessionId?: number): Promise<WorkoutRow> {
      if (!item.exercise_name || item.exercise_name.trim().length === 0) {
        throw new ValidationError("exercise_name cannot be empty");
      }
      const effectiveCreatedAt = createdAt || new Date().toISOString();
      logger.debug("Creating workout", { exercise: item.exercise_name, sessionId });
      return repo.create(item, effectiveCreatedAt, sessionId);
    },

    async update(id: number, data: WorkoutUpdateData): Promise<WorkoutRow | null> {
      return repo.update(id, data);
    },

    async delete(id: number): Promise<boolean> {
      return repo.delete(id);
    },

    async parseWorkoutText(rawText: string): Promise<WorkoutData[]> {
      if (!rawText || rawText.trim().length === 0) {
        throw new ValidationError("raw_text cannot be empty");
      }
      return aiService.parseWorkoutText(rawText);
    },

    async confirmSession(rawText: string, items: WorkoutData[], createdAt: string, activity?: SessionActivityData): Promise<WorkoutRow[]> {
      if (!items || items.length === 0) {
        throw new ValidationError("No workout items to save");
      }
      return repo.createBatch(rawText, items, createdAt, activity);
    },

    async getDistinctExercises(): Promise<string[]> {
      return repo.getDistinctExercises();
    },

    async getByExercise(exercise: string, daysBack = 0): Promise<WorkoutRow[]> {
      return repo.getByExercise(exercise, daysBack);
    },

    async getRecentNotes(exercise: string): Promise<WorkoutRow[]> {
      return repo.getRecentNotes(exercise, DEFAULT_RECENT_NOTES_LIMIT);
    },
  };
}
