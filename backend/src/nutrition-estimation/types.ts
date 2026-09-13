// Nutrition Estimation V1 — domain types.
// Vocabulary follows CONTEXT.md ("Nutrition Estimation Language"); semantics per
// docs/nutrition-estimation-v1-design.md §4–§7 and docs/adr/0005, 0006, 0008,
// 0017, 0018, 0019, 0020.

export type ComponentKind = "rice" | "main" | "side" | "broth" | "other";
export type EvidenceSource = "measured" | "declared" | "user_estimated";
export type IngredientBasis = "raw" | "served" | "unknown";
export type PortionMode = "measured" | "estimated";
export type LatentHintKind = "visible_oil" | "dryness" | "remaining_broth";
export type LatentHintLevel = "none" | "low" | "medium" | "high";
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

export interface ComponentBreakdown {
  name: string;
  /** After consumed_fraction applied. */
  consumed_weight_g: MassRange;
  /** Calories from this component. */
  contribution: { low: number; central: number; high: number };
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
