// ResolvedEstimate (design spec §6): the displayed estimate bundle shared by
// LogMealModal and PendingMealDialog, with one derivation per response shape so
// the calculation/explanation/reference triple always agrees.
import type {
    CalculationResult,
    CalculateObservationOutcome,
    CreateOutcome,
    MealComponentRow,
    MealObservationReference,
    ObservationDetailWithExplanation,
    ObservationExplanation,
} from "@/types";

/**
 * What the range panel renders: the calculation, the explanation payload, the
 * reference used, and the persisted components (name + consumed fraction)
 * backing the per-component breakdown rows.
 */
export interface ResolvedEstimate {
    calculation: CalculationResult;
    explanation: ObservationExplanation;
    reference: MealObservationReference | null;
    components: Array<Pick<MealComponentRow, "name" | "consumed_fraction">>;
}

function componentFractions(components: MealComponentRow[]): ResolvedEstimate["components"] {
    return components.map((c) => ({ name: c.name, consumed_fraction: c.consumed_fraction }));
}

/** Estimate from a create response — only manual/auto tiers carry a calculation. */
export function estimateFromCreateOutcome(outcome: CreateOutcome): ResolvedEstimate | null {
    const calculation = outcome.observation.calculation;
    if (!calculation) return null;
    return {
        calculation,
        explanation: outcome.explanation,
        reference:
            outcome.match.tier === "manual" || outcome.match.tier === "auto"
                ? outcome.match.reference
                : null,
        components: componentFractions(outcome.observation.components),
    };
}

/** Estimate from an observation detail (pending-meal dialog). */
export function estimateFromDetail(detail: ObservationDetailWithExplanation): ResolvedEstimate | null {
    const calculation = detail.latest_revision?.calculation ?? detail.calculation;
    if (!calculation) return null;
    return {
        calculation,
        explanation: detail.explanation,
        reference: detail.reference,
        components: componentFractions(detail.components),
    };
}

/** A resolve/confirm response always carries the recalculated estimate. */
export function estimateFromRecalculation(outcome: CalculateObservationOutcome): ResolvedEstimate {
    return {
        calculation: outcome.revision.calculation,
        explanation: outcome.explanation,
        reference: outcome.reference,
        components: componentFractions(outcome.observation.components),
    };
}
