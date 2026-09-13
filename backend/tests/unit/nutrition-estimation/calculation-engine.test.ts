import { describe, expect, test } from "bun:test";
import { calculateNutrition } from "../../../src/nutrition-estimation/calculation/engine";
import {
  InfeasibleEvidenceError,
  type PortionComponentInput,
  type ReferenceMacros,
} from "../../../src/nutrition-estimation/types";

// Simple, easy-to-check reference baseline: 200 kcal, 10P/20C/5F per 100 g.
const REF: ReferenceMacros = {
  per100: { protein: 10, carbs: 20, fat: 5, alcohol: 0, calories: 200 },
};
// Fat-heavy ingredient composition for displacement tests.
const FATTY = { protein: 0, carbs: 0, fat: 50, alcohol: 0, calories: 550 };

function component(overrides: Partial<PortionComponentInput>): PortionComponentInput {
  return {
    name: "rice",
    kind: "rice",
    weight_g: 200,
    consumed_fraction: 1,
    ...overrides,
  };
}

describe("calculateNutrition — basics", () => {
  test("point weight, no evidence: nutrients = weight × per100, all bounds equal", () => {
    const result = calculateNutrition([component({})], REF);
    expect(result.nutrients.calories).toEqual({ low: 400, central: 400, high: 400 });
    expect(result.nutrients.protein).toEqual({ low: 20, central: 20, high: 20 });
    expect(result.nutrients.carbs).toEqual({ low: 40, central: 40, high: 40 });
    expect(result.nutrients.fat).toEqual({ low: 10, central: 10, high: 10 });
    expect(result.nutrients.alcohol).toEqual({ low: 0, central: 0, high: 0 });
    expect(result.relaxed).toBe(false);
    expect(result.relaxed_constraints).toEqual([]);
    expect(result.drivers).toEqual([]);
    expect(result.per_component[0]!.consumed_weight_g).toEqual({ low: 200, central: 200, high: 200 });
    expect(result.per_component[0]!.contribution).toEqual({ low: 400, central: 400, high: 400 });
  });

  test("estimated (interval) weight widens the range and adds a driver", () => {
    const result = calculateNutrition(
      [component({ weight_g: { low: 180, central: 200, high: 220 } })],
      REF,
    );
    expect(result.nutrients.calories).toEqual({ low: 360, central: 400, high: 440 });
    expect(result.nutrients.protein).toEqual({ low: 18, central: 20, high: 22 });
    expect(result.drivers).toContain("rice weight estimated");
  });

  test("consumed_fraction scales consumed weight and nutrients (point stays point)", () => {
    const result = calculateNutrition(
      [component({ weight_g: { low: 180, central: 200, high: 220 }, consumed_fraction: 0.5 })],
      REF,
    );
    expect(result.per_component[0]!.consumed_weight_g).toEqual({ low: 90, central: 100, high: 110 });
    expect(result.nutrients.calories).toEqual({ low: 180, central: 200, high: 220 });
  });

  test("totals sum across multiple components", () => {
    const result = calculateNutrition(
      [
        component({ name: "rice", weight_g: 200 }),
        component({ name: "main", kind: "main", weight_g: 100 }),
      ],
      REF,
    );
    expect(result.nutrients.calories).toEqual({ low: 600, central: 600, high: 600 });
    expect(result.per_component).toHaveLength(2);
    expect(result.per_component[0]!.contribution.central).toBe(400);
    expect(result.per_component[1]!.contribution.central).toBe(200);
  });

  test("low/central/high are ordered min ≤ central ≤ max in a mixed scenario", () => {
    const result = calculateNutrition(
      [
        component({
          name: "main",
          kind: "main",
          weight_g: { low: 150, central: 250, high: 350 },
          ingredient_evidence: [
            { name: "chicken", source: "user_estimated", basis: "unknown", grams: 100, per100: FATTY },
          ],
          latent_hints: [{ kind: "visible_oil", level: "medium" }],
        }),
      ],
      REF,
    );
    for (const key of ["protein", "carbs", "fat", "alcohol", "calories"] as const) {
      const { low, central, high } = result.nutrients[key];
      expect(low).toBeLessThanOrEqual(central + 1e-9);
      expect(central).toBeLessThanOrEqual(high + 1e-9);
    }
  });
});

describe("calculateNutrition — ingredient evidence", () => {
  test("evidence without per100: no macro displacement, mass still allocated", () => {
    const result = calculateNutrition(
      [
        component({
          ingredient_evidence: [
            { name: "chicken", source: "measured", basis: "served", grams: 100 },
          ],
        }),
      ],
      REF,
    );
    // Same composition as the reference → identical totals to plain 200 g.
    expect(result.nutrients.calories).toEqual({ low: 400, central: 400, high: 400 });
    expect(result.nutrients.protein).toEqual({ low: 20, central: 20, high: 20 });
    expect(result.drivers).toEqual([]);
  });

  test("evidence with per100 displaces reference composition for that mass", () => {
    const result = calculateNutrition(
      [
        component({
          ingredient_evidence: [
            { name: "chicken", source: "measured", basis: "served", grams: 100, per100: FATTY },
          ],
        }),
      ],
      REF,
    );
    // base 100 g at ref + 100 g ingredient at its own composition.
    expect(result.nutrients.calories).toEqual({ low: 750, central: 750, high: 750 });
    expect(result.nutrients.protein).toEqual({ low: 10, central: 10, high: 10 });
    expect(result.nutrients.fat).toEqual({ low: 55, central: 55, high: 55 }); // 5 + 50
  });

  test("measured evidence is an exact point (no widening)", () => {
    const result = calculateNutrition(
      [
        component({
          ingredient_evidence: [
            { name: "chicken", source: "measured", basis: "served", grams: 100, per100: FATTY },
          ],
        }),
      ],
      REF,
    );
    expect(result.nutrients.calories.low).toBeCloseTo(750);
    expect(result.nutrients.calories.high).toBeCloseTo(750);
  });

  test("declared evidence widens ±5% around the given value", () => {
    const result = calculateNutrition(
      [
        component({
          ingredient_evidence: [
            { name: "pork", source: "declared", basis: "served", grams: 100, per100: FATTY },
          ],
        }),
      ],
      REF,
    );
    // low: base 105 g ref + 95 g fatty; high: base 95 g ref + 105 g fatty.
    expect(result.nutrients.calories.low).toBeCloseTo(105 * 2 + 95 * 5.5);
    expect(result.nutrients.calories.central).toBeCloseTo(750);
    expect(result.nutrients.calories.high).toBeCloseTo(95 * 2 + 105 * 5.5);
    expect(result.drivers).toContain("declared ingredient 'pork' on rice");
  });

  test("user_estimated evidence widens ±25% around the given value", () => {
    const result = calculateNutrition(
      [
        component({
          ingredient_evidence: [
            { name: "pork", source: "user_estimated", basis: "served", grams: 100, per100: FATTY },
          ],
        }),
      ],
      REF,
    );
    expect(result.nutrients.calories.low).toBeCloseTo(125 * 2 + 75 * 5.5);
    expect(result.nutrients.calories.high).toBeCloseTo(75 * 2 + 125 * 5.5);
    expect(result.drivers).toContain("user_estimated ingredient 'pork' on rice");
  });

  test("unknown basis applies an additional ×1.5 widening", () => {
    const withBasis = calculateNutrition(
      [
        component({
          ingredient_evidence: [
            { name: "pork", source: "declared", basis: "served", grams: 100, per100: FATTY },
          ],
        }),
      ],
      REF,
    );
    const unknown = calculateNutrition(
      [
        component({
          ingredient_evidence: [
            { name: "pork", source: "declared", basis: "unknown", grams: 100, per100: FATTY },
          ],
        }),
      ],
      REF,
    );
    // declared ±5% → [95, 100, 105]; ×1.5 → [92.5, 100, 107.5].
    expect(unknown.nutrients.calories.low).toBeCloseTo(107.5 * 2 + 92.5 * 5.5);
    expect(unknown.nutrients.calories.high).toBeCloseTo(92.5 * 2 + 107.5 * 5.5);
    expect(unknown.nutrients.calories.high).toBeGreaterThan(withBasis.nutrients.calories.high);
    expect(unknown.drivers).toContain("unknown basis ingredient 'pork' on rice");
  });
});

describe("calculateNutrition — latent hints", () => {
  test("visible_oil low band: 0–2% of component weight, central 1%", () => {
    const result = calculateNutrition(
      [component({ latent_hints: [{ kind: "visible_oil", level: "low" }] })],
      REF,
    );
    // Oil [0, 2, 4] g; base [200, 198, 196].
    expect(result.nutrients.calories.low).toBeCloseTo(200 * 2);
    expect(result.nutrients.calories.central).toBeCloseTo(198 * 2 + 2 * 8.84);
    expect(result.nutrients.calories.high).toBeCloseTo(196 * 2 + 4 * 8.84);
    expect(result.nutrients.fat.low).toBeCloseTo(200 * 0.05);
    expect(result.nutrients.fat.high).toBeCloseTo(196 * 0.05 + 4 * 1);
    expect(result.drivers).toContain("visible oil hint on rice");
  });

  test("visible_oil medium band: 2–6%, central 4%", () => {
    const result = calculateNutrition(
      [component({ latent_hints: [{ kind: "visible_oil", level: "medium" }] })],
      REF,
    );
    expect(result.nutrients.calories.low).toBeCloseTo(196 * 2 + 4 * 8.84);
    expect(result.nutrients.calories.central).toBeCloseTo(192 * 2 + 8 * 8.84);
    expect(result.nutrients.calories.high).toBeCloseTo(188 * 2 + 12 * 8.84);
  });

  test("visible_oil high band: 6–12%, central 9%", () => {
    const result = calculateNutrition(
      [component({ latent_hints: [{ kind: "visible_oil", level: "high" }] })],
      REF,
    );
    expect(result.nutrients.calories.low).toBeCloseTo(188 * 2 + 12 * 8.84);
    expect(result.nutrients.calories.high).toBeCloseTo(176 * 2 + 24 * 8.84);
  });

  test("visible_oil none level has no effect", () => {
    const result = calculateNutrition(
      [component({ latent_hints: [{ kind: "visible_oil", level: "none" }] })],
      REF,
    );
    expect(result.nutrients.calories).toEqual({ low: 400, central: 400, high: 400 });
    expect(result.drivers).not.toContain("visible oil hint on rice");
  });

  test("dryness hint is recorded but numerically inert", () => {
    const without = calculateNutrition([component({})], REF);
    const withHint = calculateNutrition(
      [component({ latent_hints: [{ kind: "dryness", level: "high" }] })],
      REF,
    );
    expect(withHint.nutrients.calories).toEqual(without.nutrients.calories);
    expect(withHint.drivers.some((d) => d.includes("hint recorded (no numeric band yet)"))).toBe(
      true,
    );
  });

  test("remaining_broth hint is recorded but numerically inert", () => {
    const result = calculateNutrition(
      [
        component({
          kind: "broth",
          name: "soup",
          latent_hints: [{ kind: "remaining_broth", level: "medium" }],
        }),
      ],
      REF,
    );
    expect(result.nutrients.calories).toEqual({ low: 400, central: 400, high: 400 });
    expect(
      result.drivers.some((d) => d.startsWith("remaining_broth") && d.includes("no numeric band")),
    ).toBe(true);
  });
});

describe("calculateNutrition — relaxation and infeasibility (ADR 0019)", () => {
  test("soft (user_estimated) evidence exceeding the component is clamped with relaxed flag", () => {
    const result = calculateNutrition(
      [
        component({
          name: "main",
          kind: "main",
          weight_g: 100,
          ingredient_evidence: [
            { name: "sugar", source: "user_estimated", basis: "served", grams: 90, per100: { protein: 0, carbs: 100, fat: 0, alcohol: 0, calories: 400 } },
          ],
        }),
      ],
      REF,
    );
    // [67.5, 90, 112.5] clamped to high ≤ 100 → [67.5, 90, 100].
    expect(result.relaxed).toBe(true);
    expect(result.relaxed_constraints).toContain("user_estimated:sugar@main");
    expect(result.nutrients.calories.high).toBeCloseTo(100 * 4);
    expect(result.nutrients.calories.low).toBeCloseTo(32.5 * 2 + 67.5 * 4);
  });

  test("latent hint (softest) is relaxed before declared evidence", () => {
    const result = calculateNutrition(
      [
        component({
          name: "main",
          kind: "main",
          weight_g: 100,
          ingredient_evidence: [
            { name: "pork", source: "declared", basis: "served", grams: 95, per100: FATTY },
          ],
          latent_hints: [{ kind: "visible_oil", level: "high" }],
        }),
      ],
      REF,
    );
    // declared 95 g leaves only 5 g budget; oil high band wants up to 12 g → oil clamped first.
    expect(result.relaxed).toBe(true);
    expect(result.relaxed_constraints).toContain("visible_oil@main");
    expect(result.relaxed_constraints).not.toContain("declared:pork@main");
    // Oil clamped to ≤ 5 g; base + pork + oil still sum to 100 g at each bound.
    expect(result.nutrients.calories.high).toBeCloseTo(99.75 * 5.5 + 0.25 * 8.84);
  });

  test("declared (strong) evidence is relaxed only after softer groups, and recorded", () => {
    const result = calculateNutrition(
      [
        component({
          name: "main",
          kind: "main",
          weight_g: 30,
          ingredient_evidence: [
            { name: "sugar", source: "declared", basis: "served", grams: 50, per100: { protein: 0, carbs: 100, fat: 0, alcohol: 0, calories: 400 } },
          ],
        }),
      ],
      REF,
    );
    expect(result.relaxed).toBe(true);
    expect(result.relaxed_constraints).toContain("declared:sugar@main");
    // Clamped to the full 30 g budget; base mass floored to zero.
    expect(result.nutrients.calories.high).toBeCloseTo(30 * 4);
    expect(result.nutrients.calories.low).toBeCloseTo(30 * 4);
  });

  test("base mass floored at zero when weak evidence exceeds the low weight bound (driver, not relaxed)", () => {
    const result = calculateNutrition(
      [
        component({
          name: "main",
          kind: "main",
          weight_g: { low: 100, central: 150, high: 200 },
          ingredient_evidence: [
            { name: "sugar", source: "declared", basis: "served", grams: 150, per100: { protein: 0, carbs: 100, fat: 0, alcohol: 0, calories: 400 } },
          ],
        }),
      ],
      REF,
    );
    // 157.5 ≤ 200 → no constraint clamping; but base_low = 100 − 142.5 < 0 → floored.
    expect(result.relaxed).toBe(false);
    expect(result.relaxed_constraints).toEqual([]);
    expect(result.drivers).toContain("base mass floored at zero on main");
    expect(result.nutrients.calories.low).toBeCloseTo(142.5 * 4);
    expect(result.nutrients.calories.high).toBeCloseTo(42.5 * 2 + 157.5 * 4);
  });

  test("measured evidence larger than the component weight throws InfeasibleEvidenceError with reasons", () => {
    let caught: unknown;
    try {
      calculateNutrition(
        [
          component({
            name: "main",
            kind: "main",
            weight_g: 100,
            ingredient_evidence: [
              { name: "rice", source: "measured", basis: "served", grams: 150 },
            ],
          }),
        ],
        REF,
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(InfeasibleEvidenceError);
    const reasons = (caught as InfeasibleEvidenceError).reasons;
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0]!).toContain("measured ingredient 'rice'");
    expect(reasons[0]!).toContain("exceeds component weight 'main'");
  });

  test("consumed_fraction above 1 throws with a reason per offending component", () => {
    let caught: unknown;
    try {
      calculateNutrition(
        [
          component({ name: "rice", consumed_fraction: 1.5 }),
          component({ name: "main", kind: "main", consumed_fraction: -0.1 }),
        ],
        REF,
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(InfeasibleEvidenceError);
    const reasons = (caught as InfeasibleEvidenceError).reasons;
    expect(reasons).toHaveLength(2);
    expect(reasons[0]!).toContain("consumed_fraction 1.5");
    expect(reasons[0]!).toContain("'rice'");
    expect(reasons[1]!).toContain("consumed_fraction -0.1");
  });

  test("no relaxation when evidence fits", () => {
    const result = calculateNutrition(
      [
        component({
          ingredient_evidence: [
            { name: "chicken", source: "user_estimated", basis: "unknown", grams: 50 },
          ],
          latent_hints: [{ kind: "visible_oil", level: "high" }],
        }),
      ],
      REF,
    );
    expect(result.relaxed).toBe(false);
    expect(result.relaxed_constraints).toEqual([]);
  });
});
