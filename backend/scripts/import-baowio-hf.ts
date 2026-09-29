/**
 * Import the BaoWio/Thai_Nutrition_Dataset CSV (Hugging Face) into the
 * Nutrition Reference Catalog. The data is Thai Food Composition Tables 2015
 * (Institute of Nutrition, Mahidol University) redistributed under
 * CC BY-SA 4.0 — the in-app acknowledgement is owed regardless:
 * "Judprasong et al., INMU, Thai Food Composition Tables 2015".
 *
 * The HF export carries slimmer headers than the full ThaiFCD export, so each
 * header is remapped onto the canonical THAIFCD_COLUMNS names and the rows go
 * through the shared mapThaifcdRecord parser (same missing→0 policy —
 * ADR 0002/0011). Scientific_name is dropped (no canonical column).
 * Version label "2015" separates this snapshot from the group-T export
 * (version 2026-09-13); the unique key (provider, version, food_code) makes
 * re-runs idempotent. Keep the CSV out of the repo.
 *
 * Usage (from backend/):
 *   curl -sL "https://huggingface.co/datasets/BaoWio/Thai_Nutrition_Dataset/resolve/main/nutrition_dataset.csv" -o /tmp/nutrition_dataset.csv
 *   bun run scripts/import-baowio-hf.ts -- /tmp/nutrition_dataset.csv
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { createNutritionReferenceImportRepository } from "../src/repositories/nutrition-reference-import.repository";
import {
  THAIFCD_PROVIDER,
  THAIFCD_COLUMNS,
  parseCsv,
  mapThaifcdRecord,
  type ThaifcdReferenceRow,
} from "../src/nutrition-estimation/thaifcd-import";

/** Snapshot label for this source (Thai Food Composition Tables 2015). */
const BAOWIO_VERSION = "2015";

/** HF slim header → canonical ThaiFCD export header. */
const HF_COLUMN_MAP: ReadonlyArray<readonly [string, string]> = [
  ["Food_Code", THAIFCD_COLUMNS.foodCode],
  ["Thai_Name", THAIFCD_COLUMNS.thaiName],
  ["English_Name", THAIFCD_COLUMNS.englishName],
  ["Energy(kcal) by calculation", THAIFCD_COLUMNS.energyKcalPrimary],
  ["Protein(g)", THAIFCD_COLUMNS.protein],
  ["Fat(g)", THAIFCD_COLUMNS.fat],
  ["CHOCDF (g) Carbohydrate", THAIFCD_COLUMNS.carbsPreferred],
  ["SUGAR(g)", "Sugars, total (g)"],
  ["FIBTG (g) Dietary fibre", "Dietary fibre (g)"],
];

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: bun run scripts/import-baowio-hf.ts -- <nutrition_dataset.csv>");
  process.exit(1);
}
const file = Bun.file(csvPath);
if (!(await file.exists())) {
  console.error(`❌ CSV file not found: ${csvPath}`);
  process.exit(1);
}

const table = parseCsv(await file.text());
if (table.length === 0) throw new Error("CSV file is empty");
const hfHeader = table[0]!;
const unmapped = hfHeader.filter((name) => name !== "Scientific_name" && !HF_COLUMN_MAP.some(([hf]) => hf === name));
if (unmapped.length > 0) {
  throw new Error(`Unexpected HF columns (adapter drift): ${unmapped.join("; ")}`);
}

const rows: ThaifcdReferenceRow[] = [];
let skipped = 0;
let missingCalories = 0;
let missingCarbs = 0;
let withExtras = 0;

for (const cells of table.slice(1)) {
  const record: Record<string, string> = {};
  hfHeader.forEach((name, i) => {
    const mapped = HF_COLUMN_MAP.find(([hf]) => hf === name)?.[1];
    if (mapped) record[mapped] = cells[i] ?? "";
  });
  const { row, stats } = mapThaifcdRecord(record, BAOWIO_VERSION);
  if (!row || stats.skipped) {
    skipped++;
    continue;
  }
  rows.push(row);
  if (stats.missingCalories) missingCalories++;
  if (stats.missingCarbs) missingCarbs++;
  if (stats.hasExtras) withExtras++;
}

console.log(
  `Parsed ${rows.length} rows (skipped ${skipped}; missing calories → 0 on ${missingCalories}, ` +
    `missing carbs → 0 on ${missingCarbs}; ${withExtras} rows carry sugar/fibre extras).`,
);

const db = createDatabaseClient(config.databaseUrl);
const repo = createNutritionReferenceImportRepository(db);
const processed = await repo.upsertThaifcdBatch(rows);

// Dedupe across snapshot versions: a food_code present in an older AND newer
// snapshot scores identically in the lexical matcher, turning auto-matches
// into ambiguous ties. Keep the OTHER version's row (newer snapshots win —
// the group-T 2026-09-13 export is the more current extraction).
const [overlap] = await db.execute<{ count: number }>(
  sql`SELECT count(*)::int AS count FROM nutrition_references
      WHERE provider = ${THAIFCD_PROVIDER} AND version = ${BAOWIO_VERSION}
      AND provider_food_code IN (
        SELECT provider_food_code FROM nutrition_references
        WHERE provider = ${THAIFCD_PROVIDER} AND version <> ${BAOWIO_VERSION}
      )`,
);
await db.execute(
  sql`DELETE FROM nutrition_references
      WHERE provider = ${THAIFCD_PROVIDER} AND version = ${BAOWIO_VERSION}
      AND provider_food_code IN (
        SELECT provider_food_code FROM nutrition_references
        WHERE provider = ${THAIFCD_PROVIDER} AND version <> ${BAOWIO_VERSION}
      )`,
);

const total = await repo.countByProviderVersion(THAIFCD_PROVIDER, BAOWIO_VERSION);
console.log(
  `✅ Upserted ${processed} rows; dropped ${overlap?.count ?? 0} rows whose food_code already exists in another ` +
    `snapshot; catalog now holds ${total} rows for ${THAIFCD_PROVIDER}@${BAOWIO_VERSION}.`,
);
process.exit(0);
