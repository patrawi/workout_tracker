// src/services/nutrition.service.ts

import type { NutritionItem, NutritionRow } from "../types";
import type { AIService } from "./ai.service";
import type { FoodCatalogService } from "./food-catalog.service";
import { groundNutritionItems } from "../food-catalog/grounding";
import { ValidationError } from "../lib/errors";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("nutrition-service");

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export interface NutritionService {
  parse(rawText: string): Promise<NutritionItem[]>;
  log(items: NutritionItem[], date: string, userId?: number): Promise<NutritionRow[]>;
  getByDate(date: string, userId?: number): Promise<NutritionRow[]>;
  getDates(userId?: number): Promise<string[]>;
  update(id: number, updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "alcohol" | "calories">>, userId?: number): Promise<NutritionRow | null>;
  deleteItem(id: number, userId?: number): Promise<void>;
  deleteByDate(date: string, userId?: number): Promise<void>;
}

export function createNutritionService(
  repo: ReturnType<typeof import("../repositories/nutrition.repository").createNutritionRepository>,
  aiService: AIService,
  foodCatalogService: FoodCatalogService,
): NutritionService {
  return {
    async parse(rawText: string): Promise<NutritionItem[]> {
      if (!rawText || rawText.trim().length === 0) {
        throw new ValidationError("raw_text cannot be empty");
      }
      const items = await aiService.parseNutritionText(rawText);

      // Ground missing macros against the embedded food catalog. Best-effort:
      // if the catalog is empty or grounding fails, fall back to the raw parse.
      const needsGrounding = items.some((i) => i.has_missing_macros);
      if (!needsGrounding) return items;
      try {
        const catalogSize = await foodCatalogService.count();
        if (catalogSize === 0) return items;
        return await groundNutritionItems(items, foodCatalogService);
      } catch (error) {
        logger.warn("Catalog grounding failed; returning raw parse", {
          error: String(error),
        });
        return items;
      }
    },

    async log(items: NutritionItem[], date: string, userId: number = DEFAULT_USER_ID): Promise<NutritionRow[]> {
      if (!items || items.length === 0) {
        throw new ValidationError("No nutrition items to save");
      }
      logger.info("Logging nutrition", { date, itemCount: items.length, userId });
      return repo.insertBatch(date, items, userId);
    },

    async getByDate(date: string, userId: number = DEFAULT_USER_ID): Promise<NutritionRow[]> {
      return repo.getByDate(date, userId);
    },

    async getDates(userId: number = DEFAULT_USER_ID): Promise<string[]> {
      return repo.getDates(userId);
    },

    async update(id: number, updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "alcohol" | "calories">>, userId: number = DEFAULT_USER_ID): Promise<NutritionRow | null> {
      return repo.update(id, updates, userId);
    },

    async deleteItem(id: number, userId: number = DEFAULT_USER_ID): Promise<void> {
      return repo.deleteItem(id, userId);
    },

    async deleteByDate(date: string, userId: number = DEFAULT_USER_ID): Promise<void> {
      return repo.deleteByDate(date, userId);
    },
  };
}
