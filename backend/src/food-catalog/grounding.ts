import { CATALOG_TOPK, CATALOG_UNCERTAIN_DISTANCE } from "../constants";
import { roundTo1 } from "../nutrition-ai/normalizers";
import type { NutritionItem } from "../types";
import type { FoodCatalogService } from "../services/food-catalog.service";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("nutrition-grounding");

function caloriesFrom(protein: number, carbs: number, fat: number): number {
  return roundTo1(protein * 4 + carbs * 4 + fat * 9);
}

// Metric mass/volume units → grams. Food density ≈ 1, so g and ml are
// treated as interchangeable. Anything not here (slice, can, serving, piece)
// is a discrete count whose gram weight is unknown.
const METRIC_TO_GRAMS: Record<string, number> = {
  g: 1, gram: 1, grams: 1, gm: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  ml: 1, milliliter: 1, millilitre: 1,
  l: 1000, liter: 1000, litre: 1000, litres: 1000,
  oz: 28.3495, lb: 453.592,
};

function metricGrams(amount: number, unit: string): number | null {
  const factor = METRIC_TO_GRAMS[unit.trim().toLowerCase()];
  return factor === undefined ? null : amount * factor;
}

// Split a food name into normalized tokens (latin + thai), dropping 1-char noise.
function nameTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().split(/[^a-z0-9฀-๿]+/).filter((t) => t.length >= 2),
  );
}

// Embeddings alone matched "Honey" → "onion" (close vectors, zero shared words).
// Require at least one shared name token so a confident match also makes lexical
// sense. Cross-language matches (Thai query vs English catalog) share no token and
// fall back to the uncertain flag for manual review.
function lexicalOverlap(query: string, match: string): boolean {
  const q = nameTokens(query);
  for (const t of nameTokens(match)) if (q.has(t)) return true;
  return false;
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
          !best ||
          best.distance > CATALOG_UNCERTAIN_DISTANCE ||
          !lexicalOverlap(item.food_name, best.name)
            ? "uncertain"
            : "matched",
        runnersUp: candidates.slice(1).map((c) => ({
          name: c.name,
          distance: Number(c.distance.toFixed(4)),
        })),
      });

      if (
        !best ||
        best.distance > CATALOG_UNCERTAIN_DISTANCE ||
        !lexicalOverlap(item.food_name, best.name)
      ) {
        // No confident match — surface the nearest name as a hint, flag for review.
        return {
          ...item,
          uncertain: true,
          ...(best ? { matched_food_name: best.name, matched_food_id: best.id } : {}),
        };
      }

      // Work out how much was eaten relative to the catalog's per-amount basis.
      const eatenG = metricGrams(item.amount, item.unit);
      const baseG = metricGrams(best.per_amount, best.per_unit);
      const sameUnit =
        item.unit.trim().toLowerCase() === best.per_unit.trim().toLowerCase();

      let scale: number;
      let unitMismatch: boolean;
      if (eatenG !== null && baseG !== null && baseG > 0) {
        // Both metric (g/ml/kg/...). g≈ml, so this is exact — no flag.
        scale = eatenG / baseG;
        unitMismatch = false;
      } else if (sameUnit && best.per_amount > 0) {
        // Same discrete unit on both sides (e.g. logged "2 serving", catalog
        // per "1 serving") — also exact.
        scale = item.amount / best.per_amount;
        unitMismatch = false;
      } else {
        // Discrete unit vs metric basis (e.g. "1 slice"/"1 can" vs per-100g):
        // true grams unknown. Seed each unit as one catalog serving and flag so
        // the user can correct the amount.
        scale = item.amount;
        unitMismatch = true;
      }

      const protein = roundTo1(best.protein * scale);
      const carbs = roundTo1(best.carbs * scale);
      const fat = roundTo1(best.fat * scale);

      return {
        ...item,
        protein,
        carbs,
        fat,
        calories: caloriesFrom(protein, carbs, fat),
        has_missing_macros: false,
        matched_food_name: best.name,
        matched_food_id: best.id,
        uncertain: false,
        unit_mismatch: unitMismatch,
        catalog: {
          per_amount: best.per_amount,
          per_unit: best.per_unit,
          protein: best.protein,
          carbs: best.carbs,
          fat: best.fat,
        },
      };
    }),
  );
}
