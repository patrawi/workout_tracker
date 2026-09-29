// Reference matching tiers (ADR 0020, rescored per ADR 0026): exact food-code
// lookup first, then lexical token overlap; when the lexical best misses the
// auto bar, pgvector similarity decides ON ITS OWN SCALE (the old 0.6/0.4
// blend into the lexical scale was mathematically dead). Matching is invoked
// per meal component since ADR 0026 — the menu name is no longer the match key.
import type { ReferenceRow } from "../types";

// Compatibility re-export: ReferenceRow lives in ../types (domain types).
export type { ReferenceRow } from "../types";

export interface ReferenceMatcherRepo {
  /** Candidate pool (Nutrition Reference Catalog). */
  listReferences(): Promise<ReferenceRow[]>;
  /** Exact food-code lookup (hybrid tier 0): case-insensitive, trimmed. */
  findByFoodCode(code: string): Promise<ReferenceRow | null>;
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

// Vector thresholds on their OWN similarity scale (ADR 0014, calibrated
// 2026-09-29 on 12 known-answer queries against the 1,357-row catalog: exact
// hits 0.87–1.0, near dishes 0.75–0.82, unrelated 0.60–0.73). The old
// 0.6-lexical/0.4-vector blend was mathematically dead — a weighted cosine can
// never clear the lexical-scale bars. Upgrade path: recalibrate from own
// logged meals (few-shot phase 3).
export const VECTOR_AUTO_THRESHOLD = 0.85;
export const VECTOR_MARGIN_THRESHOLD = 0.03;
export const VECTOR_AMBIGUOUS_THRESHOLD = 0.7;

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
    // Tier 0: exact food-code lookup (spec §7 — hybrid = food-code + lexical +
    // pgvector). A trimmed, case-insensitive code match auto-selects and skips
    // lexical scoring entirely.
    const code = menuName.trim();
    if (code) {
      const byCode = await repo.findByFoodCode(code);
      if (byCode) return { tier: "auto", reference: byCode, score: 1 };
    }

    const pool = await repo.listReferences();
    if (pool.length === 0) return { tier: "gap" };

    const scored: Scored[] = pool
      .map((ref) => ({ ref, score: scoreReference(menuName, ref) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0]!;
    const runnerUp = scored[1];
    if (
      best.score >= autoThreshold &&
      (runnerUp === undefined || best.score - runnerUp.score >= marginThreshold)
    ) {
      return { tier: "auto", reference: best.ref, score: best.score };
    }

    // Vector fallback (ADR 0014): engaged when the lexical best misses the
    // auto bar, scored on its own similarity scale (see thresholds above).
    const canUseVector =
      typeof repo.searchByEmbedding === "function" &&
      typeof opts.embed === "function";
    if (canUseVector) {
      const embedding = await opts.embed!(menuName);
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
          return { tier: "auto", reference: bestVector, score: bestVector.similarity };
        }
        return {
          tier: "ambiguous",
          candidates: vectorHits.slice(0, 3).map((hit) => ({ ...hit, score: hit.similarity })),
        };
      }
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
