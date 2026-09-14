// Nutrition Estimation V1 orchestration (design spec §1, §7, §8; ADR 0011, 0012,
// 0016, 0020, 0022). Persists Meal Observations, runs tiered reference matching,
// calculates estimates via the domain engine, and dual-writes confirmed central
// values into nutrition_logs with provenance markers.
import { calculateNutrition } from "./calculation/engine";
import {
  COMPONENT_KINDS,
  QUARTILE_FRACTIONS,
  type CalculationResult,
  type ComponentKind,
  type IngredientEvidence,
  type LatentHint,
  type MassRange,
  type MatchTier,
  type PortionComponentInput,
  type PortionMode,
  type ReferenceMacros,
} from "./types";
import type {
  CreateObservationInput,
  MealType,
  ObservationDetail,
  PersistedObservation,
  PersistedRevision,
  NutritionEstimationRepository,
} from "../repositories/nutrition-estimation.repository";
import { scoreReference, type ReferenceRow } from "./matching/matcher";
import { ValidationError, NotFoundError, ConflictError } from "../lib/errors";
import type { InterpretOutcome } from "./vlm/deepseek-vision";

export interface MatcherLike {
  matchReference(menuName: string): Promise<MatchOutcomeLike>;
}

export type MatchOutcomeLike =
  | { tier: "auto"; reference: ReferenceRow; score: number }
  | { tier: "ambiguous"; candidates: Array<ReferenceRow & { score: number }> }
  | { tier: "gap" };

export interface InterpreterLike {
  interpret(input: {
    menuName: string;
    beforeImageBase64?: string;
    afterImageBase64?: string;
  }): Promise<InterpretOutcome>;
}

export interface ServiceComponentInput {
  name: string;
  kind: ComponentKind;
  /** measured = point number; estimated = MassRange. */
  weight_g: number | MassRange;
  consumed_fraction?: number;
  ingredient_evidence?: IngredientEvidence[];
  latent_hints?: LatentHint[];
}

export interface CreateObservationServiceInput {
  date?: string;
  meal: MealType;
  menu_name: string;
  portion_mode: "measured" | "estimated";
  meal_source?: string;
  components: ServiceComponentInput[];
  reference_id?: number;
  /**
   * An after image was provided and fractions were confirmed against it → any
   * fraction in (0, 1] is accepted. Without one, only the fixed quartile
   * choices are allowed (design spec §3, ADR 0015).
   */
  has_after_image?: boolean;
}

export type CreateObservationMatch =
  | { tier: "manual" | "auto"; reference: ReferenceRow }
  | { tier: "ambiguous"; candidates: Array<ReferenceRow & { score: number }> }
  | { tier: "gap" };

export interface CreateObservationResult {
  observation: ObservationDetail;
  match: CreateObservationMatch;
  /** Per-observation explanation flags (design spec §6). */
  explanation: ObservationExplanation;
}

export interface CalculateForReferenceResult {
  observation: ObservationDetail;
  revision: PersistedRevision;
  reference: ReferenceRow | null;
  /** Per-observation explanation flags (design spec §6). */
  explanation: ObservationExplanation;
}

/**
 * Explanation payload returned alongside estimates (design spec §6): the
 * reference used with provider and version, and the per-observation flags —
 * measured/estimated mode, relaxed assumptions, manually entered fields.
 * Persisted calculation jsonb stays engine-shaped; this is the response view.
 */
export interface ObservationExplanation {
  reference: { id: number; provider: string; version: string } | null;
  portion_mode: PortionMode;
  /** Soft constraints were relaxed during calculation (ADR 0019). */
  relaxed: boolean;
  relaxed_constraints: string[];
  /** Any component carries manually entered ingredient evidence. */
  manually_entered_fields: boolean;
  components: Array<{ name: string; manually_entered_fields: boolean }>;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// ——— Reference search (pending-meal resolution picker, design spec §7) ———

/** Flat search-result item; snake_case to match the catalog's API surface. */
export interface ReferenceSearchItem {
  id: number;
  provider: string;
  provider_food_code: string;
  version: string;
  name_th: string | null;
  name_en: string | null;
  protein: number;
  carbs: number;
  fat: number;
  alcohol: number;
  calories: number;
}

export interface ReferenceSearchResult {
  items: ReferenceSearchItem[];
}

const SEARCH_DEFAULT_LIMIT = 10;
const SEARCH_MAX_LIMIT = 25;

function clampSearchLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return SEARCH_DEFAULT_LIMIT;
  return Math.min(SEARCH_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function toSearchItem(row: ReferenceRow): ReferenceSearchItem {
  return {
    id: row.id,
    provider: row.provider,
    provider_food_code: row.providerFoodCode,
    version: row.version,
    name_th: row.nameTh,
    name_en: row.nameEn,
    protein: row.per100.protein,
    carbs: row.per100.carbs,
    fat: row.per100.fat,
    alcohol: row.per100.alcohol,
    calories: row.per100.calories,
  };
}

/**
 * Explanation payload for an observation detail (design spec §6): the reference
 * used with provider and version, and the per-observation flags. Persisted
 * calculation jsonb stays engine-shaped; this is the response view attached by
 * the service to create/GET/recalculate payloads.
 */
function buildExplanation(
  detail: ObservationDetail,
  calculation: CalculationResult | null,
  reference: ReferenceRow | null = detail.reference,
): ObservationExplanation {
  return {
    reference: reference
      ? { id: reference.id, provider: reference.provider, version: reference.version }
      : null,
    portion_mode: detail.portion_mode,
    relaxed: calculation?.relaxed ?? false,
    relaxed_constraints: calculation?.relaxed_constraints ?? [],
    // Ingredient evidence present = manually entered fields on that component.
    manually_entered_fields: detail.components.some((c) => c.ingredient_evidence.length > 0),
    components: detail.components.map((c) => ({
      name: c.name,
      manually_entered_fields: c.ingredient_evidence.length > 0,
    })),
  };
}

/** Observation detail enriched with the response-level explanation payload. */
export type ObservationDetailWithExplanation = ObservationDetail & {
  explanation: ObservationExplanation;
};

function withExplanation(detail: ObservationDetail): ObservationDetailWithExplanation {
  const calculation = detail.latest_revision?.calculation ?? detail.calculation;
  return { ...detail, explanation: buildExplanation(detail, calculation) };
}

function isMassRange(value: number | MassRange): value is MassRange {
  return typeof value === "object" && value !== null;
}

function isValidRange(range: MassRange): boolean {
  return (
    Number.isFinite(range.low) &&
    Number.isFinite(range.central) &&
    Number.isFinite(range.high) &&
    range.low > 0 &&
    range.low <= range.central &&
    range.central <= range.high
  );
}

function evidenceBounds(grams: number | MassRange): MassRange {
  return typeof grams === "number"
    ? { low: grams, central: grams, high: grams }
    : grams;
}

/**
 * Obvious evidence-vs-component conflicts are rejected at entry (design spec
 * §5): an ingredient whose central grams exceed the component's central weight,
 * or measured evidence sitting entirely above a measured component weight.
 * Borderline interval cases are left to the engine's soft relaxation (ADR 0019).
 */
function validateEvidenceConflicts(
  components: Array<Pick<PortionComponentInput, "name" | "weight_g" | "ingredient_evidence">>,
): void {
  for (const component of components) {
    const weight = isMassRange(component.weight_g)
      ? component.weight_g
      : { low: component.weight_g, central: component.weight_g, high: component.weight_g };
    for (const evidence of component.ingredient_evidence ?? []) {
      const grams = evidenceBounds(evidence.grams);
      // Measured evidence entirely above the component weight conflicts at
      // every bound — the strongest statement, reported first.
      if (evidence.source === "measured" && grams.low > weight.high) {
        throw new ValidationError(
          `Measured ingredient '${evidence.name}' (${grams.low}g) exceeds component '${component.name}' (${weight.high}g) at every bound.`,
        );
      }
      if (grams.central > weight.central) {
        throw new ValidationError(
          `Ingredient '${evidence.name}' (${grams.central}g) exceeds component '${component.name}' (${weight.central}g central).`,
        );
      }
    }
  }
}

/**
 * Structural pre-check (ADR 0019): hard facts alone — measured component
 * weights, measured ingredient evidence, confirmed consumed fractions — must
 * admit a feasible mass decomposition. Per100 is irrelevant to feasibility, so
 * a zero baseline keeps the engine's structural checks only; soft evidence is
 * relaxed inside the engine, never thrown here. Runs even when no reference
 * exists yet (gap/ambiguous tiers never reach a real calculation).
 */
const FEASIBILITY_ONLY_REFERENCE: ReferenceMacros = {
  per100: { protein: 0, carbs: 0, fat: 0, alcohol: 0, calories: 0 },
};

function assertMassFeasible(components: PortionComponentInput[]): void {
  calculateNutrition(components, FEASIBILITY_ONLY_REFERENCE);
}

function validateComponents(
  components: ServiceComponentInput[],
  portionMode: "measured" | "estimated",
  hasAfterImage: boolean,
): PortionComponentInput[] {
  if (components.length === 0) {
    throw new ValidationError("At least one component is required.");
  }

  const normalized: PortionComponentInput[] = components.map((c) => {
    const name = typeof c.name === "string" ? c.name.trim() : "";
    if (!name) {
      throw new ValidationError("Every component requires a name.");
    }
    const kind = COMPONENT_KINDS.includes(c.kind) ? c.kind : "other";
    const fraction = c.consumed_fraction ?? 1;
    if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
      throw new ValidationError(
        `consumed_fraction for '${name}' must be within (0, 1].`,
      );
    }
    // Without an after image the fraction comes from the fixed quartile
    // choices — all / ¾ / ½ / ¼ (design spec §3, ADR 0015).
    if (
      !hasAfterImage &&
      !QUARTILE_FRACTIONS.some((q) => Math.abs(fraction - q) < 1e-9)
    ) {
      throw new ValidationError(
        `consumed_fraction for '${name}' must be one of ${QUARTILE_FRACTIONS.join(", ")} when no after image is provided.`,
      );
    }
    if (isMassRange(c.weight_g)) {
      if (!isValidRange(c.weight_g)) {
        throw new ValidationError(
          `Estimated weight for '${name}' must satisfy 0 < low <= central <= high.`,
        );
      }
      if (portionMode === "measured") {
        throw new ValidationError(
          `Measured mode requires a point weight for '${name}', not a range.`,
        );
      }
    } else {
      if (!Number.isFinite(c.weight_g) || c.weight_g < 0) {
        throw new ValidationError(`Weight for '${name}' must be a non-negative number.`);
      }
      if (portionMode === "measured" && c.weight_g === 0) {
        throw new ValidationError(
          `Measured mode requires at least one non-zero measured weight ('${name}').`,
        );
      }
    }
    return {
      name,
      kind,
      weight_g: c.weight_g,
      consumed_fraction: fraction,
      ...(c.ingredient_evidence ? { ingredient_evidence: c.ingredient_evidence } : {}),
      ...(c.latent_hints ? { latent_hints: c.latent_hints } : {}),
    };
  });

  if (portionMode === "estimated") {
    const hasEstimated = normalized.some((c) => isMassRange(c.weight_g));
    if (!hasEstimated) {
      throw new ValidationError(
        "Estimated mode requires at least one component with an estimated weight range.",
      );
    }
  }
  return normalized;
}

/** Rebuild PortionComponentInputs from persisted rows (for recalculation). */
function componentsFromDetail(detail: ObservationDetail): PortionComponentInput[] {
  return detail.components.map((c) => {
    const weight_g: number | MassRange =
      c.weight_mode === "measured"
        ? (c.weight_central ?? 0)
        : {
            low: c.weight_low ?? c.weight_central ?? 0,
            central: c.weight_central ?? 0,
            high: c.weight_high ?? c.weight_central ?? 0,
          };
    const ingredient_evidence: IngredientEvidence[] | undefined = c.ingredient_evidence.length
      ? c.ingredient_evidence.map((e) => {
          const hasRange =
            e.grams_low !== null &&
            e.grams_high !== null &&
            e.grams_low !== e.grams_high &&
            e.grams_central !== null;
          return {
            name: e.name,
            source: e.source as IngredientEvidence["source"],
            basis: e.basis as IngredientEvidence["basis"],
            grams: hasRange
              ? { low: e.grams_low!, central: e.grams_central!, high: e.grams_high! }
              : (e.grams_central ?? 0),
            ...(e.per100 ? { per100: e.per100 } : {}),
          };
        })
      : undefined;
    const latent_hints: LatentHint[] | undefined = c.latent_hints.length
      ? c.latent_hints.map((h) => ({
          kind: h.kind as LatentHint["kind"],
          level: h.level as LatentHint["level"],
        }))
      : undefined;
    return {
      name: c.name,
      kind: c.kind as ComponentKind,
      weight_g,
      consumed_fraction: c.consumed_fraction,
      ...(ingredient_evidence ? { ingredient_evidence } : {}),
      ...(latent_hints ? { latent_hints } : {}),
    };
  });
}

export function createNutritionEstimationService(deps: {
  repo: NutritionEstimationRepository;
  matcher: MatcherLike;
  interpreter?: InterpreterLike;
}) {
  const { repo, matcher, interpreter } = deps;

  /** Central values of the latest calculation, for the ADR 0022 dual-write. */
  function centralValues(calculation: CalculationResult) {
    return {
      protein: calculation.nutrients.protein.central,
      carbs: calculation.nutrients.carbs.central,
      fat: calculation.nutrients.fat.central,
      alcohol: calculation.nutrients.alcohol.central,
      calories: calculation.nutrients.calories.central,
    };
  }

  async function createObservation(
    input: CreateObservationServiceInput,
  ): Promise<CreateObservationResult> {
    const menuName = typeof input.menu_name === "string" ? input.menu_name.trim() : "";
    if (!menuName) {
      throw new ValidationError("menu_name is required.");
    }
    const portionMode = input.portion_mode === "measured" ? "measured" : "estimated";
    const hasAfterImage = input.has_after_image ?? false;
    const components = validateComponents(input.components ?? [], portionMode, hasAfterImage);
    validateEvidenceConflicts(components);
    assertMassFeasible(components);
    const date = input.date ?? todayDateString();
    const mealType: MealType = input.meal;

    const toRepoInput = (
      status: CreateObservationInput["status"],
      referenceId: number | null,
      matchTier: MatchTier,
      calculation: CalculationResult | null,
    ): CreateObservationInput => ({
      date,
      meal_type: mealType,
      menu_name: menuName,
      portion_mode: portionMode,
      meal_source: input.meal_source ?? null,
      status,
      reference_id: referenceId,
      match_tier: matchTier,
      calculation,
      components: components.map((c, i) => {
        const range = isMassRange(c.weight_g)
          ? { low: c.weight_g.low, central: c.weight_g.central, high: c.weight_g.high }
          : { low: c.weight_g, central: c.weight_g, high: c.weight_g };
        return {
          name: c.name,
          kind: c.kind,
          weight_mode: isMassRange(c.weight_g) ? "estimated" : "measured",
          weight_low: range.low,
          weight_central: range.central,
          weight_high: range.high,
          consumed_fraction: c.consumed_fraction,
          position: i,
          ingredient_evidence: c.ingredient_evidence?.map((e) => {
            const grams = e.grams;
            const range =
              typeof grams === "number"
                ? { low: grams, central: grams, high: grams }
                : grams;
            return {
              name: e.name,
              source: e.source,
              basis: e.basis,
              grams_low: range.low,
              grams_central: range.central,
              grams_high: range.high,
              per100: e.per100 ?? null,
            };
          }),
          latent_hints: c.latent_hints?.map((h) => ({ kind: h.kind, level: h.level })),
        };
      }),
    });

    /** Shared manual/auto path: calculate, persist the draft, save a revision. */
    async function persistCalculatedDraft(
      reference: ReferenceRow,
      tier: "manual" | "auto",
    ): Promise<CreateObservationResult> {
      const calculation = calculateNutrition(components, { per100: reference.per100 });
      const observationId = await repo.insertObservation(
        toRepoInput("draft", reference.id, tier, calculation),
      );
      await repo.insertRevision({
        observation_id: observationId,
        reference_id: reference.id,
        reference_provider: reference.provider,
        reference_version: reference.version,
        calculation,
      });
      const detail = (await repo.getObservationDetail(observationId))!;
      return {
        observation: detail,
        match: { tier, reference },
        explanation: buildExplanation(detail, calculation),
      };
    }

    /** Reference-pending path: no reference persisted, no calculation. */
    async function persistReferencePending(
      match: Extract<MatchOutcomeLike, { tier: "ambiguous" | "gap" }>,
    ): Promise<CreateObservationResult> {
      const observationId = await repo.insertObservation(
        toRepoInput("reference_pending", null, match.tier, null),
      );
      const detail = (await repo.getObservationDetail(observationId))!;
      return {
        observation: detail,
        match,
        explanation: buildExplanation(detail, null),
      };
    }

    // Manual reference selection skips matching entirely.
    if (input.reference_id !== undefined) {
      const reference = await repo.getReferenceById(input.reference_id);
      if (!reference) {
        throw new ValidationError(`Reference ${input.reference_id} not found.`);
      }
      return await persistCalculatedDraft(reference, "manual");
    }

    const match = await matcher.matchReference(menuName);

    if (match.tier === "auto") {
      return await persistCalculatedDraft(match.reference, "auto");
    }

    // Ambiguous: candidates go back to the caller for selection. Gap: Reference
    // Coverage Gap → Reference-Pending Meal, no fabricated macros. Either way
    // the observation waits as reference-pending with no reference and no
    // calculation.
    return await persistReferencePending(match);
  }

  /** Recalculate against a chosen reference and save a new pending revision. */
  async function calculateForReference(
    observationId: number,
    referenceId: number,
  ): Promise<CalculateForReferenceResult> {
    const detail = await repo.getObservationDetail(observationId);
    if (!detail) throw new NotFoundError("Meal observation");
    // Re-validate persisted components (spec §5): stored evidence may predate
    // entry validation or conflict with the newly chosen reference.
    const components = componentsFromDetail(detail);
    validateEvidenceConflicts(components);
    const reference = await repo.getReferenceById(referenceId);
    if (!reference) throw new NotFoundError("Nutrition reference");

    const calculation = calculateNutrition(components, {
      per100: reference.per100,
    });

    const revision = await repo.insertRevision({
      observation_id: observationId,
      reference_id: reference.id,
      reference_provider: reference.provider,
      reference_version: reference.version,
      calculation,
    });
    await repo.updateObservationEstimate(observationId, {
      reference_id: reference.id,
      calculation,
    });

    const updated = (await repo.getObservationDetail(observationId))!;
    return {
      observation: updated,
      revision,
      reference,
      explanation: buildExplanation(updated, calculation, reference),
    };
  }

  /**
   * Confirm the latest pending revision: mark it confirmed (superseding older
   * confirmed ones), set the observation confirmed, and dual-write the central
   * point values into nutrition_logs with provenance markers (ADR 0022).
   */
  async function confirmEstimate(observationId: number): Promise<CalculateForReferenceResult> {
    const detail = await repo.getObservationDetail(observationId);
    if (!detail) throw new NotFoundError("Meal observation");

    const revision = detail.latest_revision;
    if (!revision) {
      throw new ConflictError("Observation has no estimate revision to confirm.");
    }
    if (revision.status !== "pending_confirmation") {
      throw new ConflictError(
        `Latest revision is '${revision.status}', not pending_confirmation.`,
      );
    }

    await repo.updateRevisionStatus(revision.id, "confirmed");
    await repo.supersedeConfirmedRevisions(observationId, revision.id);
    await repo.updateObservationStatus(observationId, "confirmed");

    await repo.upsertNutritionLogLink({
      date: detail.date,
      meal: detail.meal_type,
      food_name: detail.menu_name,
      ...centralValues(revision.calculation),
      observation_id: observationId,
    });

    const reference = detail.reference ??
      (revision.reference_id ? await repo.getReferenceById(revision.reference_id) : null);

    return {
      observation: (await repo.getObservationDetail(observationId))!,
      revision: { ...revision, status: "confirmed" },
      reference,
      explanation: buildExplanation(detail, revision.calculation, reference),
    };
  }

  /** Resolve a pending / ambiguous meal by picking a reference explicitly. */
  async function resolveReference(
    observationId: number,
    referenceId: number,
  ): Promise<CalculateForReferenceResult> {
    const detail = await repo.getObservationDetail(observationId);
    if (!detail) throw new NotFoundError("Meal observation");
    if (detail.status === "confirmed") {
      throw new ConflictError("Confirmed observations cannot be re-resolved.");
    }
    const result = await calculateForReference(observationId, referenceId);
    await repo.updateObservationStatus(observationId, "draft");
    const observation = (await repo.getObservationDetail(observationId))!;
    return {
      ...result,
      observation,
      explanation: buildExplanation(observation, result.revision.calculation),
    };
  }

  async function getObservation(id: number): Promise<ObservationDetailWithExplanation> {
    const detail = await repo.getObservationDetail(id);
    if (!detail) throw new NotFoundError("Meal observation");
    return withExplanation(detail);
  }

  async function listPending(): Promise<PersistedObservation[]> {
    return await repo.listPending();
  }

  /**
   * Reference search for the pending-meal resolution picker (design spec §7).
   * The catalog is small (~314 rows), so scoring runs in memory over the full
   * pool from listReferences(): an exact case-insensitive provider_food_code
   * match leads the list (tier 0, score 1), then lexical token overlap via
   * scoreReference (score > 0 only, sorted descending). Empty/whitespace
   * queries return an empty result — not an error — so the picker can render
   * its idle state.
   */
  async function searchReferences(
    query: string,
    limit?: number,
  ): Promise<ReferenceSearchResult> {
    const trimmed = typeof query === "string" ? query.trim() : "";
    if (!trimmed) return { items: [] };

    const cap = clampSearchLimit(limit);
    const pool = await repo.listReferences();

    const codeMatch = pool.find(
      (row) => row.providerFoodCode.toLowerCase() === trimmed.toLowerCase(),
    );
    const lexical = pool
      .filter((row) => row !== codeMatch)
      .map((row) => ({ row, score: scoreReference(trimmed, row) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => toSearchItem(s.row));

    const items = codeMatch
      ? [toSearchItem(codeMatch), ...lexical].slice(0, cap)
      : lexical.slice(0, cap);
    return { items };
  }

  /** Thin pass-through; never throws on failure states (ADR 0017). */
  async function interpret(input: {
    menuName: string;
    beforeImageBase64?: string;
    afterImageBase64?: string;
  }): Promise<InterpretOutcome> {
    if (!interpreter) {
      return { status: "unavailable" };
    }
    return await interpreter.interpret(input);
  }

  return {
    createObservation,
    calculateForReference,
    confirmEstimate,
    resolveReference,
    getObservation,
    listPending,
    searchReferences,
    interpret,
  };
}

export type NutritionEstimationService = ReturnType<typeof createNutritionEstimationService>;
