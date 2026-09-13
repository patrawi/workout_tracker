// Constrained interval calculation (ADR 0008, 0018) with transparent soft
// relaxation (ADR 0019). Known Ingredient Evidence and latent-factor masses
// allocate mass INSIDE their Portion Component (ADR 0006).
//
// Interval model (mass-side only, ADR 0018):
// - Each mass variable has a low/central/high value. Every formula is evaluated
//   independently at the (low, central, high) bounds, so mass is conserved at
//   each bound: base_b + ingredient_b + oil_b = consumed weight bound.
// - Reference per-100 g composition and user-confirmed consumed fractions are
//   fixed points. Calories come from the per100 values passed in — the engine
//   never recomputes P×4 + C×4 + F×9 (reference calories are a fixed point).
import type {
  CalculationResult,
  ComponentBreakdown,
  IngredientEvidence,
  LatentHint,
  LatentHintLevel,
  Macronutrients,
  MassRange,
  PortionComponentInput,
  ReferenceMacros,
} from "../types";
import { InfeasibleEvidenceError } from "../types";

const EPS = 1e-9;

const MACRO_KEYS = ["protein", "carbs", "fat", "alcohol", "calories"] as const;
type MacroKey = (typeof MACRO_KEYS)[number];
type Interval = MassRange;

// Provisional oil composition: fat 100 g/100 g, 884 kcal/100 g (design spec §4).
const OIL_PER100: Macronutrients = {
  protein: 0,
  carbs: 0,
  fat: 100,
  alcohol: 0,
  calories: 884,
};

// Provisional visible-oil bands (% of component mass), design spec §4.
// central = midpoint of the band.
const OIL_BAND_FRACTIONS: Record<Exclude<LatentHintLevel, "none">, Interval> = {
  low: { low: 0, central: 0.01, high: 0.02 },
  medium: { low: 0.02, central: 0.04, high: 0.06 },
  high: { low: 0.06, central: 0.09, high: 0.12 },
};

const LEVEL_ORDER: LatentHintLevel[] = ["none", "low", "medium", "high"];

function point(v: number): Interval {
  return { low: v, central: v, high: v };
}

function isValidInterval(iv: Interval): boolean {
  return (
    Number.isFinite(iv.low) &&
    Number.isFinite(iv.central) &&
    Number.isFinite(iv.high) &&
    iv.low >= -EPS &&
    iv.low <= iv.central + EPS &&
    iv.central <= iv.high + EPS
  );
}

function weightInterval(weight_g: number | MassRange): Interval {
  return typeof weight_g === "number" ? point(weight_g) : { ...weight_g };
}

function mulInterval(iv: Interval, factor: number): Interval {
  return { low: iv.low * factor, central: iv.central * factor, high: iv.high * factor };
}

/**
 * Ingredient mass interval. A point value from a weak source is widened
 * (declared ±5%, user_estimated ±25%); a caller-provided MassRange is taken as
 * given (the caller already expressed its uncertainty). Unknown basis applies
 * an additional ×1.5 widening of the interval (never for measured quantities).
 */
function ingredientInterval(e: IngredientEvidence): Interval {
  let iv: Interval = weightInterval(e.grams);
  if (typeof e.grams === "number") {
    if (e.source === "declared") {
      iv = { low: e.grams * 0.95, central: e.grams, high: e.grams * 1.05 };
    } else if (e.source === "user_estimated") {
      iv = { low: e.grams * 0.75, central: e.grams, high: e.grams * 1.25 };
    }
  }
  if (e.basis === "unknown" && e.source !== "measured") {
    const halfLow = iv.central - iv.low;
    const halfHigh = iv.high - iv.central;
    iv = {
      low: iv.central - 1.5 * halfLow,
      central: iv.central,
      high: iv.central + 1.5 * halfHigh,
    };
  }
  return iv;
}

/** Clamp an interval's high down to newHigh, keeping low ≤ central ≤ high. */
function clampIntervalHigh(iv: Interval, newHigh: number): Interval {
  const high = Math.max(0, Math.min(iv.high, newHigh));
  const central = Math.min(iv.central, high);
  const low = Math.min(iv.low, central);
  return { low, central, high };
}

interface SubMass {
  interval: Interval;
  /** relaxed_constraints key, e.g. "visible_oil@rice" or "declared:sugar@main". */
  constraint: string;
  /** "measured" subs are hard and never relaxed (ADR 0019). */
  group: "hint" | "user_estimated" | "declared" | "measured";
  /** Set for ingredient subs (not for the oil hint sub). */
  ingredient?: IngredientEvidence;
}

interface ComponentNutrients {
  name: string;
  consumedWeight: Interval;
  perMacro: Record<MacroKey, Interval>;
}

function calculateComponent(
  component: PortionComponentInput,
  reference: ReferenceMacros,
  drivers: Set<string>,
  relaxedConstraints: Set<string>,
  hardReasons: string[],
): ComponentNutrients {
  const name = component.name;

  // --- Hard validation (ADR 0019: hard facts are never clamped silently) ---
  const fraction = component.consumed_fraction;
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    hardReasons.push(`consumed_fraction ${fraction} on '${name}' outside [0,1]`);
  }
  const weight = weightInterval(component.weight_g);
  if (!isValidInterval(weight)) {
    hardReasons.push(`invalid weight_g on '${name}'`);
  }
  if (typeof component.weight_g !== "number") {
    drivers.add(`${name} weight estimated`);
  }
  const evidence = component.ingredient_evidence ?? [];
  for (const e of evidence) {
    if (e.source === "measured") {
      const iv = weightInterval(e.grams);
      if (iv.high > weight.high + EPS) {
        hardReasons.push(
          `measured ingredient '${e.name}' (${iv.high}g) exceeds component weight '${name}' (${weight.high}g)`,
        );
      }
    }
  }

  // --- Latent hints ---
  const hints = component.latent_hints ?? [];
  const oilHints = hints.filter((h) => h.kind === "visible_oil" && h.level !== "none");
  const subs: SubMass[] = [];
  if (oilHints.length > 0) {
    // Highest level wins if multiple oil hints are present.
    const level = oilHints.reduce((best, h) =>
      LEVEL_ORDER.indexOf(h.level) > LEVEL_ORDER.indexOf(best) ? h.level : best,
    oilHints[0]!.level);
    const band = OIL_BAND_FRACTIONS[level as Exclude<LatentHintLevel, "none">];
    subs.push({
      interval: {
        low: band.low * weight.low,
        central: band.central * weight.central,
        high: band.high * weight.high,
      },
      constraint: `visible_oil@${name}`,
      group: "hint",
    });
    drivers.add(`visible oil hint on ${name}`);
  }
  for (const h of hints) {
    if (h.kind === "dryness" || h.kind === "remaining_broth") {
      // Accepted but inert in V1: no numeric band yet, no invented effect.
      drivers.add(`${h.kind} hint on ${name} (hint recorded (no numeric band yet))`);
    }
  }

  // --- Known Ingredient Evidence (allocates mass inside the component) ---
  const ingredientIntervals: Array<{ e: IngredientEvidence; iv: Interval }> = evidence.map(
    (e) => ({ e, iv: ingredientInterval(e) }),
  );
  for (const { e } of ingredientIntervals) {
    if (e.source === "declared" || e.source === "user_estimated") {
      drivers.add(`${e.source} ingredient '${e.name}' on ${name}`);
    }
    if (e.basis === "unknown" && e.source !== "measured") {
      drivers.add(`unknown basis ingredient '${e.name}' on ${name}`);
    }
  }
  for (const { e, iv } of ingredientIntervals) {
    subs.push({
      interval: iv,
      constraint: `${e.source}:${e.name}@${name}`,
      group: e.source,
      ingredient: e,
    });
  }

  // --- Soft relaxation (ADR 0019): hints first, then user_estimated, then declared ---
  const groups: Array<SubMass["group"]> = ["hint", "user_estimated", "declared"];
  for (const group of groups) {
    const members = subs.filter((s) => s.group === group);
    if (members.length === 0) continue;
    const othersHigh = subs
      .filter((s) => s.group !== group)
      .reduce((sum, s) => sum + s.interval.high, 0);
    const allowed = weight.high - othersHigh;
    let groupHigh = members.reduce((sum, s) => sum + s.interval.high, 0);
    if (groupHigh > allowed + EPS) {
      const excess = groupHigh - allowed;
      for (const s of members) {
        const share = groupHigh > 0 ? s.interval.high / groupHigh : 0;
        s.interval = clampIntervalHigh(s.interval, s.interval.high - excess * share);
      }
      // Greedy second pass in case proportional flooring left residual excess.
      groupHigh = members.reduce((sum, s) => sum + s.interval.high, 0);
      let residual = groupHigh - allowed;
      for (const s of members) {
        if (residual <= EPS) break;
        const reduce = Math.min(residual, s.interval.high);
        if (reduce > 0) {
          s.interval = clampIntervalHigh(s.interval, s.interval.high - reduce);
          residual -= reduce;
        }
      }
      for (const s of members) relaxedConstraints.add(s.constraint);
    }
  }

  // --- Per-bound evaluation (mass conserved at each bound) ---
  const bounds = ["low", "central", "high"] as const;

  // --- Hard-fact feasibility (ADR 0019): after soft relaxation, hard facts
  // alone (measured component weights + measured ingredient evidence) must
  // still admit a mass decomposition at EVERY bound. Measured evidence is never
  // relaxed, so a bound where it does not fit means no feasible decomposition
  // exists — fail loudly instead of presenting a range with an infeasible
  // (floored) point, e.g. a central mass below hard subtractions.
  for (const b of bounds) {
    const hardSum = subs
      .filter((s) => s.group === "measured")
      .reduce((sum, s) => sum + s.interval[b], 0);
    if (hardSum > weight[b] + EPS) {
      hardReasons.push(
        `measured evidence (${hardSum}g) does not fit component '${name}' at the ${b} bound (${weight[b]}g)`,
      );
    }
  }

  const perMacro = Object.fromEntries(
    MACRO_KEYS.map((k) => [k, point(0)]),
  ) as Record<MacroKey, Interval>;
  let baseFloored = false;
  const consumedWeight = mulInterval(weight, fraction);
  for (const b of bounds) {
    const subSum = subs.reduce((sum, s) => sum + s.interval[b], 0);
    const rawBase = weight[b] - subSum;
    const base = Math.max(0, rawBase);
    if (rawBase < -EPS) baseFloored = true;
    for (const k of MACRO_KEYS) {
      let total = (base * reference.per100[k]) / 100;
      for (const s of subs) {
        const per100 = s.ingredient ? (s.ingredient.per100 ?? reference.per100) : OIL_PER100;
        total += (s.interval[b] * per100[k]) / 100;
      }
      perMacro[k][b] = total * fraction;
    }
  }
  if (baseFloored) {
    // ADR 0019: relaxation is always flagged, including the base-mass floor.
    relaxedConstraints.add(`base_mass_floor@${name}`);
    drivers.add(`base mass floored at zero on ${name}`);
  }

  return { name, consumedWeight, perMacro };
}

/**
 * Calculate a plausible nutrition range for a meal observation from its
 * Portion Components and a Nutrition Reference Baseline.
 * Throws InfeasibleEvidenceError when hard constraints conflict (ADR 0019).
 */
export function calculateNutrition(
  components: PortionComponentInput[],
  reference: ReferenceMacros,
): CalculationResult {
  const drivers = new Set<string>();
  const relaxedConstraints = new Set<string>();
  const hardReasons: string[] = [];
  const perComponent: ComponentNutrients[] = [];

  for (const component of components) {
    perComponent.push(calculateComponent(component, reference, drivers, relaxedConstraints, hardReasons));
  }

  if (hardReasons.length > 0) {
    throw new InfeasibleEvidenceError(hardReasons);
  }

  const nutrients = Object.fromEntries(
    MACRO_KEYS.map((k) => {
      const low = perComponent.reduce((s, c) => s + c.perMacro[k].low, 0);
      const central = perComponent.reduce((s, c) => s + c.perMacro[k].central, 0);
      const high = perComponent.reduce((s, c) => s + c.perMacro[k].high, 0);
      return [k, { low, central, high }];
    }),
  ) as Record<keyof Macronutrients, MassRange>;

  return {
    nutrients,
    relaxed: relaxedConstraints.size > 0,
    relaxed_constraints: [...relaxedConstraints],
    drivers: [...drivers],
    per_component: perComponent.map((c) => ({
      name: c.name,
      consumed_weight_g: c.consumedWeight,
      contribution: { ...c.perMacro },
    })),
  };
}
