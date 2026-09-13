// Reference matching tiers (ADR 0020) over hybrid retrieval (ADR 0014):
// lexical token overlap is primary; pgvector similarity is only a fallback when
// the lexical best score is below the auto threshold. Matching uses ONLY the
// menu name — Weekly Menu Prior ranking is deferred (ADR 0021).
import type { Macronutrients } from "../types";

export interface ReferenceRow {
  id: number;
  provider: string;
  providerFoodCode: string;
  version: string;
  nameEn: string | null;
  nameTh: string | null;
  per100: Macronutrients;
}

export interface ReferenceMatcherRepo {
  /** Candidate pool (Nutrition Reference Catalog). */
  listReferences(): Promise<ReferenceRow[]>;
  /** Optional pgvector fallback. */
  searchByEmbedding?(embedding: number[]): Promise<Array<ReferenceRow & { similarity: number }>>;
}

export type MatchOutcome =
  | { tier: "auto"; reference: ReferenceRow; score: number }
  | { tier: "ambiguous"; candidates: Array<ReferenceRow & { score: number }> } // top 3, sorted desc
  | { tier: "gap" };

// Provisional tier thresholds (design spec §12, awaiting calibration).
export const AUTO_SCORE_THRESHOLD = 0.82;
export const AUTO_MARGIN_THRESHOLD = 0.08;
export const AMBIGUOUS_SCORE_THRESHOLD = 0.6;

/** Vector weight when combining with lexical (ADR 0014 hybrid: 0.6 lexical / 0.4 vector). */
const LEXICAL_WEIGHT = 0.6;
const VECTOR_WEIGHT = 0.4;

export interface MatcherOptions {
  /** Produces the query embedding for the pgvector fallback. Required to engage the fallback. */
  embed?: (text: string) => Promise<number[]>;
  autoScoreThreshold?: number;
  autoMarginThreshold?: number;
  ambiguousScoreThreshold?: number;
}

/**
 * Tokenize a menu/reference name: split on whitespace and punctuation,
 * lowercase (affects latin only); Thai tokens are compared whole.
 */
export function tokenizeName(name: string): string[] {
  return name
    .split(/[\s\p{P}\p{S}]+/u)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0);
}

/**
 * Lexical score: normalized token overlap (query coverage) over the
 * reference's Thai + English names. 0 when either side has no tokens.
 */
export function scoreReference(menuName: string, ref: ReferenceRow): number {
  const queryTokens = new Set(tokenizeName(menuName));
  if (queryTokens.size === 0) return 0;
  const refTokens = new Set([
    ...tokenizeName(ref.nameEn ?? ""),
    ...tokenizeName(ref.nameTh ?? ""),
  ]);
  if (refTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (refTokens.has(token)) overlap++;
  }
  return overlap / queryTokens.size;
}

interface Scored {
  ref: ReferenceRow;
  score: number;
}

export function createReferenceMatcher(repo: ReferenceMatcherRepo, opts: MatcherOptions = {}) {
  const autoThreshold = opts.autoScoreThreshold ?? AUTO_SCORE_THRESHOLD;
  const marginThreshold = opts.autoMarginThreshold ?? AUTO_MARGIN_THRESHOLD;
  const ambiguousThreshold = opts.ambiguousScoreThreshold ?? AMBIGUOUS_SCORE_THRESHOLD;

  async function matchReference(menuName: string): Promise<MatchOutcome> {
    const pool = await repo.listReferences();
    if (pool.length === 0) return { tier: "gap" };

    let scored: Scored[] = pool
      .map((ref) => ({ ref, score: scoreReference(menuName, ref) }))
      .sort((a, b) => b.score - a.score);

    // Vector fallback (ADR 0014): only when the lexical best is below the auto
    // threshold AND both an embedder and repo.searchByEmbedding are available.
    const canUseVector =
      scored.length > 0 &&
      scored[0]!.score < autoThreshold &&
      typeof repo.searchByEmbedding === "function" &&
      typeof opts.embed === "function";
    if (canUseVector) {
      const embedding = await opts.embed!(menuName);
      const vectorHits = await repo.searchByEmbedding!(embedding);
      const similarityById = new Map(vectorHits.map((hit) => [hit.id, hit.similarity]));
      scored = scored
        .map((s) => {
          const similarity = similarityById.get(s.ref.id);
          return similarity === undefined
            ? s
            : { ref: s.ref, score: LEXICAL_WEIGHT * s.score + VECTOR_WEIGHT * similarity };
        })
        .sort((a, b) => b.score - a.score);
    }

    const best = scored[0]!;
    const runnerUp = scored[1];
    if (
      best.score >= autoThreshold &&
      (runnerUp === undefined || best.score - runnerUp.score >= marginThreshold)
    ) {
      return { tier: "auto", reference: best.ref, score: best.score };
    }
    if (best.score >= ambiguousThreshold) {
      return {
        tier: "ambiguous",
        candidates: scored.slice(0, 3).map((s) => ({ ...s.ref, score: s.score })),
      };
    }
    return { tier: "gap" };
  }

  return { matchReference };
}
