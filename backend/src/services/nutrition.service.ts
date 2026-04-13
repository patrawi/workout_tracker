// src/services/nutrition.service.ts

import type { NutritionItem, NutritionRow } from "../types";
import type { AIService } from "./ai.service";
import { ValidationError } from "../lib/errors";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("nutrition-service");

export interface NutritionService {
  parse(rawText: string): Promise<NutritionItem[]>;
  log(items: NutritionItem[], date: string): Promise<NutritionRow[]>;
  getByDate(date: string): Promise<NutritionRow[]>;
  getDates(): Promise<string[]>;
  update(id: number, updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "calories">>): Promise<NutritionRow | null>;
  deleteItem(id: number): Promise<void>;
  deleteByDate(date: string): Promise<void>;
}

export function createNutritionService(
  repo: ReturnType<typeof import("../repositories/nutrition.repository").createNutritionRepository>,
  aiService: AIService
): NutritionService {
  return {
    async parse(rawText: string): Promise<NutritionItem[]> {
      if (!rawText || rawText.trim().length === 0) {
        throw new ValidationError("raw_text cannot be empty");
      }
      return aiService.parseNutritionText(rawText);
    },

    async log(items: NutritionItem[], date: string): Promise<NutritionRow[]> {
      if (!items || items.length === 0) {
        throw new ValidationError("No nutrition items to save");
      }
      logger.info("Logging nutrition", { date, itemCount: items.length });
      return repo.insertBatch(date, items);
    },

    async getByDate(date: string): Promise<NutritionRow[]> {
      return repo.getByDate(date);
    },

    async getDates(): Promise<string[]> {
      return repo.getDates();
    },

    async update(id: number, updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "calories">>): Promise<NutritionRow | null> {
      return repo.update(id, updates);
    },

    async deleteItem(id: number): Promise<void> {
      return repo.deleteItem(id);
    },

    async deleteByDate(date: string): Promise<void> {
      return repo.deleteByDate(date);
    },
  };
}
