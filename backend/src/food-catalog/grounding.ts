import { CATALOG_TOPK, CATALOG_UNCERTAIN_DISTANCE } from "../constants";
import { roundTo1 } from "../nutrition-ai/normalizers";
import type { NutritionItem } from "../types";
import type { FoodCatalogService } from "../services/food-catalog.service";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("nutrition-grounding");

function caloriesFrom(protein: number, carbs: number, fat: number): number {
  return roundTo1(protein * 4 + carbs * 4 + fat * 9);
}

/**
 * Fill in macros for items the LLM couldn't extract, using the embedded food
 * catalog. For each missing-macro item we vector-search the catalog and, if the
 * nearest match is within the distance threshold, scale its per-amount macros by
 * how much was eaten. Items without a confident match are flagged `uncertain`
 * for manual review. Items that already had macros are left untouched.
 *
 * Never invents numbers: macros only ever come from a matched catalog row.
 */
export async function groundNutritionItems(
  items: NutritionItem[],
  foodCatalogService: FoodCatalogService,
): Promise<NutritionItem[]> {
  return Promise.all(
    items.map(async (item) => {
      // Respect macros the user already provided in the text.
      if (!item.has_missing_macros) return item;

      let candidates;
      try {
        candidates = await foodCatalogService.search(item.food_name, CATALOG_TOPK);
      } catch (error) {
        logger.warn("Catalog search failed; leaving item unmatched", {
          food: item.food_name,
          error: String(error),
        });
        return { ...item, uncertain: true };
      }

      const best = candidates[0];

      // Calibration log: real distances per item so the threshold can be tuned
      // from observed values. Remove once CATALOG_UNCERTAIN_DISTANCE is dialed in.
      logger.info("catalog match", {
        query: item.food_name,
        best: best ? best.name : null,
        distance: best ? Number(best.distance.toFixed(4)) : null,
        threshold: CATALOG_UNCERTAIN_DISTANCE,
        verdict:
          !best || best.distance > CATALOG_UNCERTAIN_DISTANCE ? "uncertain" : "matched",
        runnersUp: candidates.slice(1).map((c) => ({
          name: c.name,
          distance: Number(c.distance.toFixed(4)),
        })),
      });

      if (!best || best.distance > CATALOG_UNCERTAIN_DISTANCE) {
        // No confident match — surface the nearest name as a hint, flag for review.
        return {
          ...item,
          uncertain: true,
          ...(best ? { matched_food_name: best.name, matched_food_id: best.id } : {}),
        };
      }

      const scale = best.per_amount > 0 ? item.amount / best.per_amount : 1;
      const protein = roundTo1(best.protein * scale);
      const carbs = roundTo1(best.carbs * scale);
      const fat = roundTo1(best.fat * scale);

      // Units that don't line up (ate "1 piece" but catalog is per-gram) still
      // get a best-effort scale, but are flagged so the user verifies.
      const unitMismatch =
        item.unit.trim().toLowerCase() !== best.per_unit.trim().toLowerCase();

      return {
        ...item,
        protein,
        carbs,
        fat,
        calories: caloriesFrom(protein, carbs, fat),
        has_missing_macros: false,
        matched_food_name: best.name,
        matched_food_id: best.id,
        uncertain: unitMismatch,
      };
    }),
  );
}
