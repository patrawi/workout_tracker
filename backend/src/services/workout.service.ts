// src/services/workout.service.ts

import type { WorkoutData, WorkoutRow, SessionActivityData } from "../types";
import type { WorkoutUpdateData } from "../repositories/workout.repository";
import type { AIService } from "./ai.service";
import type { ExerciseMatchOutcome } from "../exercises/exercise-matcher";
import { DEFAULT_WORKOUT_LIMIT, DEFAULT_RECENT_NOTES_LIMIT } from "../constants";
import { ValidationError } from "../lib/errors";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("workout-service");

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

/** Canonical anchor written alongside each confirmed workout row (ADR 0027). */
export interface WorkoutAnchor {
  canonical_exercise_id: number | null;
  match_tier: "manual" | "auto" | "ambiguous" | "gap" | null;
}

export interface WorkoutServiceDeps {
  /** Optional — resolving anchors must never block a save (ADR 0027). */
  exerciseMatcher?: {
    match(name: string): Promise<ExerciseMatchOutcome>;
  };
}

function outcomeToAnchor(outcome: ExerciseMatchOutcome): WorkoutAnchor {
  switch (outcome.tier) {
    case "auto":
      return { canonical_exercise_id: outcome.exercise.id, match_tier: "auto" };
    case "ambiguous":
      return { canonical_exercise_id: null, match_tier: "ambiguous" };
    case "gap":
      return { canonical_exercise_id: null, match_tier: "gap" };
  }
}

async function resolveAnchors(
  items: WorkoutData[],
  matcher: WorkoutServiceDeps["exerciseMatcher"],
): Promise<WorkoutAnchor[]> {
  return Promise.all(
    items.map(async (item): Promise<WorkoutAnchor> => {
      if (!matcher) return { canonical_exercise_id: null, match_tier: null };
      try {
        return outcomeToAnchor(await matcher.match(item.exercise_name));
      } catch (error) {
        // Never block a save on matching trouble (ADR 0027).
        logger.warn("exercise match failed; saving unanchored", {
          error,
          exercise: item.exercise_name,
        });
        return { canonical_exercise_id: null, match_tier: null };
      }
    }),
  );
}

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
  aiService: AIService,
  deps: WorkoutServiceDeps = {},
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
      const anchors = await resolveAnchors(items, deps.exerciseMatcher);
      return repo.createBatch(rawText, items, createdAt, activity, userId, anchors);
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
