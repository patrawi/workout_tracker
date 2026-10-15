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

/**
 * Vector auto uses vendor-adjusted similarity: BaoWio's bare ingredient names
 * embed closer to cooked-dish queries than ThaiFCD's preparation-qualified
 * rows ("ข้าวเหนียวสุก" → "ข้าวเหนียว" 0.879 vs "ข้าวเหนียว, นึ่ง" 0.796), so
 * without a handicap the vector tier auto-picks the BaoWio row and the meal
 * inherits its (unit-suspect) macros. Only BaoWio pays the handicap — every
 * other provider keeps the raw scale the ADR 0014 calibration measured.
 */
export const VECTOR_PROVIDER_HANDICAP = 0.1;

function vectorHandicapStep(provider: string): number {
  return provider === "baowio" ? 1 : 0;
}

/**
 * Vendor trust on score ties: manually curated rows (owner-entered, e.g. gaps
 * the catalog could not fill) are the most trusted, then ThaiFCD (the curated
 * national composition table), while BaoWio's ingredient export mixes unit
 * conventions (กะปิ at 360 g carbs per 100 g). BaoWio only wins a tie when
 * nothing more trusted has a row.
 */
export function providerRank(provider: string): number {
  if (provider === "manual") return 0;
  if (provider === "thaifcd") return 1;
  if (provider === "baowio") return 2;
  return 3;
}

export interface MatcherOptions {
  /** Produces the query embedding for the pgvector fallback. Required to engage the fallback. */
  embed?: (text: string) => Promise<number[]>;
  autoScoreThreshold?: number;
  autoMarginThreshold?: number;
  ambiguousScoreThreshold?: number;
}

/**
 * Plausible per-100 g calorie bands per component kind (F3 sanity net): an
 * auto-selected reference whose calories fall outside its kind's band is
 * demoted to ambiguous instead of silently feeding the calculation — catches
 * raw-density grains (ข้าวเม่า 364) and unit-suspect rows slipping past the
 * name score. Bands are deliberately wide; they catch gross violations only.
 */
export const KIND_KCAL_BANDS: Record<string, [number, number]> = {
  rice: [40, 320],
  main: [30, 650],
  side: [10, 500],
  broth: [2, 250],
  other: [10, 700],
};

function caloriesInKindBand(kind: string | undefined, calories: number): boolean {
  if (kind === undefined) return true;
  const band = KIND_KCAL_BANDS[kind] ?? KIND_KCAL_BANDS.other!;
  return calories >= band[0] && calories <= band[1];
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

// --- Preparation-state awareness (ข้าวเหนียวหมูย่าง incident, 2026-10) ---
// ThaiFCD names carry the preparation state as a qualifier ("ข้าวเหนียว, ดิบ"
// 354 vs "ข้าวเหนียว, นึ่ง" 232 kcal/100g). Meal components are almost always
// cooked, so a raw-state row must never outrank — let alone auto-select over —
// a cooked equivalent when the query does not ask for raw.

const RAW_STATE_TOKENS = new Set(["ดิบ", "raw"]);
const COOKED_STATE_TOKENS = new Set([
  "นึ่ง",
  "ต้ม",
  "ทอด",
  "เผา",
  "ย่าง",
  "อบ",
  "คั่ว",
  "รมควัน",
  "สุก",
  "cooked",
  "steamed",
  "boiled",
  "fried",
  "grilled",
  "roasted",
  "baked",
]);
const COOKED_SUFFIX = "สุก"; // Thai has no spaces: "ข้าวเหนียวสุก" is one token

function isQueryRaw(tokens: string[]): boolean {
  return tokens.some((t) => RAW_STATE_TOKENS.has(t));
}

function refState(tokens: string[]): "raw" | "cooked" | null {
  if (tokens.some((t) => RAW_STATE_TOKENS.has(t))) return "raw";
  if (tokens.some((t) => COOKED_STATE_TOKENS.has(t))) return "cooked";
  return null;
}

/**
 * A Thai query token ending in สุก ("ข้าวเหนียวสุก") also covers the bare
 * stem ("ข้าวเหนียว") — bridges the สุก→นึ่ง/ต้ม morphology that whole-token
 * comparison cannot.
 */
function tokenCovers(queryToken: string, refTokens: Set<string>): boolean {
  if (refTokens.has(queryToken)) return true;
  return queryToken.endsWith(COOKED_SUFFIX) && refTokens.has(queryToken.slice(0, -COOKED_SUFFIX.length));
}

/**
 * ThaiFCD puts the food identity first and qualifiers after commas
 * ("ข้าวเม่า, ข้าวเหนียวขาว" — the flakes are the food, white sticky rice is a
 * variety note). A query matching ONLY qualifiers must not full-score.
 */
function refNameParts(ref: ReferenceRow): { primary: Set<string>; qualifier: Set<string> } {
  // The first comma-segment of EACH language forms the primary identity —
  // ThaiFCD Thai/English names are parallel comma lists, and bilingual refs
  // without commas are primary in full on both sides.
  const primary = new Set([
    ...tokenizeName((ref.nameTh || "").split(",")[0] ?? ""),
    ...tokenizeName((ref.nameEn || "").split(",")[0] ?? ""),
  ]);
  const qualifier = new Set(
    tokenizeName(`${ref.nameTh ?? ""} ${ref.nameEn ?? ""}`).filter((t) => !primary.has(t)),
  );
  return { primary, qualifier };
}

/**
 * Lexical score: normalized token overlap (query coverage) over the
 * reference's Thai + English names. 0 when either side has no tokens.
 * A Thai query token ending in สุก also covers the bare stem of the
 * reference name (ข้าวเหนียวสุก → ข้าวเหนียว).
 */
export function scoreReference(menuName: string, ref: ReferenceRow): number {
  const queryTokens = tokenizeName(menuName);
  if (queryTokens.length === 0) return 0;
  const refTokens = new Set([
    ...tokenizeName(ref.nameEn ?? ""),
    ...tokenizeName(ref.nameTh ?? ""),
  ]);
  if (refTokens.size === 0) return 0;
  let covered = 0;
  for (const token of queryTokens) {
    if (tokenCovers(token, refTokens)) covered++;
  }
  return covered / queryTokens.length;
}

/**
 * Post-scoring adjustments layered on the raw token-overlap score:
 * 1. structure cap — a query that matches only qualifier segments of a
 *    ThaiFCD name (variety/notes after the comma) cannot full-score;
 * 2. raw-state penalty — raw-state references are halved unless the query
 *    itself asks for raw, so "ข้าวเหนียว" ranks นึ่ง above ดิบ and never
 *    auto-selects the raw row.
 */
function adjustedScore(menuName: string, ref: ReferenceRow, base: number): number {
  if (base === 0) return 0;
  const queryTokens = tokenizeName(menuName);
  const { primary, qualifier } = refNameParts(ref);
  const hitsPrimary = queryTokens.some((t) => tokenCovers(t, primary));
  const hitsQualifier = queryTokens.some((t) => qualifier.has(t));
  let score = base;
  if (!hitsPrimary && hitsQualifier) score = Math.min(score, 0.5);
  if (refState([...primary, ...qualifier]) === "raw" && !isQueryRaw(queryTokens)) {
    score *= 0.5;
  }
  return score;
}

interface Scored {
  ref: ReferenceRow;
  score: number;
}

export function createReferenceMatcher(repo: ReferenceMatcherRepo, opts: MatcherOptions = {}) {
  const autoThreshold = opts.autoScoreThreshold ?? AUTO_SCORE_THRESHOLD;
  const marginThreshold = opts.autoMarginThreshold ?? AUTO_MARGIN_THRESHOLD;
  const ambiguousThreshold = opts.ambiguousScoreThreshold ?? AMBIGUOUS_SCORE_THRESHOLD;

  async function matchReference(
    menuName: string,
    hints: { kind?: string } = {},
  ): Promise<MatchOutcome> {
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
      .map((ref) => ({
        ref,
        score: adjustedScore(menuName, ref, scoreReference(menuName, ref)),
      }))
      .sort((a, b) => b.score - a.score || providerRank(a.ref.provider) - providerRank(b.ref.provider));

    const best = scored[0]!;
    const runnerUp = scored[1];
    // BaoWio rows are unit-suspect (mixed serving conventions) — they may lead
    // the picker but never auto-select (F2).
    const bestCanAuto = best.ref.provider !== "baowio";
    if (
      bestCanAuto &&
      best.score >= autoThreshold &&
      (runnerUp === undefined || best.score - runnerUp.score >= marginThreshold)
    ) {
      if (!caloriesInKindBand(hints.kind, best.ref.per100.calories)) {
        return {
          tier: "ambiguous",
          candidates: scored.slice(0, 3).map((s) => ({ ...s.ref, score: s.score })),
        };
      }
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
        .sort((a, b) => b.similarity - a.similarity || providerRank(a.provider) - providerRank(b.provider));
      const ranked = vectorHits.map((hit) => ({
        hit,
        adjusted: hit.similarity - vectorHandicapStep(hit.provider) * VECTOR_PROVIDER_HANDICAP,
      }));
      const bestEntry = ranked[0];
      const runnerUpEntry = ranked[1];
      if (bestEntry) {
        // F2: a BaoWio row leading the vector hits goes to the picker as-is.
        if (
          bestEntry.hit.provider !== "baowio" &&
          bestEntry.adjusted >= VECTOR_AUTO_THRESHOLD &&
          (runnerUpEntry === undefined ||
            bestEntry.adjusted - runnerUpEntry.adjusted >= VECTOR_MARGIN_THRESHOLD)
        ) {
          if (!caloriesInKindBand(hints.kind, bestEntry.hit.per100.calories)) {
            return {
              tier: "ambiguous",
              candidates: vectorHits.slice(0, 3).map((hit) => ({ ...hit, score: hit.similarity })),
            };
          }
          return { tier: "auto", reference: bestEntry.hit, score: bestEntry.hit.similarity };
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
