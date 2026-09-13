// Nutrition Estimation V1 — domain types.
// Vocabulary follows CONTEXT.md ("Nutrition Estimation Language"); semantics per
// docs/nutrition-estimation-v1-design.md §4–§7 and docs/adr/0005, 0006, 0008,
// 0017, 0018, 0019, 0020.

// ——— Canonical vocabularies (single source of truth for routes, service, VLM) ———
export const COMPONENT_KINDS = ["rice", "main", "side", "broth", "other"] as const;
export const EVIDENCE_SOURCES = ["measured", "declared", "user_estimated"] as const;
export const EVIDENCE_BASES = ["raw", "served", "unknown"] as const;
export const PORTION_MODES = ["measured", "estimated"] as const;
export const HINT_KINDS = ["visible_oil", "dryness", "remaining_broth"] as const;
export const HINT_LEVELS = ["none", "low", "medium", "high"] as const;
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
/** Fixed consumed-fraction choices when there is no after image (ADR 0015). */
export const QUARTILE_FRACTIONS = [1, 0.75, 0.5, 0.25] as const;

export type ComponentKind = (typeof COMPONENT_KINDS)[number];
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];
export type IngredientBasis = (typeof EVIDENCE_BASES)[number];
export type PortionMode = (typeof PORTION_MODES)[number];
export type LatentHintKind = (typeof HINT_KINDS)[number];
export type LatentHintLevel = (typeof HINT_LEVELS)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
/** How a reference was attached to an observation (design spec §7). */
export type MatchTier = "manual" | "auto" | "ambiguous" | "gap";

export type Macronutrients = {
  protein: number;
  carbs: number;
  fat: number;
  alcohol: number;
  calories: number;
};

/** Grams. Uncertainty interval on the mass side only (ADR 0018). */
export type MassRange = { low: number; central: number; high: number };

export interface IngredientEvidence {
  name: string;
  /** Provenance; constrains how strongly the quantity narrows the estimate. */
  source: EvidenceSource;
  /** Unknown basis widens uncertainty (no silent raw→served conversion). */
  basis: IngredientBasis;
  /** measured = number; declared/user_estimated may be a range. */
  grams: number | MassRange;
  /**
   * Composition of the ingredient itself; if absent, treated as the same
   * composition as the reference (no macro displacement, mass still allocated).
   */
  per100?: Macronutrients;
}

export interface LatentHint {
  kind: LatentHintKind;
  level: LatentHintLevel;
}

export interface PortionComponentInput {
  name: string;
  kind: ComponentKind;
  /** measured = number (point), estimated = MassRange. */
  weight_g: number | MassRange;
  /** 0..1 point, user-confirmed (ADR 0015/0018); validated by the engine. */
  consumed_fraction: number;
  ingredient_evidence?: IngredientEvidence[];
  latent_hints?: LatentHint[];
}

/** What the matcher/caller passes in (Nutrition Reference Baseline). */
export interface ReferenceMacros {
  per100: Macronutrients;
}

/** A provider-normalized Nutrition Reference Catalog record (ADR 0011, 0020). */
export interface ReferenceRow {
  id: number;
  provider: string;
  providerFoodCode: string;
  version: string;
  nameEn: string | null;
  nameTh: string | null;
  per100: Macronutrients;
}

export interface ComponentBreakdown {
  name: string;
  /** After consumed_fraction applied. */
  consumed_weight_g: MassRange;
  /** Per-nutrient contribution from this component (grams for macros, kcal for calories). */
  contribution: Record<keyof Macronutrients, { low: number; central: number; high: number }>;
}

export interface CalculationResult {
  /** low/central/high per nutrient (grams for macros, kcal for calories). */
  nutrients: Record<keyof Macronutrients, MassRange>;
  /** Soft constraints were relaxed (ADR 0019). */
  relaxed: boolean;
  /** Which ones, e.g. ["visible_oil@rice"]. */
  relaxed_constraints: string[];
  /** Human-readable list of what widened the range. */
  drivers: string[];
  per_component: ComponentBreakdown[];
}

/** Hard constraints conflict; never clamped silently (ADR 0019). */
export class InfeasibleEvidenceError extends Error {
  constructor(public reasons: string[]) {
    super(`Infeasible portion evidence: ${reasons.join("; ")}`);
    this.name = "InfeasibleEvidenceError";
  }
}
