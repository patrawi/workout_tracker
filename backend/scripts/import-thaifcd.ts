/**
 * Import the ThaiFCD CSV export into the local Nutrition Reference Catalog
 * (nutrition_references) — ADR 0002 "Import ThaiFCD as a local reference
 * snapshot", ADR 0011 (provider normalization), ADR 0014 (vector fallback).
 *
 * Usage (from backend/):
 *   bun run scripts/import-thaifcd.ts -- "<path-to-group_t_nutrition_complete.csv>" \
 *     [--version <label>] [--embed]
 *
 *   <csvPath>   required — path to the ThaiFCD export (never copy it into the repo)
 *   --version   snapshot version label (default "2026-09-13"); together with
 *               provider='thaifcd' and the original food_code it forms the
 *               unique key, so re-running the same command is idempotent.
 *   --embed     OPTIONAL. When passed AND GEMINI_API_KEY is set, embeds
 *               "name_th name_en" via the Gemini embeddings client (768-dim,
 *               batches of 100). Default OFF: rows are stored with a NULL
 *               embedding; the matcher works lexically and by food code and
 *               only falls back to pgvector (ADR 0014). Embeddings can be
 *               backfilled later — a re-run with --embed fills them in via
 *               COALESCE without disturbing macros.
 *
 * ————————————————————————————————————————————————————————————————————————————
 * COLUMN MAPPING DECISIONS (full rationale with observed-discrepancy evidence
 * lives in src/nutrition-estimation/thaifcd-import.ts):
 *  - Energy: "Energy, by calculation (kcal)" is authoritative; the duplicate
 *    "Total energy - by calculation (kcal)" column is used only as a fallback
 *    (the two are mutually exclusive in the export: 237 vs 74 rows). The
 *    primary agrees with P×4+C×4+F×9 (median deviation 1.62%, max 12.8%).
 *  - Carbs: "Carbohydrate, total (g)" preferred; falls back to
 *    "Carbohydrate, available (g)" when total is absent (238 rows). Total
 *    wins over available per the catalog rule.
 *  - `-`/empty cells: core macros (protein/carbs/fat/alcohol/calories) → 0,
 *    row still imported (per-100 g baseline; a missing macro must not
 *    fabricate a nonzero claim). Micronutrients → omitted keys in
 *    extra_nutrients jsonb.
 *  - Alcohol: the export has no alcohol column → 0 for all rows.
 *  - thai_name → name_th, english_name → name_en (trimmed; "" → null).
 * ————————————————————————————————————————————————————————————————————————————
 */
import "dotenv/config";
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { createNutritionReferenceImportRepository } from "../src/repositories/nutrition-reference-import.repository";
import {
  THAIFCD_DEFAULT_VERSION,
  THAIFCD_PROVIDER,
  parseThaifcdCsv,
  thaifcdEmbedText,
  type ThaifcdReferenceRow,
} from "../src/nutrition-estimation/thaifcd-import";
import { createEmbeddingClient } from "../src/embeddings/client";

/** Gemini embedding batch size (batchEmbedContents accepts up to 100 texts). */
const EMBED_BATCH_SIZE = 100;

function parseArgs(argv: string[]): { csvPath: string; version: string; embed: boolean } {
  let csvPath: string | undefined;
  let version = THAIFCD_DEFAULT_VERSION;
  let embed = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--version") {
      version = argv[++i] ?? "";
      if (!version) throw new Error("--version requires a value");
    } else if (arg === "--embed") {
      embed = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/import-thaifcd.ts -- <csvPath> [--version <label>] [--embed]");
      process.exit(0);
    } else if (!arg.startsWith("--")) {
      csvPath = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!csvPath) throw new Error("Missing <csvPath> argument");
  return { csvPath, version, embed };
}

/** Populate row.embedding in batches; returns how many rows got a vector. */
async function embedRows(rows: ThaifcdReferenceRow[], apiKey: string): Promise<number> {
  const client = createEmbeddingClient(apiKey);
  let embedded = 0;
  for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
    const chunk = rows.slice(i, i + EMBED_BATCH_SIZE);
    const texts = chunk.map(thaifcdEmbedText);
    try {
      const vectors = await client.embedBatch(texts);
      chunk.forEach((row, j) => {
        const vector = vectors[j];
        if (texts[j] && vector) {
          row.embedding = vector;
          embedded++;
        }
      });
      console.log(`  embedded ${Math.min(i + EMBED_BATCH_SIZE, rows.length)}/${rows.length}`);
    } catch (error) {
      console.error(
        `  ⚠ embedding batch failed at rows ${i}–${i + chunk.length - 1}; leaving those NULL ` +
          `(lexical + food-code matching still work; backfill later with --embed):`,
        error instanceof Error ? error.message : error,
      );
      break; // stop embedding, keep the import going
    }
  }
  return embedded;
}

const { csvPath, version, embed } = parseArgs(process.argv.slice(2));

const file = Bun.file(csvPath);
if (!(await file.exists())) {
  console.error(`❌ CSV file not found: ${csvPath}`);
  process.exit(1);
}
const text = await file.text();
const { rows, stats } = parseThaifcdCsv(text, version);

console.log(`Parsed ${stats.totalRows} rows (skipped ${stats.skippedRows} rows without a food_code).`);
console.log(
  `  energy fallback column used for ${stats.fallbackEnergyRows} rows; ` +
    `carbs "available" fallback used for ${stats.fallbackCarbsRows} rows.`,
);
console.log(
  `  missing (→ 0): protein=${stats.missingMacros.protein} carbs=${stats.missingMacros.carbs} ` +
    `fat=${stats.missingMacros.fat} calories=${stats.missingMacros.calories}; ` +
    `name_en null on ${stats.missingNameEn} rows, name_th null on ${stats.missingNameTh} rows; ` +
    `${stats.rowsWithExtras} rows carry extra_nutrients.`,
);

let embeddedCount = 0;
if (embed) {
  if (config.geminiApiKey && !config.geminiApiKey.startsWith("<")) {
    console.log(`Embedding "name_th name_en" for ${rows.length} rows (batches of ${EMBED_BATCH_SIZE})…`);
    embeddedCount = await embedRows(rows, config.geminiApiKey);
    console.log(`Embedded ${embeddedCount}/${rows.length} rows.`);
  } else {
    console.warn(
      "⚠ --embed requested but GEMINI_API_KEY is not set; embeddings skipped and left NULL " +
        "for a backfill task (matcher still works lexically / by food code).",
    );
  }
}

const db = createDatabaseClient(config.databaseUrl);
const repo = createNutritionReferenceImportRepository(db);

console.log(`Upserting ${rows.length} rows into nutrition_references (provider=${THAIFCD_PROVIDER}, version=${version})…`);
const processed = await repo.upsertThaifcdBatch(rows);
const total = await repo.countByProviderVersion(THAIFCD_PROVIDER, version);

console.log(`✅ Done. Upserted ${processed} rows; catalog now holds ${total} rows for ${THAIFCD_PROVIDER}@${version}${embeddedCount > 0 ? ` (${embeddedCount} with embeddings)` : ""}.`);
process.exit(0);
