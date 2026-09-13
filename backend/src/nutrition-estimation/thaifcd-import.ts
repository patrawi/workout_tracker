// ThaiFCD CSV → Nutrition Reference Catalog mapping (ADR 0002, 0011).
// Pure logic: an RFC-4180 CSV parser plus the ThaiFCD column-mapping rules.
// No env/db imports so it is unit-testable in isolation; the CLI lives in
// backend/scripts/import-thaifcd.ts and persistence in
// backend/src/repositories/nutrition-reference-import.repository.ts.
//
// ————————————————————————————————————————————————————————————————————————————
// COLUMN MAPPING DECISIONS (verified against the real export
// `group_t_nutrition_complete (1).csv`: 314 data rows, 39 columns, `-` is the
// missing-value marker; all numeric values are per-100 g):
//
// 1. ENERGY (kcal) — two kcal-labeled columns exist and are perfectly
//    mutually exclusive in the data (0 rows have both; 237 rows have only
//    "Energy, by calculation (kcal)", 74 rows only
//    "Total energy - by calculation (kcal)", 3 rows neither):
//      primary  = "Energy, by calculation (kcal)"
//      fallback = "Total energy - by calculation (kcal)"
//    Choice evidence: the primary column is consistent with the Atwater
//    check P×4 + C×4 + F×9 (median |deviation| 1.62%, p90 4.29%, max 12.8%
//    over the 237 rows where it is present — expected rounding for a
//    composite food table), so it is treated as the authoritative kcal value.
// 2. CARBOHYDRATE — two columns, also perfectly mutually exclusive
//    (238 rows only "Carbohydrate, available (g)", 73 rows only
//    "Carbohydrate, total (g)", 3 rows neither):
//      prefer   = "Carbohydrate, total (g)"  (authoritative per the ticket:
//                 total carbohydrate wins over the available/sugar-subset
//                 variants whenever present)
//      fallback = "Carbohydrate, available (g)"  (used only when total is
//                 missing — the majority in this export)
// 3. PROTEIN  = "Protein, total (g)";  FAT = "Fat, total (g)".
// 4. ALCOHOL — the ThaiFCD export has NO alcohol column; alcohol is 0 for
//    every row (do not fabricate a nonzero claim).
// 5. `-` (also empty string) = missing. Core macros (protein/carbs/fat/
//    alcohol/calories) → 0 with the row otherwise imported: the catalog
//    stores a per-100 g baseline, and a missing macro must not fabricate a
//    nonzero claim. Micronutrients → omitted keys in `extra_nutrients`.
// 6. NAMES — thai_name → name_th, english_name → name_en; trimmed; empty
//    string → null.
// 7. MICRONUTRIENTS → `extra_nutrients` jsonb with snake_case unit-suffixed
//    keys (see EXTRA_NUTRIENT_COLUMNS below). `-`/missing values are omitted
//    keys; when nothing is present extra_nutrients is null.
// ————————————————————————————————————————————————————————————————————————————

/** Provider id written to nutrition_references.provider (ADR 0011). */
export const THAIFCD_PROVIDER = "thaifcd";
/** Default snapshot version label for this import run. */
export const THAIFCD_DEFAULT_VERSION = "2026-09-13";

/** Exact ThaiFCD export header names for the core macro columns. */
export const THAIFCD_COLUMNS = {
  foodCode: "food_code",
  thaiName: "thai_name",
  englishName: "english_name",
  energyKcalPrimary: "Energy, by calculation (kcal)",
  energyKcalFallback: "Total energy - by calculation (kcal)",
  protein: "Protein, total (g)",
  carbsPreferred: "Carbohydrate, total (g)",
  carbsFallback: "Carbohydrate, available (g)",
  fat: "Fat, total (g)",
  /** Not present in the current export — tolerated absent, maps to 0. */
  alcohol: "Alcohol (g)",
} as const;

/** Extra (non-core) numeric columns → `extra_nutrients` jsonb keys. */
export const EXTRA_NUTRIENT_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["Ash (g)", "ash_g"],
  ["Calcium (mg)", "calcium_mg"],
  ["Cholesterol (mg)", "cholesterol_mg"],
  ["Copper (mg)", "copper_mg"],
  ["Density (g/mL)", "density_g_ml"],
  ["Dietary fibre (g)", "dietary_fibre_g"],
  ["Edible portion (%)", "edible_portion_pct"],
  ["Fatty acids, total monounsaturated (g)", "fatty_acids_mono_g"],
  ["Fatty acids, total omega-3 polyunsaturated (g)", "fatty_acids_omega3_g"],
  ["Fatty acids, total omega-6 polyunsaturated (g)", "fatty_acids_omega6_g"],
  ["Fatty acids, total polyunsaturated (g)", "fatty_acids_poly_g"],
  ["Fatty acids, total saturated (g)", "fatty_acids_sat_g"],
  ["Iron (mg)", "iron_mg"],
  ["Magnesium (mg)", "magnesium_mg"],
  ["Moisture (g)", "moisture_g"],
  ["Niacin (mg)", "niacin_mg"],
  ["Phosphorus (mg)", "phosphorus_mg"],
  ["Potassium (mg)", "potassium_mg"],
  ["Retinol (mcg)", "retinol_mcg"],
  ["Riboflavin (mg)", "riboflavin_mg"],
  ["Sodium (mg)", "sodium_mg"],
  ["Sugars, total (g)", "sugars_total_g"],
  ["Thiamin (mg)", "thiamin_mg"],
  ["Vitamin A; retinol activity equivalent (mcg)", "vitamin_a_rae_mcg"],
  ["Vitamin C (mg)", "vitamin_c_mg"],
  ["Zinc (mg)", "zinc_mg"],
  ["b-carotene (mcg)", "beta_carotene_mcg"],
];

/** A ThaiFCD CSV row mapped to a nutrition_references upsert row. */
export interface ThaifcdReferenceRow {
  provider: string;
  provider_food_code: string;
  version: string;
  name_en: string | null;
  name_th: string | null;
  protein: number;
  carbs: number;
  fat: number;
  alcohol: number;
  calories: number;
  extra_nutrients: Record<string, number> | null;
  /** Populated only via the optional `--embed` pass; null by default. */
  embedding: number[] | null;
}

/** Import-run statistics reported by the script. */
export interface ThaifcdImportStats {
  totalRows: number;
  /** Rows where the primary kcal column was missing and the fallback used. */
  fallbackEnergyRows: number;
  /** Rows where "Carbohydrate, total" was missing and "available" used. */
  fallbackCarbsRows: number;
  /** Rows imported with a missing (→ 0) core macro, by macro. */
  missingMacros: { protein: number; carbs: number; fat: number; calories: number };
  /** Rows where name_en / name_th was absent (→ null). */
  missingNameEn: number;
  missingNameTh: number;
  /** Rows with at least one micronutrient key present. */
  rowsWithExtras: number;
  /** Rows skipped entirely (no food_code after trimming). */
  skippedRows: number;
}

/**
 * RFC-4180 CSV parser: quoted fields, `""` escapes, commas/newlines inside
 * quotes, CRLF, and a UTF-8 BOM. Blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/**
 * ThaiFCD missing-value marker: `-` (per the export) or an empty cell.
 * Any other non-numeric cell is treated as missing too (defensive — the
 * export has none today).
 */
export function parseThaifcdNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function mapName(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Map one ThaiFCD CSV record (header → value) to a catalog upsert row.
 * `record` keys are the exact export header names (see THAIFCD_COLUMNS).
 */
export function mapThaifcdRecord(
  record: Record<string, string>,
  version: string = THAIFCD_DEFAULT_VERSION,
): { row: ThaifcdReferenceRow | null; stats: ThaifcdMappingFlags } {
  const foodCode = (record[THAIFCD_COLUMNS.foodCode] ?? "").trim();
  if (!foodCode) {
    return {
      row: null,
      stats: {
        skipped: true,
        usedFallbackEnergy: false,
        usedFallbackCarbs: false,
        missingProtein: false,
        missingCarbs: false,
        missingCalories: false,
        missingFat: false,
        missingNameEn: false,
        missingNameTh: false,
        hasExtras: false,
      },
    };
  }

  // Energy: primary kcal column, fall back to the alternate kcal column.
  const energyPrimary = parseThaifcdNumber(record[THAIFCD_COLUMNS.energyKcalPrimary] ?? "");
  const energyFallback = parseThaifcdNumber(record[THAIFCD_COLUMNS.energyKcalFallback] ?? "");
  const calories = energyPrimary ?? energyFallback ?? 0;

  // Carbs: prefer total; fall back to available (they never co-occur here).
  const carbsTotal = parseThaifcdNumber(record[THAIFCD_COLUMNS.carbsPreferred] ?? "");
  const carbsAvailable = parseThaifcdNumber(record[THAIFCD_COLUMNS.carbsFallback] ?? "");
  const carbs = carbsTotal ?? carbsAvailable ?? 0;

  const missingCarbs = carbsTotal === null && carbsAvailable === null;
  const missingCalories = energyPrimary === null && energyFallback === null;

  // Missing core macros → 0 (per-100 g baseline; never fabricate a claim).
  const protein = parseThaifcdNumber(record[THAIFCD_COLUMNS.protein] ?? "") ?? 0;
  const fat = parseThaifcdNumber(record[THAIFCD_COLUMNS.fat] ?? "") ?? 0;
  const alcohol = parseThaifcdNumber(record[THAIFCD_COLUMNS.alcohol] ?? "") ?? 0;

  const extra_nutrients: Record<string, number> = {};
  for (const [column, key] of EXTRA_NUTRIENT_COLUMNS) {
    const value = parseThaifcdNumber(record[column] ?? "");
    if (value !== null) extra_nutrients[key] = value;
  }

  return {
    row: {
      provider: THAIFCD_PROVIDER,
      provider_food_code: foodCode,
      version,
      name_en: mapName(record[THAIFCD_COLUMNS.englishName] ?? ""),
      name_th: mapName(record[THAIFCD_COLUMNS.thaiName] ?? ""),
      protein,
      carbs,
      fat,
      alcohol,
      calories,
      extra_nutrients: Object.keys(extra_nutrients).length > 0 ? extra_nutrients : null,
      embedding: null,
    },
    stats: {
      skipped: false,
      usedFallbackEnergy: energyPrimary === null && energyFallback !== null,
      usedFallbackCarbs: carbsTotal === null && carbsAvailable !== null,
      missingProtein: parseThaifcdNumber(record[THAIFCD_COLUMNS.protein] ?? "") === null,
      missingCarbs,
      missingCalories,
      missingFat: parseThaifcdNumber(record[THAIFCD_COLUMNS.fat] ?? "") === null,
      missingNameEn: mapName(record[THAIFCD_COLUMNS.englishName] ?? "") === null,
      missingNameTh: mapName(record[THAIFCD_COLUMNS.thaiName] ?? "") === null,
      hasExtras: Object.keys(extra_nutrients).length > 0,
    },
  };
}

/** Per-row flags rolled up into {@link ThaifcdImportStats}. */
export interface ThaifcdMappingFlags {
  skipped: boolean;
  usedFallbackEnergy: boolean;
  usedFallbackCarbs: boolean;
  missingProtein: boolean;
  missingCarbs: boolean;
  missingCalories: boolean;
  missingFat: boolean;
  missingNameEn: boolean;
  missingNameTh: boolean;
  hasExtras: boolean;
}

/**
 * Parse a full ThaiFCD CSV export (header + data rows) into catalog rows.
 * Throws when required columns are missing so a schema drift fails loudly.
 */
export function parseThaifcdCsv(
  text: string,
  version: string = THAIFCD_DEFAULT_VERSION,
): { rows: ThaifcdReferenceRow[]; stats: ThaifcdImportStats } {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error("CSV file is empty");
  const header = table[0]!;
  const required: string[] = [
    THAIFCD_COLUMNS.foodCode,
    THAIFCD_COLUMNS.thaiName,
    THAIFCD_COLUMNS.englishName,
    THAIFCD_COLUMNS.protein,
    THAIFCD_COLUMNS.fat,
    THAIFCD_COLUMNS.energyKcalPrimary,
    THAIFCD_COLUMNS.energyKcalFallback,
    THAIFCD_COLUMNS.carbsPreferred,
    THAIFCD_COLUMNS.carbsFallback,
  ];
  const missing = required.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    throw new Error(`CSV header is missing expected ThaiFCD columns: ${missing.join("; ")}`);
  }

  const records: Record<string, string>[] = table.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((name, i) => {
      record[name] = cells[i] ?? "";
    });
    return record;
  });

  const rows: ThaifcdReferenceRow[] = [];
  const stats: ThaifcdImportStats = {
    totalRows: 0,
    fallbackEnergyRows: 0,
    fallbackCarbsRows: 0,
    missingMacros: { protein: 0, carbs: 0, fat: 0, calories: 0 },
    missingNameEn: 0,
    missingNameTh: 0,
    rowsWithExtras: 0,
    skippedRows: 0,
  };

  for (const record of records) {
    const { row, stats: flags } = mapThaifcdRecord(record, version);
    if (!row || flags.skipped) {
      stats.skippedRows++;
      continue;
    }
    rows.push(row);
    stats.totalRows++;
    if (flags.usedFallbackEnergy) stats.fallbackEnergyRows++;
    if (flags.usedFallbackCarbs) stats.fallbackCarbsRows++;
    if (flags.missingProtein) stats.missingMacros.protein++;
    if (flags.missingCarbs) stats.missingMacros.carbs++;
    if (flags.missingFat) stats.missingMacros.fat++;
    if (flags.missingCalories) stats.missingMacros.calories++;
    if (flags.missingNameEn) stats.missingNameEn++;
    if (flags.missingNameTh) stats.missingNameTh++;
    if (flags.hasExtras) stats.rowsWithExtras++;
  }

  return { rows, stats };
}

/** The text embedded for the vector fallback (ADR 0014): "name_th name_en". */
export function thaifcdEmbedText(row: { name_en: string | null; name_th: string | null }): string {
  return [row.name_th, row.name_en].filter((n): n is string => n !== null && n !== "").join(" ").trim();
}
