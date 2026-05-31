import { GoogleAuth } from "google-auth-library";
import type { FoodCatalogRecord } from "../repositories/food-catalog.repository";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
// 10 columns: Date, Time, Product, ServingValue, ServingUnit, Calories, Protein, Carbs, Fat, RawOCR
const SHEET_RANGE = "A:J";

export interface SheetSourceConfig {
  spreadsheetId: string;
  credentialsJson: string;
}

/** A raw row read from the nutrition Sheet, with its 1-based sheet row number. */
export interface SheetFoodRow {
  rowNumber: number;
  product: string;
  servingValue: string;
  servingUnit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

function num(value: string | undefined, fallback = 0): number {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "food"
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read all food rows from the Google Sheet via the Sheets REST API,
 * authenticated with the bot's service-account credentials. Header rows
 * (those whose first cell isn't a YYYY-MM-DD date) are skipped.
 */
export async function readSheetFoodRows(
  cfg: SheetSourceConfig,
): Promise<SheetFoodRow[]> {
  if (!cfg.spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID is not set");
  }
  if (!cfg.credentialsJson) {
    throw new Error("GOOGLE_CREDENTIALS_JSON is not set");
  }

  const credentials = JSON.parse(cfg.credentialsJson);
  const auth = new GoogleAuth({ credentials, scopes: [SHEETS_SCOPE] });
  const token = await auth.getAccessToken();
  if (!token) {
    throw new Error("Failed to obtain Google access token");
  }

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${cfg.spreadsheetId}` +
    `/values/${encodeURIComponent(SHEET_RANGE)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  const values = data.values ?? [];

  const rows: SheetFoodRow[] = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i] ?? [];
    const rowNumber = i + 1; // sheet rows are 1-based
    // Skip header / non-data rows (first cell must be a date).
    if (!DATE_RE.test(String(row[0] ?? "").trim())) continue;
    const product = String(row[2] ?? "").trim();
    if (!product) continue;
    rows.push({
      rowNumber,
      product,
      servingValue: String(row[3] ?? ""),
      servingUnit: String(row[4] ?? ""),
      calories: String(row[5] ?? ""),
      protein: String(row[6] ?? ""),
      carbs: String(row[7] ?? ""),
      fat: String(row[8] ?? ""),
    });
  }
  return rows;
}

/** Map a Sheet row to a catalog record. `source_row_id` ties back to the sheet row. */
export function sheetRowToCatalogRecord(row: SheetFoodRow): FoodCatalogRecord {
  return {
    id: `${slugify(row.product)}-${row.rowNumber}`,
    name: row.product,
    brand: "",
    product_type: "",
    per_amount: num(row.servingValue, 100) || 100,
    per_unit: row.servingUnit.trim() || "g",
    calories: num(row.calories),
    protein: num(row.protein),
    carbs: num(row.carbs),
    fat: num(row.fat),
    source: "google_sheet",
    source_row_id: `row_${row.rowNumber}`,
  };
}
