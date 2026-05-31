import { CATALOG_TOPK } from "../constants";
import type { EmbeddingClient } from "../embeddings/client";
import type {
  FoodCatalogRecord,
  FoodCatalogRepository,
  FoodCatalogSearchResult,
} from "../repositories/food-catalog.repository";

/**
 * Build the text that gets embedded for a catalog food. Mirrors the sandbox
 * `foodToDocument` shape — name + brand + type + a per-amount nutrition summary —
 * so semantically-similar meal notes ("2 lidl eggs") land near the right food.
 */
export function buildFoodDocument(r: FoodCatalogRecord): string {
  const parts = [r.name];
  if (r.brand) parts.push(`Brand: ${r.brand}`);
  if (r.product_type) parts.push(`Type: ${r.product_type}`);
  parts.push(
    `Nutrition per ${r.per_amount} ${r.per_unit}: ${r.calories} kcal, ` +
      `protein ${r.protein}g, carbs ${r.carbs}g, fat ${r.fat}g.`,
  );
  return parts.join("\n");
}

// Gemini embedContent batches are capped; keep requests comfortably under the limit.
const EMBED_BATCH_SIZE = 100;

export interface FoodCatalogService {
  upsertFood(record: FoodCatalogRecord): Promise<void>;
  upsertMany(records: FoodCatalogRecord[]): Promise<void>;
  search(query: string, k?: number): Promise<FoodCatalogSearchResult[]>;
  getExistingRowIds(): Promise<Set<string>>;
  count(): Promise<number>;
}

export function createFoodCatalogService(
  repo: FoodCatalogRepository,
  embeddings: EmbeddingClient,
): FoodCatalogService {
  return {
    async upsertFood(record: FoodCatalogRecord): Promise<void> {
      const embedding = await embeddings.embed(buildFoodDocument(record));
      await repo.upsert(record, embedding);
    },

    async upsertMany(records: FoodCatalogRecord[]): Promise<void> {
      for (let i = 0; i < records.length; i += EMBED_BATCH_SIZE) {
        const chunk = records.slice(i, i + EMBED_BATCH_SIZE);
        const vectors = await embeddings.embedBatch(chunk.map(buildFoodDocument));
        for (let j = 0; j < chunk.length; j++) {
          const record = chunk[j];
          const vector = vectors[j];
          if (!record || !vector) continue;
          await repo.upsert(record, vector);
        }
      }
    },

    async search(query: string, k: number = CATALOG_TOPK): Promise<FoodCatalogSearchResult[]> {
      const embedding = await embeddings.embed(query);
      return repo.search(embedding, k);
    },

    getExistingRowIds: () => repo.getExistingRowIds(),
    count: () => repo.count(),
  };
}
