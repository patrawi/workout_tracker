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

  test("id is keyed on row number only (stable across name edits)", () => {
    expect(sheetRowToCatalogRecord(row({ rowNumber: 42 })).id).toBe("sheet-row-42");
    // editing the product name keeps the same id → update in place, no duplicate
    const a = sheetRowToCatalogRecord(row({ rowNumber: 42, product: "Chicken" }));
    const b = sheetRowToCatalogRecord(row({ rowNumber: 42, product: "Chiken (typo fixed)" }));
    expect(a.id).toBe(b.id);
  });

  test("doc_hash changes with name, not with macros", () => {
    const base = sheetRowToCatalogRecord(row({}));
    const macroEdit = sheetRowToCatalogRecord(row({ calories: "999" }));
    const nameEdit = sheetRowToCatalogRecord(row({ product: "Different food" }));
    expect(macroEdit.doc_hash).toBe(base.doc_hash); // macro change → same embedded text
    expect(nameEdit.doc_hash).not.toBe(base.doc_hash);
  });

  test("macro_hash changes with macros, not with name", () => {
    const base = sheetRowToCatalogRecord(row({}));
    const macroEdit = sheetRowToCatalogRecord(row({ calories: "999" }));
    const nameEdit = sheetRowToCatalogRecord(row({ product: "Different food" }));
    expect(macroEdit.macro_hash).not.toBe(base.macro_hash);
    expect(nameEdit.macro_hash).toBe(base.macro_hash);
  });
});
