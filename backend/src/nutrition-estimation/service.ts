// Nutrition Estimation V1 orchestration (design spec §1, §7, §8; ADR 0011, 0012,
// 0016, 0020, 0022). Persists Meal Observations, runs tiered reference matching,
// calculates estimates via the domain engine, and dual-writes confirmed central
// values into nutrition_logs with provenance markers.
import {
  calculateNutrition,
} from "./calculation/engine";
import { InfeasibleEvidenceError } from "./types";
import type {
  CalculationResult,
  ComponentKind,
  IngredientEvidence,
  LatentHint,
  MassRange,
  PortionComponentInput,
} from "./types";
import type {
  CreateObservationInput,
  MealType,
  ObservationDetail,
  PersistedObservation,
  PersistedRevision,
  NutritionEstimationRepository,
} from "../repositories/nutrition-estimation.repository";
import type { ReferenceRow } from "./matching/matcher";
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
}

export type CreateObservationMatch =
  | { tier: "manual" | "auto"; reference: ReferenceRow }
  | { tier: "ambiguous"; candidates: Array<ReferenceRow & { score: number }> }
  | { tier: "gap" };

export interface CreateObservationResult {
  observation: ObservationDetail;
  match: CreateObservationMatch;
}

export interface CalculateForReferenceResult {
  observation: ObservationDetail;
  revision: PersistedRevision;
  reference: ReferenceRow | null;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
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

const COMPONENT_KINDS: ComponentKind[] = ["rice", "main", "side", "broth", "other"];

function validateComponents(
  components: ServiceComponentInput[],
  portionMode: "measured" | "estimated",
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
    const components = validateComponents(input.components ?? [], portionMode);
    const date = input.date ?? todayDateString();
    const mealType: MealType = input.meal;

    const toRepoInput = (
      status: CreateObservationInput["status"],
      referenceId: number | null,
      matchTier: string,
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

    // Manual reference selection skips matching entirely.
    if (input.reference_id !== undefined) {
      const reference = await repo.getReferenceById(input.reference_id);
      if (!reference) {
        throw new ValidationError(`Reference ${input.reference_id} not found.`);
      }
      const calculation = calculateNutrition(components, { per100: reference.per100 });
      const observationId = await repo.insertObservation(
        toRepoInput("draft", reference.id, "manual", calculation),
      );
      await repo.insertRevision({
        observation_id: observationId,
        reference_id: reference.id,
        reference_provider: reference.provider,
        reference_version: reference.version,
        calculation,
      });
      return {
        observation: (await repo.getObservationDetail(observationId))!,
        match: { tier: "manual", reference },
      };
    }

    const match = await matcher.matchReference(menuName);

    if (match.tier === "auto") {
      const calculation = calculateNutrition(components, {
        per100: match.reference.per100,
      });
      const observationId = await repo.insertObservation(
        toRepoInput("draft", match.reference.id, "auto", calculation),
      );
      await repo.insertRevision({
        observation_id: observationId,
        reference_id: match.reference.id,
        reference_provider: match.reference.provider,
        reference_version: match.reference.version,
        calculation,
      });
      return {
        observation: (await repo.getObservationDetail(observationId))!,
        match: { tier: "auto", reference: match.reference },
      };
    }

    if (match.tier === "ambiguous") {
      // No reference persisted and no calculation; candidates go back to the
      // caller for selection; the observation waits as reference-pending.
      const observationId = await repo.insertObservation(
        toRepoInput("reference_pending", null, "ambiguous", null),
      );
      return {
        observation: (await repo.getObservationDetail(observationId))!,
        match: { tier: "ambiguous", candidates: match.candidates },
      };
    }

    // Reference Coverage Gap → Reference-Pending Meal, no fabricated macros.
    const observationId = await repo.insertObservation(
      toRepoInput("reference_pending", null, "gap", null),
    );
    return {
      observation: (await repo.getObservationDetail(observationId))!,
      match: { tier: "gap" },
    };
  }

  /** Recalculate against a chosen reference and save a new pending revision. */
  async function calculateForReference(
    observationId: number,
    referenceId: number,
  ): Promise<CalculateForReferenceResult> {
    const detail = await repo.getObservationDetail(observationId);
    if (!detail) throw new NotFoundError("Meal observation");
    const reference = await repo.getReferenceById(referenceId);
    if (!reference) throw new NotFoundError("Nutrition reference");

    const calculation = calculateNutrition(componentsFromDetail(detail), {
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

    return {
      observation: (await repo.getObservationDetail(observationId))!,
      revision,
      reference,
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

    return {
      observation: (await repo.getObservationDetail(observationId))!,
      revision: { ...revision, status: "confirmed" },
      reference: detail.reference ??
        (revision.reference_id ? await repo.getReferenceById(revision.reference_id) : null),
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
    return {
      ...result,
      observation: (await repo.getObservationDetail(observationId))!,
    };
  }

  async function getObservation(id: number): Promise<ObservationDetail> {
    const detail = await repo.getObservationDetail(id);
    if (!detail) throw new NotFoundError("Meal observation");
    return detail;
  }

  async function listPending(): Promise<PersistedObservation[]> {
    return await repo.listPending();
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
    interpret,
    // Exported for completeness — callers may catch it explicitly.
    InfeasibleEvidenceError,
  };
}

export type NutritionEstimationService = ReturnType<typeof createNutritionEstimationService>;
