// Nutrition Estimation V1 orchestration (design spec §1, §7, §8; ADR 0011, 0012,
// 0016, 0020, 0022). Persists Meal Observations, runs tiered reference matching,
// calculates estimates via the domain engine, and dual-writes confirmed central
// values into nutrition_logs with provenance markers.
import { calculateNutrition, calculateNutritionPerComponent } from "./calculation/engine";
import { ESTIMATE_FALLBACK_PER100 } from "./estimate-fallback";
import {
  COMPONENT_KINDS,
  QUARTILE_FRACTIONS,
  type CalculationResult,
  type ComponentKind,
  type ComponentReferenceInfo,
  type IngredientEvidence,
  type LatentHint,
  type Macronutrients,
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
import { providerRank, scoreReference, type ReferenceRow } from "./matching/matcher";
import { ValidationError, NotFoundError, ConflictError } from "../lib/errors";
import type { InterpretOutcome } from "./vlm/deepseek-vision";

export interface MatcherLike {
  matchReference(menuName: string, hints?: { kind?: string }): Promise<MatchOutcomeLike>;
}

export type MatchOutcomeLike =
  | { tier: "auto"; reference: ReferenceRow; score: number }
  | { tier: "ambiguous"; candidates: Array<ReferenceRow & { score: number }> }
  | { tier: "gap" };

/** Per-component matching outcome (ADR 0026): the chosen per-100 g source. */
interface ComponentResolution {
  per100: Macronutrients;
  estimated: boolean;
  /** Full matched catalog row, when the component is reference-backed. */
  row?: ReferenceRow;
  score?: number;
}

export interface InterpreterLike {
  interpret(input: {
    menuName: string;
    beforeImageBase64?: string;
    afterImageBase64?: string;
    userNote?: string;
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
  /** Owning user (resolved from the JWT in app.ts). */
  user_id: number;
  date?: string;
  meal: MealType;
  menu_name: string;
  portion_mode: "measured" | "estimated";
  meal_source?: string;
  /** Human portion estimates/constraints sent at interpret time (ADR 0028). */
  user_note?: string;
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
  /** pgvector similarity — present only on vector-tier results (ADR 0014). */
  score?: number;
}

export interface ReferenceSearchResult {
  items: ReferenceSearchItem[];
}

const SEARCH_DEFAULT_LIMIT = 10;
const SEARCH_MAX_LIMIT = 25;
// Exploratory search floor, deliberately below the matcher's 0.7 ambiguous
// bar: the user judges the list themselves, so anything plausibly related is
// worth surfacing (calibrated 2026-09-29: unrelated queries score 0.60-0.73,
// true items 0.75+). Auto-matching keeps its stricter thresholds.
const SEARCH_VECTOR_FLOOR = 0.65;

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

// ponytail: fixed 0.5 for raw substring hits in the search picker — enough to
// rank them below full token overlap without touching matcher thresholds.
// Semantic recall stays with the pgvector fallback (ADR 0014, matcher blend).
const SUBSTRING_SCORE = 0.5;

function substringScore(row: ReferenceRow, trimmed: string, lowered: string): number {
  if (row.nameTh?.includes(trimmed) || row.nameEn?.toLowerCase().includes(lowered)) {
    return SUBSTRING_SCORE;
  }
  return 0;
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
  /** Query embedder for the search vector tier (ADR 0014); omitted → lexical only. */
  embed?: (text: string) => Promise<number[]>;
}) {
  const { repo, matcher, interpreter, embed } = deps;

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
      user_id: input.user_id,
      date,
      meal_type: mealType,
      menu_name: menuName,
      portion_mode: portionMode,
      meal_source: input.meal_source ?? null,
      user_note: input.user_note?.trim() || null,
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

    /** Shared manual path: one user-chosen reference for the whole meal. */
    async function persistCalculatedDraft(
      reference: ReferenceRow,
      tier: "manual",
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
      const detail = (await repo.getObservationDetail(observationId, input.user_id))!;
      return {
        observation: detail,
        match: { tier, reference },
        explanation: buildExplanation(detail, calculation),
      };
    }

    /**
     * ADR 0026: match each component against the catalog on its own name.
     * Anything without a usable reference — no match, an ambiguous tie, or a
     * zero-composition row — is calculated from its kind prior instead of
     * blocking the save, so the observation never enters reference_pending
     * and always produces numbers.
     */
    async function persistPerComponentDraft(): Promise<CreateObservationResult> {
      const resolutions: ComponentResolution[] = [];
      const estimateNotes: string[] = [];
      for (const component of components) {
        const match = await matcher.matchReference(component.name, { kind: component.kind });
        if (match.tier === "auto" && match.reference.per100.calories > 0) {
          resolutions.push({
            per100: match.reference.per100,
            estimated: false,
            row: match.reference,
            score: match.score,
          });
          continue;
        }
        const kind = component.kind;
        let reason: string;
        if (match.tier === "auto") {
          reason = "zero-kcal reference";
        } else if (match.tier === "ambiguous") {
          const names = match.candidates
            .map((c) => c.nameTh ?? c.nameEn ?? `#${c.id}`)
            .join(", ");
          reason = `ambiguous reference (candidates: ${names})`;
        } else {
          reason = "no reference match";
        }
        estimateNotes.push(
          `${reason} for '${component.name}' — estimated from '${kind}' prior`,
        );
        resolutions.push({ per100: ESTIMATE_FALLBACK_PER100[kind], estimated: true });
      }

      const tier: "auto" | "gap" = resolutions.every((r) => !r.estimated) ? "auto" : "gap";
      const calculation = calculateNutritionPerComponent(components, (_c, i) => resolutions[i]!.per100);
      calculation.drivers.push(...estimateNotes);
      calculation.per_component = calculation.per_component.map((pc, i) => {
        const r = resolutions[i]!;
        return {
          ...pc,
          estimated: r.estimated,
          reference: r.row
            ? {
                id: r.row.id,
                provider: r.row.provider,
                provider_food_code: r.row.providerFoodCode,
                name_th: r.row.nameTh,
                name_en: r.row.nameEn,
                score: r.score ?? 0,
              }
            : null,
        };
      });

      const primary = resolutions.find((r) => r.row)?.row ?? null;
      const observationId = await repo.insertObservation(
        toRepoInput("draft", primary?.id ?? null, tier, calculation),
      );
      await repo.insertRevision({
        observation_id: observationId,
        reference_id: primary?.id ?? null,
        reference_provider: primary?.provider ?? null,
        reference_version: primary?.version ?? null,
        calculation,
      });
      const detail = (await repo.getObservationDetail(observationId, input.user_id))!;
      return {
        observation: detail,
        match: tier === "auto" && primary ? { tier: "auto", reference: primary } : { tier: "gap" },
        explanation: buildExplanation(detail, calculation),
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

    return await persistPerComponentDraft();
  }

  /** Recalculate against a chosen reference and save a new pending revision. */
  async function calculateForReference(
    observationId: number,
    referenceId: number,
    userId: number,
  ): Promise<CalculateForReferenceResult> {
    const detail = await repo.getObservationDetail(observationId, userId);
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
    }, userId);

    const updated = (await repo.getObservationDetail(observationId, userId))!;
    return {
      observation: updated,
      revision,
      reference,
      explanation: buildExplanation(updated, calculation, reference),
    };
  }

  /**
   * Resolve ONE component's reference (ADR 0026): the chosen reference backs
   * that component, every other component keeps its existing sourcing
   * (matched reference or kind prior), and a new revision persists the
   * recalculation. On a confirmed observation (the ADR 0030 auto-confirm flow
   * makes every save confirmed) the correction re-finalizes: the new revision
   * is marked confirmed, older confirmed ones are superseded, and
   * nutrition_logs is re-dual-written so daily totals follow the fix.
   */
  async function resolveComponentReference(
    observationId: number,
    position: number,
    referenceId: number,
    userId: number,
  ): Promise<CalculateForReferenceResult> {
    const detail = await repo.getObservationDetail(observationId, userId);
    if (!detail) throw new NotFoundError("Meal observation");
    const wasConfirmed = detail.status === "confirmed";
    const components = componentsFromDetail(detail);
    if (position < 0 || position >= components.length) {
      throw new ValidationError("Component position is out of range.");
    }
    validateEvidenceConflicts(components);
    const reference = await repo.getReferenceById(referenceId);
    if (!reference) throw new NotFoundError("Nutrition reference");

    const prevPerComponent = detail.latest_revision?.calculation?.per_component ?? [];
    const notes: string[] = [];
    const per100s: Macronutrients[] = [];
    const references: Array<ComponentReferenceInfo | null> = [];
    const estimatedFlags: boolean[] = [];

    for (let i = 0; i < components.length; i++) {
      if (i === position) {
        per100s.push(reference.per100);
        references.push({
          id: reference.id,
          provider: reference.provider,
          provider_food_code: reference.providerFoodCode,
          name_th: reference.nameTh,
          name_en: reference.nameEn,
          score: 1,
        });
        estimatedFlags.push(false);
        continue;
      }
      const prevRefId = prevPerComponent[i]?.reference?.id ?? null;
      const prevRef = prevRefId !== null ? await repo.getReferenceById(prevRefId) : null;
      if (prevRef) {
        per100s.push(prevRef.per100);
        references.push(prevPerComponent[i]!.reference ?? null);
        estimatedFlags.push(false);
        continue;
      }
      per100s.push(ESTIMATE_FALLBACK_PER100[components[i]!.kind]);
      references.push(null);
      estimatedFlags.push(true);
    }

    const calculation = calculateNutritionPerComponent(components, (_c, i) => per100s[i]!);
    notes.push(`component '${components[position]!.name}' reference set manually`);
    calculation.drivers.push(...notes);
    calculation.per_component = calculation.per_component.map((pc, i) => ({
      ...pc,
      estimated: estimatedFlags[i]!,
      reference: references[i],
    }));

    const revision = await repo.insertRevision({
      observation_id: observationId,
      reference_id: null,
      reference_provider: null,
      reference_version: null,
      calculation,
    });
    await repo.updateObservationEstimate(observationId, {
      reference_id: null,
      calculation,
    }, userId);

    if (wasConfirmed) {
      // Re-finalize the correction: the meal is already logged, so the new
      // revision supersedes the confirmed one and nutrition_logs is re-dual-
      // written — otherwise daily totals would keep the pre-fix values.
      await repo.updateRevisionStatus(revision.id, "confirmed");
      await repo.supersedeConfirmedRevisions(observationId, revision.id);
      await repo.upsertNutritionLogLink({
        user_id: userId,
        date: detail.date,
        meal: detail.meal_type,
        food_name: detail.menu_name,
        ...centralValues(calculation),
        observation_id: observationId,
      });
    } else if (detail.status !== "draft") {
      await repo.updateObservationStatus(observationId, "draft", userId);
    }

    const updated = (await repo.getObservationDetail(observationId, userId))!;
    return {
      observation: updated,
      revision: wasConfirmed ? { ...revision, status: "confirmed" } : revision,
      reference,
      explanation: buildExplanation(updated, calculation),
    };
  }

  /**
   * Confirm the latest pending revision: mark it confirmed (superseding older
   * confirmed ones), set the observation confirmed, and dual-write the central
   * point values into nutrition_logs with provenance markers (ADR 0022).
   */
  async function confirmEstimate(observationId: number, userId: number): Promise<CalculateForReferenceResult> {
    const detail = await repo.getObservationDetail(observationId, userId);
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

    // Ownership was already established by the scoped getObservationDetail
    // above; the revision tables carry no user_id, so this is the boundary.
    await repo.updateRevisionStatus(revision.id, "confirmed");
    await repo.supersedeConfirmedRevisions(observationId, revision.id);
    await repo.updateObservationStatus(observationId, "confirmed", userId);

    await repo.upsertNutritionLogLink({
      user_id: userId,
      date: detail.date,
      meal: detail.meal_type,
      food_name: detail.menu_name,
      ...centralValues(revision.calculation),
      observation_id: observationId,
    });

    const reference = detail.reference ??
      (revision.reference_id ? await repo.getReferenceById(revision.reference_id) : null);

    return {
      observation: (await repo.getObservationDetail(observationId, userId))!,
      revision: { ...revision, status: "confirmed" },
      reference,
      explanation: buildExplanation(detail, revision.calculation, reference),
    };
  }

  /** Resolve a pending / ambiguous meal by picking a reference explicitly. */
  async function resolveReference(
    observationId: number,
    referenceId: number,
    userId: number,
  ): Promise<CalculateForReferenceResult> {
    const detail = await repo.getObservationDetail(observationId, userId);
    if (!detail) throw new NotFoundError("Meal observation");
    if (detail.status === "confirmed") {
      throw new ConflictError("Confirmed observations cannot be re-resolved.");
    }
    const result = await calculateForReference(observationId, referenceId, userId);
    await repo.updateObservationStatus(observationId, "draft", userId);
    const observation = (await repo.getObservationDetail(observationId, userId))!;
    return {
      ...result,
      observation,
      explanation: buildExplanation(observation, result.revision.calculation),
    };
  }

  async function getObservation(id: number, userId: number): Promise<ObservationDetailWithExplanation> {
    const detail = await repo.getObservationDetail(id, userId);
    if (!detail) throw new NotFoundError("Meal observation");
    return withExplanation(detail);
  }

  async function listPending(userId: number): Promise<PersistedObservation[]> {
    return await repo.listPending(userId);
  }

  /**
   * Reference search for the pending-meal resolution picker (design spec §7).
   * The catalog is small (~314 rows), so scoring runs in memory over the full
   * pool from listReferences(): an exact case-insensitive provider_food_code
   * match leads the list (tier 0, score 1), then lexical token overlap via
   * scoreReference, with a raw substring fallback so partial Thai/English
   * names still resolve (score > 0 only, sorted descending). Empty/whitespace
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
    const lowered = trimmed.toLowerCase();
    const pool = await repo.listReferences();

    const codeMatch = pool.find(
      (row) => row.providerFoodCode.toLowerCase() === lowered,
    );
    const lexical = pool
      .filter((row) => row !== codeMatch)
      .map((row) => ({
        row,
        score: scoreReference(trimmed, row) || substringScore(row, trimmed, lowered),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || providerRank(a.row.provider) - providerRank(b.row.provider))
      .map((s) => toSearchItem(s.row));

    const items = codeMatch
      ? [toSearchItem(codeMatch), ...lexical].slice(0, cap)
      : lexical.slice(0, cap);

    // Vector tier (ADR 0014, own similarity scale): when lexical/substring
    // results leave headroom, pgvector neighbors fill the rest — the fix for
    // "ค้นไม่เจอ" queries that used to dead-end at zero rows.
    if (
      items.length < cap &&
      embed &&
      typeof repo.searchByEmbedding === "function"
    ) {
      const queryEmbedding = await embed(trimmed);
      const hits = await repo.searchByEmbedding(queryEmbedding, cap);
      const seen = new Set(items.map((item) => item.id));
      const vectorItems = hits
        .filter((hit) => hit.similarity >= SEARCH_VECTOR_FLOOR && !seen.has(hit.id))
        .sort((a, b) => b.similarity - a.similarity || providerRank(a.provider) - providerRank(b.provider))
        .slice(0, cap - items.length)
        .map((hit) => ({ ...toSearchItem(hit), score: hit.similarity }));
      items.push(...vectorItems);
    }
    return { items };
  }

  /** Thin pass-through; never throws on failure states (ADR 0017). */
  async function interpret(input: {
    menuName: string;
    beforeImageBase64?: string;
    afterImageBase64?: string;
    userNote?: string;
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
    resolveComponentReference,
    getObservation,
    listPending,
    searchReferences,
    interpret,
  };
}

export type NutritionEstimationService = ReturnType<typeof createNutritionEstimationService>;
