// Measured-mode photo cross-check (ADR 0017): the VLM proposal never overrides
// scale-measured weights — it only surfaces differences for the user to judge.
// Pure module so the comparison rules stay unit-testable.

export interface PhotoCheckMeasuredItem {
    name: string;
    grams: number;
}

export interface PhotoCheckProposal {
    dish_name: string;
    components: Array<{
        name: string;
        weight_g: { low: number; central: number; high: number };
    }>;
}

export interface PhotoCheckResult {
    /** VLM dish-name proposal; null when empty (low-confidence names arrive stripped). */
    dishName: string | null;
    /** Proposal components with no measured counterpart — the user may have missed them. */
    unseenComponents: string[];
    /** Measured weight deviates > 50% from the VLM's central estimate. */
    weightMismatches: Array<{
        name: string;
        measuredGrams: number;
        proposedCentralGrams: number;
    }>;
}

/** Relative deviation from the VLM's central estimate that flags a measured row. */
const MISMATCH_FRACTION = 0.5;

/**
 * Loose bilingual name match: case-insensitive, with either name containing
 * the other — Thai/English pairs like "ข้าวมันไก่" / "Chicken rice (khao man gai)"
 * share no tokens, but typed names usually quote or translate the other.
 */
export function namesOverlap(a: string, b: string): boolean {
    const x = a.trim().toLowerCase();
    const y = b.trim().toLowerCase();
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
}

export function compareMeasuredToProposal(
    measured: PhotoCheckMeasuredItem[],
    proposal: PhotoCheckProposal,
): PhotoCheckResult {
    const dishName = proposal.dish_name.trim() || null;
    const unseenComponents: string[] = [];
    const weightMismatches: PhotoCheckResult["weightMismatches"] = [];

    for (const c of proposal.components) {
        const central = c.weight_g?.central;
        const counterpart = measured.find((m) => namesOverlap(m.name, c.name));
        if (!counterpart) {
            unseenComponents.push(c.name);
            continue;
        }
        if (
            typeof central === "number" &&
            Number.isFinite(central) &&
            central > 0 &&
            Number.isFinite(counterpart.grams) &&
            Math.abs(counterpart.grams - central) / central > MISMATCH_FRACTION
        ) {
            weightMismatches.push({
                name: counterpart.name,
                measuredGrams: counterpart.grams,
                proposedCentralGrams: central,
            });
        }
    }

    return { dishName, unseenComponents, weightMismatches };
}
