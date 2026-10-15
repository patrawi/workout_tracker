// Shared display formatting for the nutrition-estimation estimates (design
// spec §6, ADR 0030 — single central numbers; intervals are internal only).

/** Whole-number rounding — grams/kcal headlines. */
export const roundToWhole = (n: number) => Math.round(n);

/** One-decimal rounding — macro grams. */
export const roundToOneDecimal = (n: number) => Math.round(n * 10) / 10;
