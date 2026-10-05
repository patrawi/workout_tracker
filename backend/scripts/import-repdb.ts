/**
 * Import the RepDB free-tier exercise dataset into the Canonical Exercise
 * Catalog (ADR 0027). The source JSON is fetched/curl'd to a local file —
 * NEVER committed here: the repo is public and RepDB's license (Free Tier
 * v1.0, term 3) forbids redistributing the dataset or a derived one. In-app
 * attribution is owed regardless: "Exercise data by RepDB (repdb.co)".
 *
 * The dataset's schema_version becomes the snapshot version label, so a
 * newer export re-import coexists with the old rows (same keying rule as
 * nutrition_references). Manual rows (Machine Reverse Fly, Dumbbell Goblet
 * Squat) are upserted in the same run. The embed pass fills name_en-only
 * embeddings for every row still missing one (Gemini text-embedding-004).
 *
 * Usage (from backend/):
 *   curl -sL "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/exercises.json" -o /tmp/repdb-exercises.json
 *   bun run scripts/import-repdb.ts -- /tmp/repdb-exercises.json
 */
import "dotenv/config";
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { createExerciseCatalogRepository } from "../src/repositories/exercise-catalog.repository";
import {
  MANUAL_EXERCISES,
  parseRepdbDataset,
  repdbEmbedText,
} from "../src/exercises/repdb-import";
import { createEmbeddingClient } from "../src/embeddings/client";

/** Embed request batch size (bounded payload per call). */
const EMBED_CHUNK_SIZE = 100;

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: bun run scripts/import-repdb.ts -- <repdb-exercises.json>");
  process.exit(1);
}
const file = Bun.file(jsonPath);
if (!(await file.exists())) {
  console.error(`❌ JSON file not found: ${jsonPath}`);
  process.exit(1);
}

const { rows, stats } = parseRepdbDataset(await file.text());
const allRows = [...rows, ...MANUAL_EXERCISES];
console.log(
  `Parsed ${rows.length} RepDB rows (skipped ${stats.skippedRows}) + ${MANUAL_EXERCISES.length} manual rows.`,
);

const db = createDatabaseClient(config.databaseUrl);
const repo = createExerciseCatalogRepository(db);
const processed = await repo.upsertExerciseBatch(allRows);
const [repdbCount, manualCount] = [
  await repo.countByProvider("repdb"),
  await repo.countByProvider("manual"),
];

if (!config.geminiApiKey) {
  console.log(
    `⚠️  GEMINI_API_KEY not set — skipped the embed pass. ` +
      `Re-run after setting it to fill embeddings (vector tier needs them).`,
  );
  console.log(
    `✅ Upserted ${processed} rows; catalog now holds ${repdbCount} repdb + ${manualCount} manual rows.`,
  );
  process.exit(0);
}

const missing = await repo.listWithoutEmbedding();
console.log(`Embedding ${missing.length} rows without an embedding (name_en only, ADR 0027)…`);
const embedder = createEmbeddingClient(config.geminiApiKey);
let embedded = 0;
for (let i = 0; i < missing.length; i += EMBED_CHUNK_SIZE) {
  const chunk = missing.slice(i, i + EMBED_CHUNK_SIZE);
  const vectors = await embedder.embedBatch(chunk.map((r) => repdbEmbedText(r)));
  for (let j = 0; j < chunk.length; j++) {
    await repo.setEmbedding(chunk[j]!.id, vectors[j]!);
    embedded++;
  }
  console.log(`  embedded ${embedded}/${missing.length}`);
}

console.log(
  `✅ Upserted ${processed} rows and embedded ${embedded}; catalog now holds ` +
    `${repdbCount} repdb + ${manualCount} manual rows.`,
);
process.exit(0);
