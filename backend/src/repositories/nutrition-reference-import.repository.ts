// Bulk import persistence for the Nutrition Reference Catalog (ADR 0002, 0011).
// Separate from nutrition-estimation.repository.ts because the import path is a
// batch administrative concern while the estimation path is a runtime concern.
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { nutritionReferences } from "../schema";
import type { ThaifcdReferenceRow } from "../nutrition-estimation/thaifcd-import";

/** Chunk size for multi-row inserts (bounded parameter counts per statement). */
export const UPSERT_CHUNK_SIZE = 500;

export function createNutritionReferenceImportRepository(dbInstance: PostgresJsDatabase) {
  return {
    /**
     * Idempotent bulk upsert of catalog rows, keyed on the unique
     * (provider, provider_food_code, version) index. Rows are inserted in
     * chunks of {@link UPSERT_CHUNK_SIZE}; a conflicting row updates all
     * nutrition fields. The embedding is only overwritten when the incoming
     * row carries one, so a re-run without `--embed` never clobbers
     * previously computed embeddings.
     *
     * Accepts the ThaiFCD row shape (or any row with the same fields).
     * Returns the number of rows processed.
     */
    async upsertThaifcdBatch(rows: ThaifcdReferenceRow[]): Promise<number> {
      let processed = 0;
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
        if (chunk.length === 0) continue;
        await dbInstance
          .insert(nutritionReferences)
          .values(chunk)
          .onConflictDoUpdate({
            target: [
              nutritionReferences.provider,
              nutritionReferences.provider_food_code,
              nutritionReferences.version,
            ],
            set: {
              name_en: sql`excluded.name_en`,
              name_th: sql`excluded.name_th`,
              protein: sql`excluded.protein`,
              carbs: sql`excluded.carbs`,
              fat: sql`excluded.fat`,
              alcohol: sql`excluded.alcohol`,
              calories: sql`excluded.calories`,
              extra_nutrients: sql`excluded.extra_nutrients`,
              embedding: sql`coalesce(excluded.embedding, ${nutritionReferences.embedding})`,
            },
          });
        processed += chunk.length;
      }
      return processed;
    },

    /** Count of catalog rows for one provider snapshot version. */
    async countByProviderVersion(provider: string, version: string): Promise<number> {
      const [row] = await dbInstance
        .select({ count: sql<number>`count(*)::int` })
        .from(nutritionReferences)
        .where(
          and(
            eq(nutritionReferences.provider, provider),
            eq(nutritionReferences.version, version),
          ),
        );
      return row?.count ?? 0;
    },
  };
}

export type NutritionReferenceImportRepository = ReturnType<
  typeof createNutritionReferenceImportRepository
>;
