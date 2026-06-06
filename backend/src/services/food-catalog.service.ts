import { CATALOG_TOPK } from "../constants";
import type { EmbeddingClient } from "../embeddings/client";
import type {
  FoodCatalogRecord,
  FoodCatalogRepository,
  FoodCatalogSearchResult,
} from "../repositories/food-catalog.repository";

/**
 * Build the text that gets embedded for a catalog food: name + brand + type.
 * Deliberately macro-independent so editing a macro doesn't change the embedded
 * text — that lets sync update macros without spending an embedding call (the
 * macros are noise for a name-similarity match anyway). Mirrors the meal-note
 * shape so "2 lidl eggs" lands near the right food. Kept in lockstep with
 * `doc_hash` in `sheet-source.ts`.
 */
export function buildFoodDocument(r: FoodCatalogRecord): string {
  const parts = [r.name];
  if (r.brand) parts.push(`Brand: ${r.brand}`);
  if (r.product_type) parts.push(`Type: ${r.product_type}`);
  return parts.join("\n");
}

// Gemini embedContent batches are capped; keep requests comfortably under the limit.
const EMBED_BATCH_SIZE = 100;

export interface FoodCatalogService {
  upsertFood(record: FoodCatalogRecord): Promise<void>;
  upsertMany(records: FoodCatalogRecord[]): Promise<void>;
  updateMacros(records: FoodCatalogRecord[]): Promise<void>;
  search(query: string, k?: number): Promise<FoodCatalogSearchResult[]>;
  getRowHashes(): Promise<
    Map<string, { doc_hash: string | null; macro_hash: string | null }>
  >;
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

    /** Update macros for rows whose only change is nutrition — no embedding calls. */
    async updateMacros(records: FoodCatalogRecord[]): Promise<void> {
      for (const record of records) {
        await repo.updateMacros(record);
      }
    },

    async search(query: string, k: number = CATALOG_TOPK): Promise<FoodCatalogSearchResult[]> {
      const embedding = await embeddings.embed(query);
      return repo.search(embedding, k);
    },

    getRowHashes: () => repo.getRowHashes(),
    count: () => repo.count(),
  };
}
