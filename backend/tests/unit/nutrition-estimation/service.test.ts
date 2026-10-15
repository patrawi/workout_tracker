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
import { ValidationError, NotFoundError } from "../../../src/lib/errors";

// ——— In-memory fake of the persistence repo (mirrors the real contract) ———

interface State {
  /** Stored rows carry user_id; the mapped PersistedObservation shape does not. */
  observations: Array<PersistedObservation & { id: number; user_id: number }>;
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

  function detailOf(id: number, userId?: number): ObservationDetail | null {
    const obs = state.observations.find(
      (o) => o.id === id && (userId === undefined || o.user_id === userId),
    );
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
        user_id: input.user_id,
        date: input.date,
        meal_type: input.meal_type,
        menu_name: input.menu_name,
        portion_mode: input.portion_mode,
        meal_source: input.meal_source,
        user_note: input.user_note,
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

    async getObservationDetail(id: number, userId: number) {
      return detailOf(id, userId);
    },

    async listPending(userId: number): Promise<PersistedObservation[]> {
      return state.observations.filter(
        (o) =>
          (o.status === "reference_pending" || o.status === "draft") &&
          o.user_id === userId,
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

    async updateObservationStatus(id: number, status: string, userId: number): Promise<void> {
      const obs = state.observations.find((o) => o.id === id && o.user_id === userId);
      if (obs) obs.status = status as PersistedObservation["status"];
    },

    async updateObservationEstimate(
      id: number,
      update: { reference_id: number; calculation: CalculationResult },
      userId: number,
    ): Promise<void> {
      const obs = state.observations.find((o) => o.id === id && o.user_id === userId);
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
    user_id: 1,
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

describe("createObservation — never blocks (ADR 0026)", () => {
  test("gap-matched components fall back to the kind prior and still produce a calculation", async () => {
    const { repo, state } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    const result = await service.createObservation(
      estimatedInput({
        components: [
          { name: "ของไม่รู้จัก", kind: "main", weight_g: { low: 90, central: 100, high: 110 } },
        ],
      }),
    );

    expect(result.observation.status).toBe("draft");
    expect(result.observation.match_tier).toBe("gap");
    expect(result.observation.reference_id).toBeNull();
    const calculation = result.observation.calculation!;
    // 100 g central × 200 kcal/100 g (main prior) = 200 kcal.
    expect(calculation.nutrients.calories.central).toBeCloseTo(200);
    expect(calculation.drivers.some((d) => d.includes("ของไม่รู้จัก") && d.includes("main"))).toBe(true);
    expect(state.revisions).toHaveLength(1);
    expect(state.revisions[0].status).toBe("pending_confirmation");
  });

  test("a zero-kcal reference is treated as unusable and falls back to the prior", async () => {
    const { repo, state } = createFakeRepo();
    const zeroRef: ReferenceRow = {
      ...REF,
      id: 201,
      providerFoodCode: "TFC-201",
      per100: { protein: 0, carbs: 0, fat: 0, alcohol: 0, calories: 0 },
    };
    state.references.set(zeroRef.id, zeroRef);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(zeroRef) });

    const result = await service.createObservation(estimatedInput());

    // rice prior: 200 g × 130 kcal/100 g = 260 kcal.
    expect(result.observation.calculation!.nutrients.calories.central).toBeCloseTo(260);
    expect(result.observation.reference_id).toBeNull();
    expect(result.observation.calculation!.drivers.join(" ")).toContain("zero-kcal");
  });

  test("per-component resolution mixes a matched reference with an estimated component", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const matcher: MatcherLike = {
      matchReference: async (name: string) =>
        name === "ไข่ไก่"
          ? { tier: "auto", reference: REF, score: 0.95 }
          : { tier: "gap" },
    };
    const service = createNutritionEstimationService({ repo, matcher });

    const result = await service.createObservation(
      estimatedInput({
        components: [
          { name: "ไข่ไก่", kind: "main", weight_g: { low: 90, central: 100, high: 110 } },
          { name: "น้ำพริกไม่รู้จัก", kind: "side", weight_g: { low: 45, central: 50, high: 55 } },
        ],
      }),
    );

    const calculation = result.observation.calculation!;
    // 100 g × 200 kcal/100 g (REF) + 50 g × 90 kcal/100 g (side prior) = 245.
    expect(calculation.nutrients.calories.central).toBeCloseTo(245);
    expect(result.observation.reference_id).toBe(REF.id);
    expect(calculation.per_component[0]!.reference?.id).toBe(REF.id);
    expect(calculation.per_component[0]!.estimated).toBe(false);
    expect(calculation.per_component[1]!.estimated).toBe(true);
  });

  test("ambiguous matches become estimates with the candidates recorded in drivers", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: ambiguousMatcher() });

    const result = await service.createObservation(estimatedInput());

    expect(result.observation.status).toBe("draft");
    expect(result.observation.calculation).not.toBeNull();
    expect(result.observation.calculation!.drivers.join(" ")).toContain("ผัดกะเพราหมู");
  });
});

describe("confirmEstimate — dual-write (ADR 0022)", () => {
  test("confirms the revision, sets status, and writes central values to nutrition_logs", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const created = await service.createObservation(estimatedInput());
    await service.confirmEstimate(created.observation.id, 1);

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
    await service.confirmEstimate(created.observation.id, 1);

    // User changes the reference → new revision → confirm again.
    await service.calculateForReference(created.observation.id, REF2.id, 1);
    const revisions = [...state.revisions].sort((a, b) => a.id - b.id);
    expect(revisions).toHaveLength(2);
    expect(revisions[1].status).toBe("pending_confirmation");

    await service.confirmEstimate(created.observation.id, 1);

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
    await service.confirmEstimate(created.observation.id, 1);
    expect(service.confirmEstimate(created.observation.id, 1)).rejects.toThrow(/not pending_confirmation/);
  });

  test("rejects confirming an observation without revisions", async () => {
    const { repo, state } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    // Legacy shape: an observation row with no revision at all (a pre-ADR-0026
    // reference-pending meal) — new saves always carry a revision.
    state.observations.push({
      id: 1,
      user_id: 1,
      date: "2026-09-13",
      meal_type: "Lunch",
      menu_name: "ผัดกะเพราหมู",
      portion_mode: "estimated",
      meal_source: null,
      user_note: null,
      status: "reference_pending",
      reference_id: null,
      match_tier: "gap",
      calculation: null,
      created_at: "2026-09-13 10:00:00",
      updated_at: "2026-09-13 10:00:00",
    });
    expect(service.confirmEstimate(1, 1)).rejects.toThrow(/no estimate revision/);
  });
});

describe("resolveComponentReference on a confirmed observation (ADR 0030)", () => {
  test("re-finalizes: new revision confirmed, log re-dual-written, status stays confirmed", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const REF_ALT: ReferenceRow = {
      ...REF,
      id: 104,
      providerFoodCode: "TFC-004",
      nameTh: "ข้าวเหนียว, นึ่ง",
      per100: { protein: 12, carbs: 24, fat: 6, alcohol: 0, calories: 240 },
    };
    state.references.set(REF_ALT.id, REF_ALT);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const created = await service.createObservation(estimatedInput());
    await service.confirmEstimate(created.observation.id, 1);

    const outcome = await service.resolveComponentReference(created.observation.id, 0, REF_ALT.id, 1);

    // The correction is immediately final — the meal stays logged.
    expect(outcome.revision.status).toBe("confirmed");
    expect(state.observations[0]!.status).toBe("confirmed");
    const revisions = [...state.revisions].sort((a, b) => a.id - b.id);
    expect(revisions[0]!.status).toBe("superseded");
    expect(revisions[1]!.status).toBe("confirmed");
    // Same linked log row, corrected central values (200 g × alt per100).
    expect(state.nutritionLogs).toHaveLength(1);
    expect(state.nutritionLogs[0].protein).toBeCloseTo(24);
    expect(state.nutritionLogs[0].calories).toBeCloseTo(480);
  });
});

describe("resolveReference", () => {
  test("recalculates against the chosen reference and moves the meal back to draft", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF2.id, REF2);
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    const created = await service.createObservation(estimatedInput());
    // ADR 0026: a gap meal is born as a draft estimate, not reference-pending.
    expect(created.observation.status).toBe("draft");

    const resolved = await service.resolveReference(created.observation.id, REF2.id, 1);

    expect(resolved.observation.status).toBe("draft");
    expect(resolved.observation.reference_id).toBe(REF2.id);
    expect(resolved.observation.calculation).not.toBeNull();
    expect(resolved.revision.status).toBe("pending_confirmation");
    expect(resolved.revision.reference_provider).toBe(REF2.provider);
    expect(state.revisions).toHaveLength(2); // the born-with estimate + the resolved one
  });
});

describe("validation (ADR 0016 minimum input)", () => {
  test("measured mode with no components is rejected", async () => {
    const { repo } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });
    expect(
      service.createObservation({
        user_id: 1,
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
        user_id: 1,
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
        user_id: 1,
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

  test("forwards userNote to the interpreter unchanged (ADR 0028)", async () => {
    const { repo } = createFakeRepo();
    const seen: Array<{ menuName: string; userNote?: string }> = [];
    const interpreter: InterpreterLike = {
      interpret: async (input) => {
        seen.push({ menuName: input.menuName, userNote: input.userNote });
        return { status: "failed", reason: "no_food" };
      },
    };
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher(), interpreter });

    await service.interpret({
      menuName: "ข้าวมันไก่ผสม",
      userNote: "ข้าว ~200 g ไม่มันมาก, ไก่ทอด ~65 g",
    });
    expect(seen).toEqual([
      { menuName: "ข้าวมันไก่ผสม", userNote: "ข้าว ~200 g ไม่มันมาก, ไก่ทอด ~65 g" },
    ]);
  });
});

describe("createObservation — user_note persistence (ADR 0028)", () => {
  test("stores a trimmed note with the observation", async () => {
    const { repo, state } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    await service.createObservation(estimatedInput({ user_note: "  ข้าว ~200 g  " }));
    expect(state.observations[0]!.user_note).toBe("ข้าว ~200 g");
  });

  test("absent or whitespace-only note persists as null", async () => {
    const { repo, state } = createFakeRepo();
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    await service.createObservation(estimatedInput());
    expect(state.observations[0]!.user_note).toBeNull();

    await service.createObservation(estimatedInput({ user_note: "   " }));
    expect(state.observations[1]!.user_note).toBeNull();
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
        user_id: 1,
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
        user_id: 1,
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

    expect(service.calculateForReference(created.observation.id, REF.id, 1)).rejects.toThrow(
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
    const fetched = await service.getObservation(created.observation.id, 1);

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
    const result = await service.calculateForReference(created.observation.id, REF.id, 1);

    expect(result.explanation.reference).toEqual({
      id: REF.id,
      provider: "thaifcd",
      version: "2024.1",
    });
    expect(result.explanation.relaxed).toBe(false);
  });
});

// ——— searchReferences (pending-meal resolution picker, design spec §7) ———

describe("searchReferences", () => {
  const FRIED_RICE: ReferenceRow = {
    ...REF,
    id: 201,
    providerFoodCode: "TFC-201",
    nameEn: "Fried rice with shrimp",
    nameTh: "ข้าวผัดกุ้ง",
  };
  const RICE_SOUP: ReferenceRow = {
    ...REF,
    id: 202,
    providerFoodCode: "TFC-202",
    nameEn: "Rice soup",
    nameTh: "ข้าวต้ม",
  };
  const GREEN_CURRY: ReferenceRow = {
    ...REF,
    id: 203,
    providerFoodCode: "TFC-203",
    nameEn: "Green curry chicken",
    nameTh: "แกงเขียวหวานไก่",
  };

  function searchRepo(references: ReferenceRow[] = []) {
    const { repo, state } = createFakeRepo();
    for (const row of references) state.references.set(row.id, row);
    return { repo, state };
  }

  test("exact case-insensitive provider_food_code match leads the results", async () => {
    const CODE_MATCH: ReferenceRow = {
      ...REF,
      id: 204,
      providerFoodCode: "RICE-01",
      nameEn: "Special fried rice",
      nameTh: "ข้าวผัดพิเศษ",
    };
    const { repo } = searchRepo([FRIED_RICE, CODE_MATCH]);
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    const result = await service.searchReferences("rice-01");

    expect(result.items).toHaveLength(2);
    // Flat snake_case shape the resolution picker renders.
    expect(result.items[0]).toEqual({
      id: 204,
      provider: "thaifcd",
      provider_food_code: "RICE-01",
      version: "2024.1",
      name_th: "ข้าวผัดพิเศษ",
      name_en: "Special fried rice",
      protein: 10,
      carbs: 20,
      fat: 5,
      alcohol: 0,
      calories: 200,
    });
    // Lexical follow-up: "rice" token overlaps "Fried rice with shrimp".
    expect(result.items[1]!.id).toBe(201);
  });

  test("orders lexical matches by score descending", async () => {
    const { repo } = searchRepo([RICE_SOUP, FRIED_RICE, GREEN_CURRY]);
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    const result = await service.searchReferences("Fried Rice");

    // "fried rice": FRIED_RICE covers both tokens (1.0), RICE_SOUP one (0.5).
    expect(result.items.map((item) => item.id)).toEqual([201, 202]);
  });

  test("excludes zero-score rows", async () => {
    const { repo } = searchRepo([FRIED_RICE, GREEN_CURRY]);
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    const result = await service.searchReferences("fried rice");

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe(201);
  });

  test("empty or whitespace query returns empty items without loading the pool", async () => {
    const { repo } = searchRepo([FRIED_RICE]);
    let listCalls = 0;
    const countingRepo = {
      ...repo,
      listReferences: async () => {
        listCalls++;
        return [];
      },
    } as unknown as NutritionEstimationRepository;
    const service = createNutritionEstimationService({
      repo: countingRepo,
      matcher: gapMatcher(),
    });

    expect(await service.searchReferences("")).toEqual({ items: [] });
    expect(await service.searchReferences("   ")).toEqual({ items: [] });
    expect(listCalls).toBe(0);
  });

  test("limit defaults to 10 and clamps into 1..25", async () => {
    const pool: ReferenceRow[] = Array.from({ length: 30 }, (_, i) => ({
      ...REF,
      id: 300 + i,
      providerFoodCode: `TFC-${300 + i}`,
      nameEn: `Fried rice ${i + 1}`,
      nameTh: null,
    }));
    const { repo } = searchRepo(pool);
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    expect((await service.searchReferences("fried rice")).items).toHaveLength(10);
    expect((await service.searchReferences("fried rice", 999)).items).toHaveLength(25);
    expect((await service.searchReferences("fried rice", 2)).items).toHaveLength(2);
    expect((await service.searchReferences("fried rice", 0)).items).toHaveLength(1);
  });

  test("substring fallback resolves partial names, ranked below full token overlap", async () => {
    const RICE_NOODLE: ReferenceRow = {
      ...REF,
      id: 205,
      providerFoodCode: "TFC-205",
      nameEn: "Ricey noodle soup",
      nameTh: "ก๋วยเตี๋ยวน้ำ",
    };
    const { repo } = searchRepo([FRIED_RICE, RICE_NOODLE]);
    const service = createNutritionEstimationService({ repo, matcher: gapMatcher() });

    // "ผัดกุ้ง" is no whole token of "ข้าวผัดกุ้ง" (token overlap 0) but is a
    // raw substring of it — partial Thai input must still resolve.
    expect((await service.searchReferences("ผัดกุ้ง")).items.map((item) => item.id))
      .toEqual([201]);

    // Full token overlap ("rice" in "Fried rice with shrimp", score 1.0)
    // outranks the substring-only hit ("Ricey" contains "rice", score 0.5).
    expect((await service.searchReferences("rice")).items.map((item) => item.id))
      .toEqual([201, 205]);
  });
});

// ——— User scoping (B-002) ———

describe("user scoping", () => {
  test("createObservation persists the requesting user's id", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    await service.createObservation(estimatedInput({ user_id: 7 }));

    expect(state.observations).toHaveLength(1);
    expect(state.observations[0]!.user_id).toBe(7);
  });

  test("listPending returns only the requesting user's observations", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    await service.createObservation(estimatedInput({ user_id: 1, menu_name: "user one meal" }));
    await service.createObservation(estimatedInput({ user_id: 2, menu_name: "user two meal" }));

    const pendingForOne = await service.listPending(1);
    expect(pendingForOne).toHaveLength(1);
    expect(pendingForOne[0]!.menu_name).toBe("user one meal");
    expect(await service.listPending(2)).toHaveLength(1);
    expect(await service.listPending(3)).toHaveLength(0);
  });

  test("getObservation hides other users' observations", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const created = await service.createObservation(estimatedInput({ user_id: 1 }));

    expect((await service.getObservation(created.observation.id, 1)).id)
      .toBe(created.observation.id);
    await expect(service.getObservation(created.observation.id, 2))
      .rejects.toThrow(NotFoundError);
    await expect(service.getObservation(created.observation.id, 2))
      .rejects.toThrow(/Meal observation/);
  });

  test("confirmEstimate dual-write carries the requesting user's id into nutrition_logs", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const created = await service.createObservation(estimatedInput({ user_id: 7 }));
    await service.confirmEstimate(created.observation.id, 7);

    expect(state.nutritionLogs).toHaveLength(1);
    expect(state.nutritionLogs[0]!.user_id).toBe(7);
    expect(state.nutritionLogs[0]!.observation_id).toBe(created.observation.id);
  });

  test("confirmEstimate on another user's observation is rejected with no dual-write", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const created = await service.createObservation(estimatedInput({ user_id: 1 }));

    await expect(service.confirmEstimate(created.observation.id, 2))
      .rejects.toThrow(NotFoundError);
    expect(state.nutritionLogs).toHaveLength(0);
    // The observation itself is untouched — still a pending draft.
    expect(state.observations[0]!.status).toBe("draft");
  });

  test("calculateForReference on another user's observation is rejected", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    state.references.set(REF2.id, REF2);
    const service = createNutritionEstimationService({ repo, matcher: autoMatcher(REF) });

    const created = await service.createObservation(estimatedInput({ user_id: 1 }));

    await expect(service.calculateForReference(created.observation.id, REF2.id, 2))
      .rejects.toThrow(NotFoundError);
    // No revision was saved for the cross-user attempt.
    expect(state.revisions).toHaveLength(1);
    expect(state.observations[0]!.reference_id).toBe(REF.id);
  });

  test("resolveReference on another user's observation is rejected", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(REF.id, REF);
    state.references.set(REF2.id, REF2);
    const service = createNutritionEstimationService({ repo, matcher: ambiguousMatcher() });

    const created = await service.createObservation(estimatedInput({ user_id: 1 }));
    expect(created.observation.status).toBe("draft");

    await expect(service.resolveReference(created.observation.id, REF2.id, 2))
      .rejects.toThrow(NotFoundError);
    // Status stays draft for the owner's later resolution.
    expect(state.observations[0]!.status).toBe("draft");
  });
});

describe("searchReferences — vector tier (ADR 0014)", () => {
  const EGG: ReferenceRow = {
    ...REF,
    id: 301,
    providerFoodCode: "TFC-301",
    nameEn: "Fried egg",
    nameTh: "ไข่ดาว",
  };
  const OIL: ReferenceRow = {
    ...REF,
    id: 302,
    providerFoodCode: "TFC-302",
    nameEn: "Vegetable oil",
    nameTh: "น้ำมันพืช",
  };

  test("a query with no lexical hit returns pgvector neighbors when an embedder is available", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(EGG.id, EGG);
    const vectorRepo = {
      ...repo,
      searchByEmbedding: async () => [{ ...EGG, similarity: 0.813 }],
    } as unknown as NutritionEstimationRepository;
    const service = createNutritionEstimationService({
      repo: vectorRepo,
      matcher: gapMatcher(),
      embed: async () => [1],
    });

    const result = await service.searchReferences("ไข่ดาวจานโปรด");

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe(EGG.id);
    expect(result.items[0]!.score).toBeCloseTo(0.813);
  });

  test("vector neighbors fill the cap after lexical hits and never duplicate them", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(EGG.id, EGG);
    state.references.set(OIL.id, OIL);
    const vectorRepo = {
      ...repo,
      searchByEmbedding: async () => [
        { ...EGG, similarity: 0.9 },
        { ...OIL, similarity: 0.8 },
      ],
    } as unknown as NutritionEstimationRepository;
    const service = createNutritionEstimationService({
      repo: vectorRepo,
      matcher: gapMatcher(),
      embed: async () => [1],
    });

    // "ไข่ดาว" lexically hits EGG (token overlap); OIL only exists via vector.
    const result = await service.searchReferences("ไข่ดาว");

    expect(result.items.map((item) => item.id)).toEqual([EGG.id, OIL.id]);
    expect(result.items[1]!.score).toBeCloseTo(0.8);
  });

  test("vector hits below the 0.5 floor are dropped", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(EGG.id, EGG);
    const vectorRepo = {
      ...repo,
      searchByEmbedding: async () => [{ ...OIL, similarity: 0.4 }],
    } as unknown as NutritionEstimationRepository;
    const service = createNutritionEstimationService({
      repo: vectorRepo,
      matcher: gapMatcher(),
      embed: async () => [1],
    });

    const result = await service.searchReferences("อะไรไม่รู้");

    expect(result.items).toHaveLength(0);
  });

  test("no embedder configured → lexical only, never crashes", async () => {
    const { repo, state } = createFakeRepo();
    state.references.set(EGG.id, EGG);
    let embedCalls = 0;
    const vectorRepo = {
      ...repo,
      searchByEmbedding: async () => {
        embedCalls++;
        return [];
      },
    } as unknown as NutritionEstimationRepository;
    const service = createNutritionEstimationService({ repo: vectorRepo, matcher: gapMatcher() });

    const result = await service.searchReferences("ไข่ดาวจานโปรด");

    expect(result.items).toHaveLength(0);
    expect(embedCalls).toBe(0);
  });
});
