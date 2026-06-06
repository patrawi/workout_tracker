import { cosineDistance, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { foodCatalog } from "../schema";

/** A catalog food's stored facts (macros are per `per_amount` `per_unit`). */
export interface FoodCatalogRecord {
  id: string;
  name: string;
  brand: string;
  product_type: string;
  per_amount: number;
  per_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  source_row_id: string | null;
  /** Hash of the embedded text (name/brand/type); a change means re-embed. */
  doc_hash: string;
  /** Hash of the macros; a change means update the row (no embedding call). */
  macro_hash: string;
}

export interface FoodCatalogSearchResult extends FoodCatalogRecord {
  /** Cosine distance to the query (0 = identical, 2 = opposite). Lower is better. */
  distance: number;
}

const RECORD_COLUMNS = {
  id: foodCatalog.id,
  name: foodCatalog.name,
  brand: foodCatalog.brand,
  product_type: foodCatalog.product_type,
  per_amount: foodCatalog.per_amount,
  per_unit: foodCatalog.per_unit,
  calories: foodCatalog.calories,
  protein: foodCatalog.protein,
  carbs: foodCatalog.carbs,
  fat: foodCatalog.fat,
  source: foodCatalog.source,
  source_row_id: foodCatalog.source_row_id,
} as const;

export function createFoodCatalogRepository(dbInstance: PostgresJsDatabase) {
  return {
    /** Map of `id` → stored hashes, for incremental sync diffing. */
    async getRowHashes(): Promise<
      Map<string, { doc_hash: string | null; macro_hash: string | null }>
    > {
      const rows = await dbInstance
        .select({
          id: foodCatalog.id,
          doc_hash: foodCatalog.doc_hash,
          macro_hash: foodCatalog.macro_hash,
        })
        .from(foodCatalog);
      return new Map(
        rows.map((r) => [r.id, { doc_hash: r.doc_hash, macro_hash: r.macro_hash }]),
      );
    },

    /** Insert or update one food + its embedding (keyed on `id`). */
    async upsert(record: FoodCatalogRecord, embedding: number[]): Promise<void> {
      await dbInstance
        .insert(foodCatalog)
        .values({ ...record, embedding })
        .onConflictDoUpdate({
          target: foodCatalog.id,
          set: { ...record, embedding, updated_at: sql`now()` },
        });
    },

    /** Update macros + macro_hash only, leaving the embedding untouched (keyed on `id`). */
    async updateMacros(record: FoodCatalogRecord): Promise<void> {
      await dbInstance
        .update(foodCatalog)
        .set({
          per_amount: record.per_amount,
          per_unit: record.per_unit,
          calories: record.calories,
          protein: record.protein,
          carbs: record.carbs,
          fat: record.fat,
          macro_hash: record.macro_hash,
          updated_at: sql`now()`,
        })
        .where(eq(foodCatalog.id, record.id));
    },

    /** Top-k nearest catalog foods by cosine distance. */
    async search(embedding: number[], k: number): Promise<FoodCatalogSearchResult[]> {
      const distance = cosineDistance(foodCatalog.embedding, embedding);
      const rows = await dbInstance
        .select({ ...RECORD_COLUMNS, distance: sql<number>`${distance}` })
        .from(foodCatalog)
        .orderBy(distance)
        .limit(k);
      return rows as FoodCatalogSearchResult[];
    },

    async count(): Promise<number> {
      const [row] = await dbInstance
        .select({ count: sql<number>`count(*)::int` })
        .from(foodCatalog);
      return row?.count ?? 0;
    },
  };
}

export type FoodCatalogRepository = ReturnType<typeof createFoodCatalogRepository>;
