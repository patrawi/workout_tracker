/**
 * Import BaoWio/more_selected_ingredients_nutrition (Hugging Face, 142 rows,
 * CC BY-SA 4.0) into the Nutrition Reference Catalog.
 *
 * Two mapping decisions worth recording:
 *  1. The values are PER GRAM, not per 100 g — proven by the magnitudes
 *     (vegetable oil fat = 1.0 g/g and energy 8.888 kcal/g → 888.8 kcal/100 g;
 *     white sugar 0.998 g/g at 3.87 kcal/g; garlic 1.49 kcal/g → 149/100 g,
 *     matching the standard value). Everything is scaled ×100 (rounded to
 *     0.01) onto the catalog's per-100 g baseline.
 *  2. Provenance is UNSTATED (empty README) — the Thai ingredient set looks
 *     ThaiFCD-derived but is unverifiable, so the provider is "baowio"
 *     (ADR 0011 honesty), NOT thaifcd. Names are Thai-only, short colloquial
 *     ingredient names — exactly the shape VLM component rows produce.
 * Synthetic food codes bw-<index> are stable per file order, making re-runs
 * idempotent. Keep the CSV out of the repo.
 *
 * Usage (from backend/):
 *   curl -sL "https://huggingface.co/datasets/BaoWio/more_selected_ingredients_nutrition/resolve/main/<file>.csv" -o /tmp/baowio_ingredients.csv
 *   bun run scripts/import-baowio-ingredients.ts -- /tmp/baowio_ingredients.csv
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { createNutritionReferenceImportRepository } from "../src/repositories/nutrition-reference-import.repository";
import { parseCsv } from "../src/nutrition-estimation/thaifcd-import";

const PROVIDER = "baowio";
const VERSION = "2024-07";

const EXPECTED_HEADER = [
  "Ingredients",
  "Sugars (g)",
  "Protein (g)",
  "Fat (g)",
  "Energy (kcal)",
  "Carbohydrate (g)",
  "Fibre (g)",
];

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: bun run scripts/import-baowio-ingredients.ts -- <ingredients.csv>");
  process.exit(1);
}
const file = Bun.file(csvPath);
if (!(await file.exists())) {
  console.error(`❌ CSV file not found: ${csvPath}`);
  process.exit(1);
}

const table = parseCsv(await file.text());
if (table.length === 0) throw new Error("CSV file is empty");
const header = table[0]!;
for (const expected of EXPECTED_HEADER) {
  if (!header.includes(expected)) {
    throw new Error(`CSV header is missing expected column: "${expected}" (got: ${header.join("; ")})`);
  }
}
const col = (name: string) => header.indexOf(name);

function per100(cells: string[], index: number): number {
  const raw = Number((cells[index] ?? "").trim());
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * 100 * 100) / 100;
}

const rows = table
  .slice(1)
  .map((cells, i) => {
    const name = (cells[col("Ingredients")] ?? "").trim();
    if (!name) return null;
    const extras: Record<string, number> = {};
    const sugars = per100(cells, col("Sugars (g)"));
    const fibre = per100(cells, col("Fibre (g)"));
    if (sugars > 0) extras.sugars_total_g = sugars;
    if (fibre > 0) extras.dietary_fibre_g = fibre;
    return {
      provider: PROVIDER,
      provider_food_code: `bw-${String(i + 1).padStart(3, "0")}`,
      version: VERSION,
      name_en: null,
      name_th: name,
      protein: per100(cells, col("Protein (g)")),
      carbs: per100(cells, col("Carbohydrate (g)")),
      fat: per100(cells, col("Fat (g)")),
      alcohol: 0,
      calories: per100(cells, col("Energy (kcal)")),
      extra_nutrients: Object.keys(extras).length > 0 ? extras : null,
      embedding: null,
    };
  })
  .filter((row): row is NonNullable<typeof row> => row !== null);

const zeroEnergy = rows.filter((r) => r.calories === 0).length;
console.log(
  `Parsed ${rows.length} ingredient rows (skipped ${table.length - 1 - rows.length} without a name; ` +
    `${zeroEnergy} rows carry 0 kcal).`,
);

const db = createDatabaseClient(config.databaseUrl);
const repo = createNutritionReferenceImportRepository(db);
const processed = await repo.upsertThaifcdBatch(rows);

// Dedupe by exact Thai name against other providers: two rows with the same
// name score identically in the lexical matcher, turning auto-matches into
// ambiguous ties. thaifcd (official provenance) wins over baowio (unverified).
const [overlap] = await db.execute<{ count: number }>(
  sql`SELECT count(*)::int AS count FROM nutrition_references
      WHERE provider = ${PROVIDER} AND version = ${VERSION}
      AND lower(trim(name_th)) IN (
        SELECT lower(trim(name_th)) FROM nutrition_references
        WHERE provider <> ${PROVIDER}
      )`,
);
await db.execute(
  sql`DELETE FROM nutrition_references
      WHERE provider = ${PROVIDER} AND version = ${VERSION}
      AND lower(trim(name_th)) IN (
        SELECT lower(trim(name_th)) FROM nutrition_references
        WHERE provider <> ${PROVIDER}
      )`,
);

const total = await repo.countByProviderVersion(PROVIDER, VERSION);
console.log(
  `✅ Upserted ${processed} rows; dropped ${overlap?.count ?? 0} rows whose Thai name already exists in another ` +
    `provider; catalog now holds ${total} rows for ${PROVIDER}@${VERSION}.`,
);
process.exit(0);
