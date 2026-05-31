/**
 * Seed a handful of real foods into the food_catalog (with embeddings) so the
 * RAG nutrition parse can be tested locally WITHOUT the Google Sheet.
 *
 * Requires a valid GEMINI_API_KEY in backend/.env (free tier is fine).
 * Run from the backend dir:  bun run scripts/seed-food-catalog.ts
 * Cleanup later:             DELETE FROM food_catalog WHERE source = 'seed';
 */
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { createFoodCatalogRepository } from "../src/repositories/food-catalog.repository";
import { createFoodCatalogService } from "../src/services/food-catalog.service";
import { createEmbeddingClient } from "../src/embeddings/client";
import type { FoodCatalogRecord } from "../src/repositories/food-catalog.repository";

// Real per-100g (or per-serving) macros. `per_amount`/`per_unit` define the basis;
// the parse scales these by how much you say you ate.
const FOODS: FoodCatalogRecord[] = [
  {
    id: "lidl-free-range-eggs",
    name: "Lidl Free Range Eggs",
    brand: "Lidl",
    product_type: "egg",
    per_amount: 100, per_unit: "g",
    calories: 131, protein: 12.6, carbs: 0, fat: 9.0,
    source: "seed", source_row_id: "seed_eggs",
  },
  {
    id: "hanamaruki-shiro-miso",
    name: "Hanamaruki Shiro Miso (White Soybean Paste)",
    brand: "Hanamaruki",
    product_type: "paste",
    per_amount: 100, per_unit: "g",
    calories: 188, protein: 11, carbs: 21, fat: 5.8,
    source: "seed", source_row_id: "seed_miso",
  },
  {
    id: "kikkoman-teriyaki-sauce",
    name: "Kikkoman Teriyaki Marinade Sauce",
    brand: "Kikkoman",
    product_type: "sauce",
    per_amount: 100, per_unit: "g",
    calories: 228, protein: 4.8, carbs: 44, fat: 2.6,
    source: "seed", source_row_id: "seed_teriyaki",
  },
  {
    id: "cooked-white-rice",
    name: "Cooked White Rice",
    brand: "",
    product_type: "grain",
    per_amount: 100, per_unit: "g",
    calories: 130, protein: 2.7, carbs: 28, fat: 0.3,
    source: "seed", source_row_id: "seed_rice",
  },
  {
    id: "cooked-chicken-breast",
    name: "Cooked Chicken Breast",
    brand: "",
    product_type: "meat",
    per_amount: 100, per_unit: "g",
    calories: 165, protein: 31, carbs: 0, fat: 3.6,
    source: "seed", source_row_id: "seed_chicken",
  },
];

if (!config.geminiApiKey || config.geminiApiKey.startsWith("<")) {
  console.error("❌ GEMINI_API_KEY is not set (or is a placeholder). Add a real key to backend/.env first.");
  process.exit(1);
}

const db = createDatabaseClient(config.databaseUrl);
const repo = createFoodCatalogRepository(db);
const service = createFoodCatalogService(repo, createEmbeddingClient(config.geminiApiKey));

console.log(`Embedding + upserting ${FOODS.length} foods…`);
await service.upsertMany(FOODS);
console.log(`✅ Done. Catalog now has ${await service.count()} foods.`);
console.log("Try the search endpoint or parse a meal like '200g cooked chicken breast and 150g rice'.");
process.exit(0);
