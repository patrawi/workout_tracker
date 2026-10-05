// Exercise matching tiers (ADR 0027): user-attested alias exact first, then
// lexical token overlap over name_en, then pgvector similarity on its own
// scale — mirroring the nutrition reference matcher (ADR 0020/0026) tier
// semantics. Matching happens per workout row at confirm time and never
// blocks: ambiguous/gap leave the free-text name unanchored.
import { tokenizeName } from "../nutrition-estimation/matching/matcher";

/** The catalog row the matcher resolves onto (canonical_exercises shape). */
export interface CanonicalExerciseRow {
  id: number;
  provider: string;
  provider_exercise_code: string;
  version: string;
  name_en: string | null;
  equipment: string | null;
  body_part: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  mechanic: string | null;
  is_unilateral: boolean;
  is_bodyweight: boolean;
}

export interface ExerciseMatcherRepo {
  /** Alias → exercise entries (Tier 1). */
  listAliasEntries(): Promise<Array<{ alias: string; exercise: CanonicalExerciseRow }>>;
  /** Candidate pool for the lexical tier (Tier 2). */
  listExercises(): Promise<CanonicalExerciseRow[]>;
  /** Optional pgvector fallback (Tier 3). */
  searchByEmbedding?(embedding: number[]): Promise<Array<CanonicalExerciseRow & { similarity: number }>>;
}

export type ExerciseMatchOutcome =
  | { tier: "auto"; exercise: CanonicalExerciseRow; score: number }
  | { tier: "ambiguous"; candidates: Array<CanonicalExerciseRow & { score: number }> } // top 3, sorted desc
  | { tier: "gap" };

// Provisional thresholds mirroring the nutrition matcher's initial values;
// calibrate against this catalog with known-answer queries before trusting
// the vector tier (the calibration script lives in
// scripts/calibrate-exercise-matcher.ts).
export const AUTO_SCORE_THRESHOLD = 0.82;
export const AUTO_MARGIN_THRESHOLD = 0.08;
export const AMBIGUOUS_SCORE_THRESHOLD = 0.6;
export const VECTOR_AUTO_THRESHOLD = 0.85;
export const VECTOR_MARGIN_THRESHOLD = 0.03;
export const VECTOR_AMBIGUOUS_THRESHOLD = 0.7;

export interface ExerciseMatcherOptions {
  /** Produces the query embedding for the pgvector fallback. Required to engage the fallback. */
  embed?: (text: string) => Promise<number[]>;
  autoScoreThreshold?: number;
  autoMarginThreshold?: number;
  ambiguousScoreThreshold?: number;
}

/** Tokenize an exercise name: split on whitespace/punctuation, lowercase latin. */
export function tokenizeExerciseName(name: string): string[] {
  return tokenizeName(name);
}

/**
 * Lexical score: normalized token overlap (query coverage) over the
 * canonical English name. 0 when either side has no tokens.
 */
function scoreExercise(query: string, exercise: CanonicalExerciseRow): number {
  const queryTokens = new Set(tokenizeExerciseName(query));
  if (queryTokens.size === 0) return 0;
  const nameTokens = new Set(tokenizeExerciseName(exercise.name_en ?? ""));
  if (nameTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (nameTokens.has(token)) overlap++;
  }
  return overlap / queryTokens.size;
}

interface Scored {
  exercise: CanonicalExerciseRow;
  score: number;
}

export function createExerciseMatcher(repo: ExerciseMatcherRepo, opts: ExerciseMatcherOptions = {}) {
  const autoThreshold = opts.autoScoreThreshold ?? AUTO_SCORE_THRESHOLD;
  const marginThreshold = opts.autoMarginThreshold ?? AUTO_MARGIN_THRESHOLD;
  const ambiguousThreshold = opts.ambiguousScoreThreshold ?? AMBIGUOUS_SCORE_THRESHOLD;

  async function match(name: string): Promise<ExerciseMatchOutcome> {
    const trimmed = name.trim();
    if (!trimmed) return { tier: "gap" };

    // Tier 1: user-attested alias, case-insensitive exact — auto-selects and
    // skips lexical scoring entirely (the alias IS the human resolution).
    const aliases = await repo.listAliasEntries();
    const aliasHit = aliases.find((a) => a.alias.trim().toLowerCase() === trimmed.toLowerCase());
    if (aliasHit) {
      return { tier: "auto", exercise: aliasHit.exercise, score: 1 };
    }

    // Tier 2: lexical token overlap over the canonical English name.
    const pool = await repo.listExercises();
    if (pool.length === 0) return { tier: "gap" };

    const scored: Scored[] = pool
      .map((exercise) => ({ exercise, score: scoreExercise(trimmed, exercise) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0]!;
    const runnerUp = scored[1];
    if (
      best.score >= autoThreshold &&
      (runnerUp === undefined || best.score - runnerUp.score >= marginThreshold)
    ) {
      return { tier: "auto", exercise: best.exercise, score: best.score };
    }

    // Tier 3: pgvector fallback, engaged when the lexical best misses the
    // auto bar, scored on its own similarity scale.
    const canUseVector =
      typeof repo.searchByEmbedding === "function" &&
      typeof opts.embed === "function";
    if (canUseVector) {
      const embedding = await opts.embed!(trimmed);
      const vectorHits = (await repo.searchByEmbedding!(embedding))
        .filter((hit) => hit.similarity >= VECTOR_AMBIGUOUS_THRESHOLD)
        .sort((a, b) => b.similarity - a.similarity);
      const bestVector = vectorHits[0];
      if (bestVector) {
        const runnerUpVector = vectorHits[1];
        if (
          bestVector.similarity >= VECTOR_AUTO_THRESHOLD &&
          (runnerUpVector === undefined ||
            bestVector.similarity - runnerUpVector.similarity >= VECTOR_MARGIN_THRESHOLD)
        ) {
          const { similarity, ...exercise } = bestVector;
          return { tier: "auto", exercise, score: similarity };
        }
        return {
          tier: "ambiguous",
          candidates: vectorHits.slice(0, 3).map(({ similarity, ...exercise }) => ({
            ...exercise,
            score: similarity,
          })),
        };
      }
    }

    if (best.score >= ambiguousThreshold) {
      return {
        tier: "ambiguous",
        // Zero-overlap rows are not alternatives — don't pad the list.
        candidates: scored
          .filter((s) => s.score > 0)
          .slice(0, 3)
          .map((s) => ({ ...s.exercise, score: s.score })),
      };
    }
    return { tier: "gap" };
  }

  return { match };
}
