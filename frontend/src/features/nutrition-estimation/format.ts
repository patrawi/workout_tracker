// Shared display formatting for the nutrition-estimation ranges (design spec §6).
// Previously duplicated as r0/r1/rangeText across LogMealModal,
// EstimateRangePanel, PendingMealDialog, and NutritionPage.

/** Whole-number rounding — grams/kcal headlines. */
export const roundToWhole = (n: number) => Math.round(n);

/** One-decimal rounding — macro grams. */
export const roundToOneDecimal = (n: number) => Math.round(n * 10) / 10;

/** "low–central–high" interval text, rounded per the given rounding function. */
export function formatInterval(
    interval: { low: number; central: number; high: number },
    round: (n: number) => number,
): string {
    return `${round(interval.low)}–${round(interval.central)}–${round(interval.high)}`;
}
