import { test, expect, describe, mock } from "bun:test";
import { groundNutritionItems } from "../../../src/food-catalog/grounding";
import type { NutritionItem } from "../../../src/types";

function item(overrides: Partial<NutritionItem>): NutritionItem {
  return {
    food_name: "food",
    meal: "Snack",
    protein: 0,
    carbs: 0,
    fat: 0,
    calories: 0,
    amount: 100,
    unit: "g",
    has_missing_macros: true,
    ...overrides,
  };
}

async function groundOne(it: NutritionItem, catalog: any): Promise<NutritionItem> {
  const [out] = await groundNutritionItems([it], catalog);
  if (!out) throw new Error("grounding returned no item");
  return out;
}

function catalogWith(results: any[]) {
  return {
    upsertFood: mock(async () => {}),
    upsertMany: mock(async () => {}),
    search: mock(async () => results),
    getExistingRowIds: mock(async () => new Set<string>()),
    count: mock(async () => results.length),
  } as any;
}

const EGG = {
  id: "lidl-egg-2",
  name: "Lidl Free Range Eggs",
  brand: "Lidl",
  product_type: "egg",
  per_amount: 100,
  per_unit: "g",
  calories: 130,
  protein: 12.6,
  carbs: 0,
  fat: 9,
  source: "google_sheet",
  source_row_id: "row_2",
};

describe("groundNutritionItems", () => {
  test("leaves items that already have macros untouched", async () => {
    const catalog = catalogWith([{ ...EGG, distance: 0.01 }]);
    const out = await groundOne(item({ has_missing_macros: false, protein: 5, carbs: 1, fat: 2 }), catalog);
    expect(out.protein).toBe(5);
    expect(catalog.search).not.toHaveBeenCalled();
  });

  test("fills + scales macros from a confident catalog match", async () => {
    const catalog = catalogWith([{ ...EGG, distance: 0.02 }]);
    // ate 200g of a per-100g food → ×2
    const out = await groundOne(item({ amount: 200 }), catalog);
    expect(out.has_missing_macros).toBe(false);
    expect(out.uncertain).toBe(false);
    expect(out.protein).toBeCloseTo(25.2, 1);
    expect(out.fat).toBeCloseTo(18, 1);
    expect(out.calories).toBeCloseTo(25.2 * 4 + 0 * 4 + 18 * 9, 0);
    expect(out.matched_food_name).toBe("Lidl Free Range Eggs");
  });

  test("flags uncertain when nearest match is beyond the distance threshold", async () => {
    const catalog = catalogWith([{ ...EGG, distance: 0.9 }]);
    const out = await groundOne(item({ food_name: "mystery" }), catalog);
    expect(out.uncertain).toBe(true);
    expect(out.has_missing_macros).toBe(true); // macros not invented
    expect(out.protein).toBe(0);
    expect(out.matched_food_name).toBe("Lidl Free Range Eggs"); // surfaced as a hint
  });

  test("flags uncertain when no candidates exist", async () => {
    const catalog = catalogWith([]);
    const out = await groundOne(item({}), catalog);
    expect(out.uncertain).toBe(true);
    expect(out.has_missing_macros).toBe(true);
  });

  test("flags uncertain on unit mismatch even within distance threshold", async () => {
    const catalog = catalogWith([{ ...EGG, distance: 0.02 }]);
    const out = await groundOne(item({ unit: "piece", amount: 1 }), catalog);
    expect(out.uncertain).toBe(true);
    expect(out.matched_food_name).toBe("Lidl Free Range Eggs");
  });
});
