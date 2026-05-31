import { test, expect, describe } from "bun:test";
import { sheetRowToCatalogRecord, type SheetFoodRow } from "../../../src/food-catalog/sheet-source";

function row(overrides: Partial<SheetFoodRow>): SheetFoodRow {
  return {
    rowNumber: 12,
    product: "Heck Chicken Chipolatas",
    servingValue: "100",
    servingUnit: "g",
    calories: "200",
    protein: "11",
    carbs: "2",
    fat: "15",
    ...overrides,
  };
}

describe("sheetRowToCatalogRecord", () => {
  test("parses macro cells that carry units (e.g. '11g')", () => {
    const rec = sheetRowToCatalogRecord(
      row({ protein: "11g", carbs: "2.5 g", fat: "15g", calories: "200 kcal" }),
    );
    expect(rec.protein).toBe(11);
    expect(rec.carbs).toBe(2.5);
    expect(rec.fat).toBe(15);
    expect(rec.calories).toBe(200);
  });

  test("parses serving value with unit suffix ('100g')", () => {
    const rec = sheetRowToCatalogRecord(row({ servingValue: "100g" }));
    expect(rec.per_amount).toBe(100);
  });

  test("falls back to 0 for non-numeric macro cells ('trace')", () => {
    const rec = sheetRowToCatalogRecord(row({ fat: "trace" }));
    expect(rec.fat).toBe(0);
  });
});
