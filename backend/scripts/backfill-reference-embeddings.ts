/**
 * Backfill NULL embeddings in nutrition_references with Gemini
 * text-embedding-004 (768-dim) over the same "name_th name_en" text the
 * importers use (thaifcdEmbedText) — ADR 0014 vector fallback. Idempotent:
 * only rows with a NULL embedding are fetched and updated, so re-runs are
 * cheap no-ops. Requires GEMINI_API_KEY.
 *
 * Usage (from backend/):
 *   bun run scripts/backfill-reference-embeddings.ts
 */
import "dotenv/config";
import { eq, isNull } from "drizzle-orm";
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { nutritionReferences } from "../src/schema";
import { createEmbeddingClient } from "../src/embeddings/client";
import { thaifcdEmbedText } from "../src/nutrition-estimation/thaifcd-import";

/** Gemini batch cap (batchEmbedContents accepts up to 100 texts). */
const BATCH_SIZE = 100;

if (!config.geminiApiKey || config.geminiApiKey.startsWith("<")) {
  console.error("❌ GEMINI_API_KEY is not set; cannot backfill embeddings.");
  process.exit(1);
}

const db = createDatabaseClient(config.databaseUrl);
const client = createEmbeddingClient(config.geminiApiKey);

const rows = await db
  .select({ id: nutritionReferences.id, name_th: nutritionReferences.name_th, name_en: nutritionReferences.name_en })
  .from(nutritionReferences)
  .where(isNull(nutritionReferences.embedding));

console.log(`Backfilling embeddings for ${rows.length} rows (batches of ${BATCH_SIZE})…`);

let embedded = 0;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const chunk = rows.slice(i, i + BATCH_SIZE);
  const texts = chunk.map(thaifcdEmbedText);
  let vectors: number[][] | undefined;
  try {
    vectors = await client.embedBatch(texts);
  } catch (error) {
    console.error(
      `⚠ embedding batch failed at rows ${i}–${i + chunk.length - 1}; stopping (re-run to continue):`,
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
  for (let j = 0; j < chunk.length; j++) {
    const vector = vectors[j];
    if (!texts[j] || !vector) continue;
    await db
      .update(nutritionReferences)
      .set({ embedding: vector })
      .where(eq(nutritionReferences.id, chunk[j]!.id));
    embedded++;
  }
  console.log(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
}

console.log(`✅ Embedded ${embedded}/${rows.length} rows.`);
process.exit(0);
