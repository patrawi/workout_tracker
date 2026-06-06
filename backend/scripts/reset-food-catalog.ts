/**
 * ONE-TIME reset of the sheet-sourced food catalog.
 *
 * Why: the catalog id scheme changed (`slug-N` → `sheet-row-N`) and the embedded
 * doc shape changed (macros dropped). Old rows would orphan + duplicate and their
 * embeddings are stale. This wipes the google_sheet rows and re-syncs from scratch
 * with the new ids, hashes, and clean embeddings.
 *
 * Run ONCE, AFTER the Gemini embedding RPM/RPD has reset (free tier resets daily):
 *   cd backend && bun run scripts/reset-food-catalog.ts
 *
 * ~100 rows embed in a single batch request (1 RPM), so it won't hit the limit.
 * Re-running is safe but pointless — normal `POST /food-catalog/sync` handles
 * edits incrementally from then on.
 */
import { eq } from "drizzle-orm";
import { ConfigService } from "../src/services/config.service";
import { createDatabaseClient } from "../src/db/client";
import { createFoodCatalogRepository } from "../src/repositories/food-catalog.repository";
import { createFoodCatalogService } from "../src/services/food-catalog.service";
import { createEmbeddingClient } from "../src/embeddings/client";
import { syncCatalogFromSheet } from "../src/food-catalog/sync";
import { foodCatalog } from "../src/schema";

const config = ConfigService.fromEnv();

if (!config.geminiApiKey || config.geminiApiKey.startsWith("<")) {
  console.error("❌ GEMINI_API_KEY is not set (or is a placeholder). Add a real key to backend/.env first.");
  process.exit(1);
}
if (!config.googleSheetsId || !config.googleCredentialsJson) {
  console.error("❌ GOOGLE_SHEETS_ID / GOOGLE_CREDENTIALS_JSON not set. Can't read the sheet.");
  process.exit(1);
}

const db = createDatabaseClient(config.databaseUrl);
const repo = createFoodCatalogRepository(db);
const service = createFoodCatalogService(repo, createEmbeddingClient(config.geminiApiKey));

console.log("Deleting old sheet-sourced rows (source='google_sheet')…");
await db.delete(foodCatalog).where(eq(foodCatalog.source, "google_sheet"));

console.log("Re-syncing from sheet with refresh=true (re-embeds every row)…");
const result = await syncCatalogFromSheet(
  service,
  { spreadsheetId: config.googleSheetsId, credentialsJson: config.googleCredentialsJson },
  true,
);

console.log(
  `✅ Done. added=${result.added} updated=${result.updated} skipped=${result.skipped} total=${result.total}`,
);
console.log(`Catalog now has ${await service.count()} foods.`);
process.exit(0);
