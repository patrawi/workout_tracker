// Shared display formatting for the nutrition-estimation ranges (design spec §6).
// Previously duplicated as r0/r1/rangeText across LogMealModal,
// EstimateRangePanel, PendingMealDialog, and NutritionPage.

/** Whole-number rounding — grams/kcal headlines. */
export const roundToWhole = (n: number) => Math.round(n);

/** One-decimal rounding — macro grams. */
export const roundToOneDecimal = (n: number) => Math.round(n * 10) / 10;

/**
 * "low–central–high" interval text, rounded per the given rounding function.
 * Degenerate point intervals (measured weights carry no uncertainty, ADR 0018)
 * collapse to a single value instead of printing it three times.
 */
export function formatInterval(
    interval: { low: number; central: number; high: number },
    round: (n: number) => number,
): string {
    const low = round(interval.low);
    const central = round(interval.central);
    const high = round(interval.high);
    if (low === central && central === high) return `${central}`;
    return `${low}–${central}–${high}`;
}
