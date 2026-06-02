// src/services/ai.service.ts

import type { WorkoutData, NutritionItem } from "../types";
import type { ConfigService } from "./config.service";
import { createWorkoutAIClient } from "../ai/client";
import { createNutritionAIClient } from "../nutrition-ai/client";
import { createWorkoutAIClientDeepSeek } from "../ai/client.deepseek";
import { createNutritionAIClientDeepSeek } from "../nutrition-ai/client.deepseek";
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
  const useDeepseek = config.llmProvider === "deepseek" && !!config.deepseekApiKey;
  const provider = useDeepseek ? "DeepSeek" : "Gemini";
  const configured = useDeepseek || !!config.geminiApiKey;

  if (!configured) {
    logger.warn("No LLM API key set (GEMINI_API_KEY / DEEPSEEK_API_KEY), AI features will throw on use");
  }

  const workoutClient = useDeepseek
    ? createWorkoutAIClientDeepSeek(config.deepseekApiKey)
    : createWorkoutAIClient(config.geminiApiKey, GEMINI_MODEL_WORKOUT);
  const nutritionClient = useDeepseek
    ? createNutritionAIClientDeepSeek(config.deepseekApiKey)
    : createNutritionAIClient(config.geminiApiKey, GEMINI_MODEL_NUTRITION);

  return {
    async parseWorkoutText(rawText: string): Promise<WorkoutData[]> {
      if (!configured) {
        throw new ExternalServiceError(provider, "No LLM API key is set");
      }
      try {
        return await workoutClient.parse(rawText);
      } catch (error) {
        logger.error("Failed to parse workout text", { error: String(error) });
        throw new ExternalServiceError(provider, String(error));
      }
    },
    async parseNutritionText(rawText: string): Promise<NutritionItem[]> {
      if (!configured) {
        throw new ExternalServiceError(provider, "No LLM API key is set");
      }
      try {
        return await nutritionClient.parse(rawText);
      } catch (error) {
        logger.error("Failed to parse nutrition text", { error: String(error) });
        throw new ExternalServiceError(provider, String(error));
      }
    },
  };
}
