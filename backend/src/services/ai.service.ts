// src/services/ai.service.ts

import type { WorkoutData, NutritionItem } from "../types";
import type { ConfigService } from "./config.service";
import { createWorkoutAIClient } from "../ai/client";
import { createNutritionAIClient } from "../nutrition-ai/client";
import { ExternalServiceError } from "../lib/errors";
import { createChildLogger } from "../lib/logger";
import { GEMINI_MODEL_WORKOUT, GEMINI_MODEL_NUTRITION } from "../constants";

const logger = createChildLogger("ai-service");

export interface AIService {
  parseWorkoutText(rawText: string): Promise<WorkoutData[]>;
  parseNutritionText(rawText: string): Promise<NutritionItem[]>;
}

/**
 * Create an AI service that orchestrates workout and nutrition AI clients.
 * Wraps AI clients with error handling (ExternalServiceError) and logging.
 */
export function createAIService(config: ConfigService): AIService {
  const apiKey = config.geminiApiKey;

  if (!apiKey) {
    logger.warn("GEMINI_API_KEY not set, AI features will throw on use");
  }

  const workoutClient = createWorkoutAIClient(apiKey, GEMINI_MODEL_WORKOUT);
  const nutritionClient = createNutritionAIClient(apiKey, GEMINI_MODEL_NUTRITION);

  return {
    async parseWorkoutText(rawText: string): Promise<WorkoutData[]> {
      if (!apiKey) {
        throw new ExternalServiceError("Gemini", "GEMINI_API_KEY is not set");
      }
      try {
        return await workoutClient.parse(rawText);
      } catch (error) {
        logger.error("Failed to parse workout text", { error: String(error) });
        throw new ExternalServiceError("Gemini", String(error));
      }
    },
    async parseNutritionText(rawText: string): Promise<NutritionItem[]> {
      if (!apiKey) {
        throw new ExternalServiceError("Gemini", "GEMINI_API_KEY is not set");
      }
      try {
        return await nutritionClient.parse(rawText);
      } catch (error) {
        logger.error("Failed to parse nutrition text", { error: String(error) });
        throw new ExternalServiceError("Gemini", String(error));
      }
    },
  };
}
