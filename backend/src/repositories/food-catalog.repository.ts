import { cosineDistance, sql } from "drizzle-orm";
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
    /** Set of `source_row_id`s already in the catalog (for incremental sync dedup). */
    async getExistingRowIds(): Promise<Set<string>> {
      const rows = await dbInstance
        .select({ source_row_id: foodCatalog.source_row_id })
        .from(foodCatalog);
      return new Set(
        rows.map((r) => r.source_row_id).filter((v): v is string => Boolean(v)),
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
