// Persistence for the Canonical Exercise Catalog (ADR 0027). Separate from
// runtime matching concerns (T2) because the import/backfill path is a batch
// administrative concern — mirrors nutrition-reference-import.repository.ts.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { canonicalExercises, exerciseAliases, gyms, sessions, workouts } from "../schema";
import type { RepdbExerciseRow } from "../exercises/repdb-import";
import type { CanonicalExerciseRow, ExerciseMatcherRepo } from "../exercises/exercise-matcher";

/** Chunk size for multi-row inserts (bounded parameter counts per statement). */
export const UPSERT_CHUNK_SIZE = 500;

export function createExerciseCatalogRepository(dbInstance: PostgresJsDatabase) {
  return {
    /**
     * Idempotent bulk upsert keyed on the unique
     * (provider, provider_exercise_code, version) index. The embedding is
     * only overwritten when the incoming row carries one, so re-running the
     * importer without the embed pass never clobbers computed embeddings.
     */
    async upsertExerciseBatch(rows: RepdbExerciseRow[]): Promise<number> {
      let processed = 0;
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
        if (chunk.length === 0) continue;
        await dbInstance
          .insert(canonicalExercises)
          .values(chunk)
          .onConflictDoUpdate({
            target: [
              canonicalExercises.provider,
              canonicalExercises.provider_exercise_code,
              canonicalExercises.version,
            ],
            set: {
              name_en: sql`excluded.name_en`,
              equipment: sql`excluded.equipment`,
              body_part: sql`excluded.body_part`,
              primary_muscles: sql`excluded.primary_muscles`,
              secondary_muscles: sql`excluded.secondary_muscles`,
              mechanic: sql`excluded.mechanic`,
              is_unilateral: sql`excluded.is_unilateral`,
              is_bodyweight: sql`excluded.is_bodyweight`,
              embedding: sql`coalesce(excluded.embedding, ${canonicalExercises.embedding})`,
            },
          });
        processed += chunk.length;
      }
      return processed;
    },

    async countByProvider(provider: string): Promise<number> {
      const [row] = await dbInstance
        .select({ count: sql<number>`count(*)::int` })
        .from(canonicalExercises)
        .where(eq(canonicalExercises.provider, provider));
      return row?.count ?? 0;
    },

    /** id lookup for (provider, code) pairs — feeds the backfill mapping. */
    async findIdsByProviderCodes(
      pairs: Array<{ provider: string; code: string }>,
    ): Promise<Map<string, number>> {
      const found = new Map<string, number>();
      if (pairs.length === 0) return found;
      const rows = await dbInstance
        .select({
          id: canonicalExercises.id,
          provider: canonicalExercises.provider,
          code: canonicalExercises.provider_exercise_code,
        })
        .from(canonicalExercises)
        .where(
          inArray(
            sql`(${canonicalExercises.provider}, ${canonicalExercises.provider_exercise_code})`,
            pairs.map((p) => sql`(${p.provider}, ${p.code})`),
          ),
        );
      for (const row of rows) {
        found.set(`${row.provider}:${row.code}`, row.id);
      }
      return found;
    },

    /** Alias rows for seeded logged names; re-runs are no-ops on conflict. */
    async upsertAliasBatch(aliases: Array<{ alias: string; canonical_exercise_id: number }>): Promise<number> {
      if (aliases.length === 0) return 0;
      await dbInstance.insert(exerciseAliases).values(aliases).onConflictDoNothing();
      return aliases.length;
    },

    /**
     * One-time backfill: anchor workouts by exact logged name and mark the
     * tier manual (the mapping was human-authored, not matched). Runs across
     * ALL users deliberately — the name→canonical mapping is user-independent
     * truth, so any account's identical spelling deserves the same anchor.
     * Returns updated row counts per name.
     */
    async backfillWorkoutNames(
      updates: Array<{ name: string; canonical_exercise_id: number }>,
    ): Promise<Array<{ name: string; updated: number }>> {
      const results: Array<{ name: string; updated: number }> = [];
      for (const { name, canonical_exercise_id } of updates) {
        const updated = await dbInstance
          .update(workouts)
          .set({ canonical_exercise_id, match_tier: "manual" })
          .where(eq(workouts.exercise_name, name))
          .returning({ id: workouts.id });
        results.push({ name, updated: updated.length });
      }
      return results;
    },

    /** Distinct logged names with no canonical anchor (the future alias queue). */
    async listUnanchoredNames(): Promise<Array<{ name: string; count: number }>> {
      return dbInstance
        .select({
          name: workouts.exercise_name,
          count: sql<number>`count(*)::int`,
        })
        .from(workouts)
        .where(isNull(workouts.canonical_exercise_id))
        .groupBy(workouts.exercise_name)
        .orderBy(sql`count(*) desc`);
    },

    /** Rows still missing an embedding (the importer's embed pass target). */
    async listWithoutEmbedding(): Promise<Array<{ id: number; name_en: string | null }>> {
      return dbInstance
        .select({ id: canonicalExercises.id, name_en: canonicalExercises.name_en })
        .from(canonicalExercises)
        .where(and(isNull(canonicalExercises.embedding)));
    },

    async setEmbedding(id: number, embedding: number[]): Promise<void> {
      await dbInstance
        .update(canonicalExercises)
        .set({ embedding })
        .where(eq(canonicalExercises.id, id));
    },
  };
}

export type ExerciseCatalogRepository = ReturnType<typeof createExerciseCatalogRepository>;

const CANONICAL_COLUMNS = {
  id: canonicalExercises.id,
  provider: canonicalExercises.provider,
  provider_exercise_code: canonicalExercises.provider_exercise_code,
  version: canonicalExercises.version,
  name_en: canonicalExercises.name_en,
  equipment: canonicalExercises.equipment,
  body_part: canonicalExercises.body_part,
  primary_muscles: canonicalExercises.primary_muscles,
  secondary_muscles: canonicalExercises.secondary_muscles,
  mechanic: canonicalExercises.mechanic,
  is_unilateral: canonicalExercises.is_unilateral,
  is_bodyweight: canonicalExercises.is_bodyweight,
};

/**
 * Runtime read side of the catalog: feeds the exercise matcher (ADR 0027)
 * with the alias tier, the lexical pool, and the pgvector fallback.
 */
export function createExerciseMatcherRepository(dbInstance: PostgresJsDatabase): ExerciseMatcherRepo & {
  /** Exercises logged at a gym with their canonical anchor, newest first
   * (availability evidence — "เล่นจริง = มีจริง", ADR 0027). */
  listPlayedExercises(
    gymId: number,
    userId: number,
    limit?: number,
  ): Promise<Array<{ exercise_name: string; canonical_exercise_id: number | null }>>;
} {
  return {
    async listAliasEntries() {
      const rows = await dbInstance
        .select({ alias: exerciseAliases.alias, exercise: CANONICAL_COLUMNS })
        .from(exerciseAliases)
        .innerJoin(canonicalExercises, eq(exerciseAliases.canonical_exercise_id, canonicalExercises.id));
      return rows.map((row) => ({ alias: row.alias, exercise: row.exercise as CanonicalExerciseRow }));
    },

    async listExercises() {
      const rows = await dbInstance.select(CANONICAL_COLUMNS).from(canonicalExercises);
      return rows as CanonicalExerciseRow[];
    },

    async searchByEmbedding(embedding: number[], k = 10) {
      const distance = cosineDistance(canonicalExercises.embedding, embedding);
      const rows = await dbInstance
        .select({ ...CANONICAL_COLUMNS, similarity: sql<number>`1 - (${distance})` })
        .from(canonicalExercises)
        .orderBy(distance)
        .limit(k);
      return rows.map((row) => {
        const { similarity, ...exercise } = row;
        return { ...exercise, similarity: Number(similarity) } as CanonicalExerciseRow & { similarity: number };
      });
    },

    async listPlayedExercises(gymId: number, userId: number, limit = 25) {
      // Newest-workout first, deduped in JS so the limit keeps the most
      // RECENT distinct exercises (a plain DISTINCT would truncate
      // alphabetically instead).
      const rows = await dbInstance
        .select({
          exercise_name: workouts.exercise_name,
          canonical_exercise_id: workouts.canonical_exercise_id,
          created_at: workouts.created_at,
        })
        .from(workouts)
        .innerJoin(sessions, eq(workouts.session_id, sessions.id))
        .where(and(eq(sessions.gym_id, gymId), eq(sessions.user_id, userId)))
        .orderBy(sql`${workouts.created_at} desc`)
        .limit(limit * 4);
      const seen = new Set<string>();
      const out: Array<{ exercise_name: string; canonical_exercise_id: number | null }> = [];
      for (const row of rows) {
        const key = row.canonical_exercise_id
          ? `id:${row.canonical_exercise_id}`
          : `name:${row.exercise_name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ exercise_name: row.exercise_name, canonical_exercise_id: row.canonical_exercise_id });
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}

/** The coach's gym resolver: explicit id when owned, else the last-used gym. */
export function createGymLookup(dbInstance: PostgresJsDatabase) {
  return {
    async getGym(
      gymId: number | undefined,
      userId: number,
    ): Promise<{ id: number; name: string; equipment: string[] | null } | null> {
      if (gymId !== undefined) {
        const [row] = await dbInstance
          .select({ id: gyms.id, name: gyms.name, equipment: gyms.equipment })
          .from(gyms)
          .where(and(eq(gyms.id, gymId), eq(gyms.user_id, userId)))
          .limit(1);
        return row ?? null;
      }
      // Last-used fallback (Q14b): list() is ordered most-recently-used first.
      const [row] = await dbInstance
        .select({ id: gyms.id, name: gyms.name, equipment: gyms.equipment })
        .from(gyms)
        .leftJoin(sessions, eq(sessions.gym_id, gyms.id))
        .where(eq(gyms.user_id, userId))
        .groupBy(gyms.id)
        .orderBy(sql`max(${sessions.created_at}) desc nulls last`, gyms.created_at)
        .limit(1);
      return row ?? null;
    },
  };
}
