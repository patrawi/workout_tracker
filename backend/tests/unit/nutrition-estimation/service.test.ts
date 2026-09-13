import { describe, expect, test } from "bun:test";
import {
  createNutritionEstimationService,
  type CreateObservationServiceInput,
  type MatcherLike,
  type InterpreterLike,
} from "../../../src/nutrition-estimation/service";
import { InfeasibleEvidenceError } from "../../../src/nutrition-estimation/types";
import type {
  CalculationResult,
} from "../../../src/nutrition-estimation/types";
import type {
  CreateObservationInput,
  NutritionEstimationRepository,
  ObservationDetail,
  PersistedObservation,
  PersistedRevision,
  UpsertNutritionLogInput,
} from "../../../src/repositories/nutrition-estimation.repository";
import type { ReferenceRow } from "../../../src/nutrition-estimation/matching/matcher";
import { ValidationError } from "../../../src/lib/errors";

// ——— In-memory fake of the persistence repo (mirrors the real contract) ———

interface State {
  observations: Array<PersistedObservation & { id: number }>;
  components: any[];
  evidence: any[];
  hints: any[];
  revisions: any[];
  nutritionLogs: any[];
  references: Map<number, ReferenceRow>;
  nextId: number;
}

function createFakeRepo() {
  const state: State = {
    observations: [],
    components: [],
    evidence: [],
    hints: [],
    revisions: [],
    nutritionLogs: [],
    references: new Map(),
    nextId: 1,
  };

  const nextId = () => state.nextId++;

  function detailOf(id: number): ObservationDetail | null {
    const obs = state.observations.find((o) => o.id === id);
    if (!obs) return null;
    const components = state.components
      .filter((c) => c.observation_id === id)
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        ...c,
        ingredient_evidence: state.evidence.filter((e) => e.component_id === c.id),
        latent_hints: state.hints.filter((h) => h.component_id === c.id),
      }));
    const revisions = state.revisions
      .filter((r) => r.observation_id === id)
      .sort((a, b) => b.id - a.id);
    const reference = obs.reference_id !== null
      ? state.references.get(obs.reference_id) ?? null
      : null;
    return { ...obs, components, latest_revision: revisions[0] ?? null, reference };
  }

  const repo = {
    async insertObservation(input: CreateObservationInput): Promise<number> {
      const id = nextId();
      state.observations.push({
        id,
        date: input.date,
        meal_type: input.meal_type,
        menu_name: input.menu_name,
        portion_mode: input.portion_mode,
        meal_source: input.meal_source,
        status: input.status,
        reference_id: input.reference_id,
        match_tier: input.match_tier,
        calculation: input.calculation,
        created_at: "2026-09-13 10:00:00",
        updated_at: "2026-09-13 10:00:00",
      });
      input.components.forEach((c, i) => {
        const componentId = nextId();
        state.components.push({
          id: componentId,
          observation_id: id,
          name: c.name,
          kind: c.kind,
          weight_mode: c.weight_mode,
          weight_low: c.weight_low,
          weight_central: c.weight_central,
          weight_high: c.weight_high,
          consumed_fraction: c.consumed_fraction,
          position: c.position ?? i,
        });
        (c.ingredient_evidence ?? []).forEach((e) => {
          state.evidence.push({ id: nextId(), component_id: componentId, ...e });
        });
        (c.latent_hints ?? []).forEach((h) => {
          state.hints.push({ id: nextId(), component_id: componentId, ...h });
        });
      });
      return id;
    },

    async getObservationDetail(id: number) {
      return detailOf(id);
    },

    async listPending(): Promise<PersistedObservation[]> {
      return state.observations.filter(
        (o) => o.status === "reference_pending" || o.status === "draft",
      );
    },

    async upsertNutritionLogLink(input: UpsertNutritionLogInput): Promise<number> {
      const existing = state.nutritionLogs.find(
        (l) => l.observation_id === input.observation_id,
      );
      if (existing) {
        Object.assign(existing, { ...input, source: "meal_observation" });
        return existing.id;
      }
      const id = nextId();
      state.nutritionLogs.push({ id, ...input, source: "meal_observation" });
      return id;
    },

    async insertRevision(rev: {
      observation_id: number;
      reference_id: number | null;
      reference_provider: string | null;
      reference_version: string | null;
      calculation: CalculationResult;
      status?: string;
    }): Promise<PersistedRevision> {
      const row: PersistedRevision = {
        id: nextId(),
        observation_id: rev.observation_id,
        reference_id: rev.reference_id,
        reference_provider: rev.reference_provider,
        reference_version: rev.reference_version,
        calculation: rev.calculation,
        status: (rev.status ?? "pending_confirmation") as PersistedRevision["status"],
        created_at: "2026-09-13 10:00:00",
        confirmed_at: null,
      };
      state.revisions.push(row);
      return row;
    },

    async updateRevisionStatus(id: number, status: string): Promise<void> {
      const rev = state.revisions.find((r) => r.id === id);
      if (rev) {
        rev.status = status;
        if (status === "confirmed") rev.confirmed_at = "2026-09-13 11:00:00";
      }
    },

    async supersedeConfirmedRevisions(observationId: number, exceptId: number): Promise<void> {
      for (const rev of state.revisions) {
        if (rev.observation_id === observationId && rev.id !== exceptId && rev.status === "confirmed") {
          rev.status = "superseded";
        }
      }
    },

    async getReferenceById(id: number): Promise<ReferenceRow | null> {
      return state.references.get(id) ?? null;
    },

    async updateObservationStatus(id: number, status: string): Promise<void> {
      const obs = state.observations.find((o) => o.id === id);
      if (obs) obs.status = status as PersistedObservation["status"];
    },

    async updateObservationEstimate(
      id: number,
      update: { reference_id: number; calculation: CalculationResult },
    ): Promise<void> {
      const obs = state.observations.find((o) => o.id === id);
      if (!obs) return;
      obs.reference_id = update.reference_id;
      obs.calculation = update.calculation;
    },

    async listReferences(): Promise<ReferenceRow[]> {
      return [...state.references.values()];
    },
  };
  return { repo: repo as unknown as NutritionEstimationRepository, state };
}

// ——— Fixtures ———

const REF: ReferenceRow = {
  id: 101,
  provider: "thaifcd",
  providerFoodCode: "TFC-001",
  version: "2024.1",
  nameEn: "Stir fried basil pork",
  nameTh: "ผัดกะเพราหมู",
  per100: { protein: 10, carbs: 20, fat: 5, alcohol: 0, calories: 200 },
};
const REF2: ReferenceRow = { ...REF, id: 102, providerFoodCode: "TFC-002", nameTh: "ผัดกะเพราไก่" };
const REF3: ReferenceRow = { ...REF, id: 103, providerFoodCode: "TFC-003", nameTh: "ผัดกะเพราทะเล" };

function autoMatcher(ref: ReferenceRow): MatcherLike {
  return {
    matchReference: async () => ({ tier: "auto", reference: ref, score: 0.95 }),
  };
}

function ambiguousMatcher(): MatcherLike {
  return {
    matchReference: async () => ({
      tier: "ambiguous",
      candidates: [REF, REF2, REF3].map((r) => ({ ...r, score: 0.7 })),
    }),
  };
}

function gapMatcher(): MatcherLike {
  return { matchReference: async () => ({ tier: "gap" }) };
}

function estimatedInput(overrides: Partial<CreateObservationServiceInput> = {}): CreateObservationServiceInput {
  return {
    date: "2026-09-13",
    meal: "Lunch",
    menu_name: "ผัดกะเพราหมู",
    portion_mode: "estimated",
    components: [
      { name: "rice", kind: "rice", weight_g: { low: 180, central: 200, high: 220 } },
    ],
    ...overrides,
  };
}

// ——— Tests ———

describe("createObservation — auto tier", () => {
  test("calculates, persists the calculation, and saves a pending revision", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const result = await service.createObservation(
      estimatedInput({
        components: [
          {
            name: "rice",
            kind: "rice",
            weight_g: { low: 180, central: 200, high: 220 },
            latent_hints: [{ kind: "visible_oil", level: "low" }],
          },
        ],
      }),
    );

    expect(result.match.tier).toBe("auto");
    expect(result.observation.status).toBe("draft");
    expect(result.observation.match_tier).toBe("auto");
    expect(result.observation.reference_id).toBe(REF.id);
    expect(result.observation.calculation).not.toBeNull();
    // 200 g central: base 198 g × 2 kcal/g + visible-oil band (low=1% → 2 g × 8.84 kcal/g).
    expect(result.observation.calculation!.nutrients.calories.central).toBeCloseTo(413.68);
    expect(state.revisions).toHaveLength(1);
    expect(state.revisions[0].status).toBe("pending_confirmation");
    expect(state.revisions[0].reference_provider).toBe("thaifcd");
    expect(state.revisions[0].reference_version).toBe("2024.1");
    expect(state.revisions[0].calculation.nutrients.calories.central).toBeCloseTo(413.68);
  });

  test("evidence and hints are persisted inside their components", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    await service.createObservation(
      estimatedInput({
        components: [
          {
            name: "main",
            kind: "main",
            weight_g: { low: 100, central: 120, high: 140 },
            ingredient_evidence: [
              { name: "sugar", source: "declared", basis: "raw", grams: 5 },
            ],
            latent_hints: [{ kind: "dryness", level: "medium" }],
          },
        ],
      }),
    );

    expect(state.components).toHaveLength(1);
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0].grams_low).toBe(5);
    expect(state.evidence[0].grams_central).toBe(5);
    expect(state.evidence[0].grams_high).toBe(5);
    expect(state.hints).toHaveLength(1);
    expect(state.hints[0].level).toBe("medium");
  });
});

describe("createObservation — ambiguous tier", () => {
  test("persists reference_pending with no reference and returns candidates", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: ambiguousMatcher() });

    const result = await service.createObservation(estimatedInput());

    expect(result.match.tier).toBe("ambiguous");
    if (result.match.tier !== "ambiguous") throw new Error("unreachable");
    expect(result.match.candidates).toHaveLength(3);
    expect(result.observation.status).toBe("reference_pending");
    expect(result.observation.match_tier).toBe("ambiguous");
    expect(result.observation.reference_id).toBeNull();
    expect(result.observation.calculation).toBeNull();
    // No revision without a calculation.
    expect(state.revisions).toHaveLength(0);
  });
});

describe("createObservation — gap tier", () => {
  test("persists a Reference-Pending Meal without calculation", async () => {
    const { repo, state } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    const result = await service.createObservation(estimatedInput());

    expect(result.match.tier).toBe("gap");
    expect(result.observation.status).toBe("reference_pending");
    expect(result.observation.match_tier).toBe("gap");
    expect(result.observation.reference_id).toBeNull();
    expect(result.observation.calculation).toBeNull();
    expect(state.revisions).toHaveLength(0);
  });
});

describe("confirmEstimate — dual-write (ADR 0022)", () => {
  test("confirms the revision, sets status, and writes central values to nutrition_logs", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const created = await service.createObservation(estimatedInput());
    await service.confirmEstimate(created.observation.id);

    expect(state.revisions[0].status).toBe("confirmed");
    expect(state.revisions[0].confirmed_at).not.toBeNull();
    expect(state.observations[0]!.status).toBe("confirmed");

    expect(state.nutritionLogs).toHaveLength(1);
    const log = state.nutritionLogs[0];
    expect(log.date).toBe("2026-09-13");
    expect(log.meal).toBe("Lunch");
    expect(log.food_name).toBe("ผัดกะเพราหมู");
    expect(log.observation_id).toBe(created.observation.id);
    expect(log.source).toBe("meal_observation");
    // Central values: 200 g × per100 → 20P / 40C / 10F / 400 kcal.
    expect(log.protein).toBeCloseTo(20);
    expect(log.carbs).toBeCloseTo(40);
    expect(log.fat).toBeCloseTo(10);
    expect(log.calories).toBeCloseTo(400);
  });

  test("re-confirm after a new revision supersedes the old confirmed one and updates the linked log", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    state.references.set(REF2.id, REF2);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const created = await service.createObservation(estimatedInput());
    await service.confirmEstimate(created.observation.id);

    // User changes the reference → new revision → confirm again.
    await service.calculateForReference(created.observation.id, REF2.id);
    const revisions = [...state.revisions].sort((a, b) => a.id - b.id);
    expect(revisions).toHaveLength(2);
    expect(revisions[1].status).toBe("pending_confirmation");

    await service.confirmEstimate(created.observation.id);

    const byId = new Map(state.revisions.map((r) => [r.id, r]));
    expect(byId.get(revisions[0].id)!.status).toBe("superseded");
    expect(byId.get(revisions[1].id)!.status).toBe("confirmed");
    // Same linked log row updated, not duplicated.
    expect(state.nutritionLogs).toHaveLength(1);
  });

  test("rejects confirming when the latest revision is not pending", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const created = await service.createObservation(estimatedInput());
    await service.confirmEstimate(created.observation.id);
    expect(service.confirmEstimate(created.observation.id)).rejects.toThrow(/not pending_confirmation/);
  });

  test("rejects confirming an observation without revisions", async () => {
    const { repo, state } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    const created = await service.createObservation(estimatedInput());
    expect(service.confirmEstimate(created.observation.id)).rejects.toThrow(/no estimate revision/);
  });
});

describe("resolveReference", () => {
  test("recalculates against the chosen reference and moves the meal back to draft", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF2.id, REF2);
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    const created = await service.createObservation(estimatedInput());
    expect(created.observation.status).toBe("reference_pending");

    const resolved = await service.resolveReference(created.observation.id, REF2.id);

    expect(resolved.observation.status).toBe("draft");
    expect(resolved.observation.reference_id).toBe(REF2.id);
    expect(resolved.observation.calculation).not.toBeNull();
    expect(resolved.revision.status).toBe("pending_confirmation");
    expect(resolved.revision.reference_provider).toBe(REF2.provider);
    expect(state.revisions).toHaveLength(1);
  });
});

describe("validation (ADR 0016 minimum input)", () => {
  test("measured mode with no components is rejected", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    expect(
      service.createObservation({
        meal: "Dinner",
        menu_name: "ข้าวมันไก่",
        portion_mode: "measured",
        components: [],
      }),
    ).rejects.toThrow(ValidationError);
  });

  test("measured mode rejects interval weights", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    expect(
      service.createObservation({
        meal: "Dinner",
        menu_name: "ข้าวมันไก่",
        portion_mode: "measured",
        components: [{ name: "rice", kind: "rice", weight_g: { low: 1, central: 2, high: 3 } }],
      }),
    ).rejects.toThrow(/point weight/);
  });

  test("estimated mode requires at least one estimated-weight component", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    expect(
      service.createObservation({
        meal: "Dinner",
        menu_name: "ข้าวมันไก่",
        portion_mode: "estimated",
        components: [{ name: "rice", kind: "rice", weight_g: 200 }],
      }),
    ).rejects.toThrow(/estimated weight range/);
  });

  test("empty menu name is rejected", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    expect(service.createObservation(estimatedInput({ menu_name: "  " }))).rejects.toThrow(
      /menu_name/,
    );
  });

  test("inverted weight range is rejected", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    expect(
      service.createObservation(
        estimatedInput({
          components: [{ name: "rice", kind: "rice", weight_g: { low: 300, central: 200, high: 220 } }],
        }),
      ),
    ).rejects.toThrow(/0 < low <= central <= high/);
  });

  test("manual reference_id skips the matcher and uses the given reference", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF3.id, REF3);
    let matcherCalled = false;
    const matcher: MatcherLike = {
      matchReference: async () => {
        matcherCalled = true;
        return { tier: "gap" };
      },
    };
    const service = createNutritionEstimationService({ repo, matcher });

    const result = await service.createObservation(
      estimatedInput({ reference_id: REF3.id }),
    );
    expect(matcherCalled).toBe(false);
    expect(result.match.tier).toBe("manual");
    expect(result.observation.match_tier).toBe("manual");
    expect(result.observation.reference_id).toBe(REF3.id);
    expect(state.revisions).toHaveLength(1);
  });
});

describe("interpret pass-through", () => {
  test("returns failure states without throwing", async () => {
    const { repo } = createFakeRepo();
    const interpreter: InterpreterLike = {
      interpret: async () => ({ status: "failed", reason: "no_food" }),
    };
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher(), interpreter });
    const outcome = await service.interpret({ menuName: "ข้าวผัด" });
    expect(outcome).toEqual({ status: "failed", reason: "no_food" });
  });

  test("unavailable when no interpreter is configured", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    expect(await service.interpret({ menuName: "ข้าวผัด" })).toEqual({ status: "unavailable" });
  });
});

describe("entry validation — obvious evidence conflicts (spec §5)", () => {
  test("evidence central grams exceeding the component central weight is rejected", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    expect(
      service.createObservation(
        estimatedInput({
          components: [
            {
              name: "main",
              kind: "main",
              weight_g: { low: 20, central: 30, high: 40 },
              ingredient_evidence: [
                { name: "sugar", source: "declared", basis: "raw", grams: 50 },
              ],
            },
          ],
        }),
      ),
    ).rejects.toThrow(/'sugar'.*exceeds component 'main'/);
  });

  test("range evidence whose central exceeds the component central weight is rejected too", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    expect(
      service.createObservation(
        estimatedInput({
          components: [
            {
              name: "main",
              kind: "main",
              weight_g: { low: 20, central: 30, high: 40 },
              ingredient_evidence: [
                {
                  name: "pork",
                  source: "user_estimated",
                  basis: "served",
                  grams: { low: 25, central: 35, high: 45 },
                },
              ],
            },
          ],
        }),
      ),
    ).rejects.toThrow(ValidationError);
  });

  test("measured evidence above a measured component weight at every bound is rejected", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    expect(
      service.createObservation({
        meal: "Dinner",
        menu_name: "ข้าวมันไก่",
        portion_mode: "measured",
        components: [
          {
            name: "rice",
            kind: "rice",
            weight_g: 100,
            ingredient_evidence: [
              {
                name: "chicken",
                source: "measured",
                basis: "served",
                grams: { low: 150, central: 160, high: 170 },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/at every bound/);
  });

  test("borderline soft evidence is not rejected — the engine relaxes it (ADR 0019)", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const result = await service.createObservation(
      estimatedInput({
        components: [
          {
            name: "rice",
            kind: "rice",
            weight_g: { low: 40, central: 50, high: 60 },
            ingredient_evidence: [
              {
                name: "sugar",
                source: "declared",
                basis: "served",
                grams: { low: 40, central: 45, high: 90 },
              },
            ],
          },
        ],
      }),
    );

    // Central 45 g fits inside 50 g central; the widened high bound is clamped.
    expect(result.observation.calculation!.relaxed).toBe(true);
    expect(result.observation.calculation!.relaxed_constraints).toContain("declared:sugar@rice");
  });

  test("borderline measured evidence with a fitting central reaches the engine and throws infeasible", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    // low 5 fits, central 90 fits, high 150 exceeds the 100 g point weight —
    // not an "at every bound" conflict, so the engine-level hard check fires.
    await expect(
      service.createObservation({
        meal: "Dinner",
        menu_name: "ข้าวมันไก่",
        portion_mode: "measured",
        components: [
          {
            name: "rice",
            kind: "rice",
            weight_g: 100,
            ingredient_evidence: [
              {
                name: "chicken",
                source: "measured",
                basis: "served",
                grams: { low: 5, central: 90, high: 150 },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(InfeasibleEvidenceError);
  });

  test("calculateForReference re-validates persisted components", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    const created = await service.createObservation(estimatedInput());
    // Simulate legacy/conflicting persisted evidence directly in the store.
    state.evidence.push({
      id: 9_999,
      component_id: state.components[0]!.id,
      name: "sugar",
      source: "declared",
      basis: "raw",
      grams_low: 500,
      grams_central: 500,
      grams_high: 500,
      per100: null,
    });

    expect(service.calculateForReference(created.observation.id, REF.id)).rejects.toThrow(
      /'sugar'.*exceeds component 'rice'/,
    );
  });
});

describe("quartile enforcement (ADR 0015)", () => {
  test("without an after image, non-quartile consumed_fraction is rejected", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    expect(
      service.createObservation(
        estimatedInput({
          components: [
            { name: "rice", kind: "rice", weight_g: { low: 180, central: 200, high: 220 }, consumed_fraction: 0.6 },
          ],
        }),
      ),
    ).rejects.toThrow(/one of 1, 0.75, 0.5, 0.25/);
  });

  test("without an after image, each quartile is accepted", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    for (const fraction of [1, 0.75, 0.5, 0.25]) {
      await expect(
        service.createObservation(
          estimatedInput({
            components: [
              { name: "rice", kind: "rice", weight_g: { low: 180, central: 200, high: 220 }, consumed_fraction: fraction },
            ],
          }),
        ),
      ).resolves.toBeTruthy();
    }
  });

  test("with has_after_image, any fraction in (0, 1] is accepted", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    const result = await service.createObservation(
      estimatedInput({
        has_after_image: true,
        components: [
          { name: "rice", kind: "rice", weight_g: { low: 180, central: 200, high: 220 }, consumed_fraction: 0.6 },
        ],
      }),
    );
    expect(result.observation.components[0]!.consumed_fraction).toBe(0.6);
  });

  test("has_after_image false behaves like absent", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    await expect(
      service.createObservation(
        estimatedInput({
          has_after_image: false,
          components: [
            { name: "rice", kind: "rice", weight_g: { low: 180, central: 200, high: 220 }, consumed_fraction: 0.6 },
          ],
        }),
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe("explanation payload (spec §6)", () => {
  test("auto tier: reference provider + version, portion_mode, relaxed, manual-entry flags", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const result = await service.createObservation(
      estimatedInput({
        components: [
          {
            name: "rice",
            kind: "rice",
            weight_g: { low: 40, central: 50, high: 60 },
            ingredient_evidence: [
              { name: "sugar", source: "declared", basis: "served", grams: { low: 40, central: 45, high: 90 } },
            ],
          },
        ],
      }),
    );

    expect(result.explanation.reference).toEqual({
      id: REF.id,
      provider: "thaifcd",
      version: "2024.1",
    });
    expect(result.explanation.portion_mode).toBe("estimated");
    expect(result.explanation.relaxed).toBe(true);
    expect(result.explanation.relaxed_constraints).toContain("declared:sugar@rice");
    expect(result.explanation.manually_entered_fields).toBe(true);
    expect(result.explanation.components).toEqual([
      { name: "rice", manually_entered_fields: true },
    ]);
  });

  test("gap tier: no reference, relaxed false, no manual entry", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    const result = await service.createObservation(estimatedInput());

    expect(result.explanation.reference).toBeNull();
    expect(result.explanation.relaxed).toBe(false);
    expect(result.explanation.relaxed_constraints).toEqual([]);
    expect(result.explanation.manually_entered_fields).toBe(false);
  });

  test("getObservation includes the explanation from the latest revision", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const created = await service.createObservation(estimatedInput());
    const fetched = await service.getObservation(created.observation.id);

    expect(fetched.explanation.reference).toEqual({
      id: REF.id,
      provider: "thaifcd",
      version: "2024.1",
    });
    expect(fetched.explanation.portion_mode).toBe("estimated");
    expect(fetched.explanation.relaxed).toBe(false);
  });

  test("calculateForReference returns the explanation for the new revision", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    const created = await service.createObservation(estimatedInput());
    const result = await service.calculateForReference(created.observation.id, REF.id);

    expect(result.explanation.reference).toEqual({
      id: REF.id,
      provider: "thaifcd",
      version: "2024.1",
    });
    expect(result.explanation.relaxed).toBe(false);
  });
});
