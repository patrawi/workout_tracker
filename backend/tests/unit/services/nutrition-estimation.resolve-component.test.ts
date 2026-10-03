// Tests for resolveComponentReference (ADR 0026): pick a catalog reference
// for ONE component of a saved observation, keep every other component's
// sourcing, recalculate, and persist a pending revision.
import { describe, test, expect } from "bun:test";
import { createNutritionEstimationService } from "../../../src/nutrition-estimation/service";
import type {
    CalculationResult,
} from "../../../src/nutrition-estimation/types";
import type {
    CreateObservationInput,
    NutritionEstimationRepository,
    ObservationDetail,
    PersistedObservation,
    PersistedRevision,
} from "../../../src/repositories/nutrition-estimation.repository";
import type { ReferenceRow } from "../../../src/nutrition-estimation/matching/matcher";
import { ValidationError, NotFoundError, ConflictError } from "../../../src/lib/errors";

const REF_A: ReferenceRow = {
    id: 11,
    provider: "thaifcd",
    providerFoodCode: "T-11",
    version: "2024.1",
    nameEn: "Steamed rice",
    nameTh: "ข้าวสวย",
    per100: { protein: 3, carbs: 28, fat: 0.5, alcohol: 0, calories: 130 },
};
const REF_B: ReferenceRow = {
    id: 12,
    provider: "thaifcd",
    providerFoodCode: "T-12",
    version: "2024.1",
    nameEn: "Stir fried pork",
    nameTh: "หมูผัด",
    per100: { protein: 20, carbs: 5, fat: 12, alcohol: 0, calories: 210 },
};

function componentRow(id: number, observationId: number, name: string, kind: string, position: number) {
    return {
        id,
        observation_id: observationId,
        name,
        kind,
        weight_mode: "estimated" as const,
        weight_low: 90,
        weight_central: 100,
        weight_high: 110,
        consumed_fraction: 1,
        position,
        ingredient_evidence: [],
        latent_hints: [],
    };
}

/** An observation whose latest calculation: comp0 matched REF_A, comp1 is a kind-prior estimate. */
function observationWithCalculation(state: {
    observations: Array<PersistedObservation & { id: number; user_id: number }>;
    components: Array<Record<string, unknown>>;
    revisions: Array<PersistedRevision>;
}) {
    const calc: CalculationResult = {
        nutrients: {
            protein: { low: 3, central: 3, high: 3 },
            carbs: { low: 28, central: 28, high: 28 },
            fat: { low: 0.5, central: 0.5, high: 0.5 },
            alcohol: { low: 0, central: 0, high: 0 },
            calories: { low: 130, central: 130, high: 130 },
        },
        relaxed: false,
        relaxed_constraints: [],
        drivers: [],
        per_component: [
            {
                name: "ข้าวสวย",
                consumed_weight_g: { low: 90, central: 100, high: 110 },
                contribution: {
                    protein: { low: 2.7, central: 3, high: 3.3 },
                    carbs: { low: 25.2, central: 28, high: 30.8 },
                    fat: { low: 0.45, central: 0.5, high: 0.55 },
                    alcohol: { low: 0, central: 0, high: 0 },
                    calories: { low: 117, central: 130, high: 143 },
                },
                estimated: false,
                reference: { id: REF_A.id, provider: REF_A.provider, provider_food_code: REF_A.providerFoodCode, name_th: REF_A.nameTh, name_en: REF_A.nameEn, score: 0.95 },
            },
            {
                name: "แกงป่าไม่รู้จัก",
                consumed_weight_g: { low: 90, central: 100, high: 110 },
                contribution: {
                    protein: { low: 2.7, central: 3, high: 3.3 },
                    carbs: { low: 9, central: 10, high: 11 },
                    fat: { low: 2.7, central: 3, high: 3.3 },
                    alcohol: { low: 0, central: 0, high: 0 },
                    calories: { low: 81, central: 90, high: 99 },
                },
                estimated: true,
                reference: null,
            },
        ],
    };
    state.observations.push({
        id: 1,
        user_id: 1,
        date: "2026-09-29",
        meal_type: "Lunch",
        menu_name: "มื้อทดสอบ",
        portion_mode: "estimated",
        meal_source: null,
        status: "draft",
        reference_id: REF_A.id,
        match_tier: "gap",
        calculation: calc,
        created_at: "2026-09-29 12:00:00",
        updated_at: "2026-09-29 12:00:00",
    });
    state.components.push(
        componentRow(101, 1, "ข้าวสวย", "rice", 0),
        componentRow(102, 1, "แกงป่าไม่รู้จัก", "broth", 1),
    );
    state.revisions.push({
        id: 201,
        observation_id: 1,
        reference_id: REF_A.id,
        reference_provider: REF_A.provider,
        reference_version: REF_A.version,
        calculation: calc,
        status: "pending_confirmation",
        created_at: "2026-09-29 12:00:00",
        confirmed_at: null,
    });
    return calc;
}

function createFakeRepo() {
    const state = {
        observations: [] as Array<PersistedObservation & { id: number; user_id: number }>,
        components: [] as Array<Record<string, unknown>>,
        revisions: [] as PersistedRevision[],
        references: new Map<number, ReferenceRow>([
            [REF_A.id, REF_A],
            [REF_B.id, REF_B],
        ]),
        nextId: 900,
    };

    function detailOf(id: number, userId?: number): ObservationDetail | null {
        const obs = state.observations.find(
            (o) => o.id === id && (userId === undefined || o.user_id === userId),
        );
        if (!obs) return null;
        const components = state.components
            .filter((c) => c.observation_id === id)
            .sort((a, b) => (a.position as number) - (b.position as number))
            .map((c) => ({
                ...c,
                ingredient_evidence: [],
                latent_hints: [],
            }));
        const revisions = state.revisions
            .filter((r) => r.observation_id === id)
            .sort((a, b) => b.id - a.id);
        const reference = obs.reference_id !== null ? state.references.get(obs.reference_id) ?? null : null;
        return { ...obs, components, latest_revision: revisions[0] ?? null, reference } as unknown as ObservationDetail;
    }

    const repo = {
        async getObservationDetail(id: number, userId: number) {
            return detailOf(id, userId);
        },
        async getReferenceById(id: number) {
            return state.references.get(id) ?? null;
        },
        async insertRevision(rev: {
            observation_id: number;
            reference_id: number | null;
            reference_provider: string | null;
            reference_version: string | null;
            calculation: CalculationResult;
            status?: string;
        }) {
            const row: PersistedRevision = {
                id: state.nextId++,
                observation_id: rev.observation_id,
                reference_id: rev.reference_id,
                reference_provider: rev.reference_provider,
                reference_version: rev.reference_version,
                calculation: rev.calculation,
                status: (rev.status ?? "pending_confirmation") as PersistedRevision["status"],
                created_at: "2026-09-29 12:30:00",
                confirmed_at: null,
            };
            state.revisions.push(row);
            return row;
        },
        async updateObservationEstimate(
            id: number,
            update: { reference_id: number | null; calculation: CalculationResult },
            userId: number,
        ) {
            const obs = state.observations.find((o) => o.id === id && o.user_id === userId);
            if (!obs) return;
            obs.reference_id = update.reference_id;
            obs.calculation = update.calculation;
        },
        async updateObservationStatus(id: number, status: string, userId: number) {
            const obs = state.observations.find((o) => o.id === id && o.user_id === userId);
            if (obs) obs.status = status as PersistedObservation["status"];
        },
        async listReferences() {
            return [...state.references.values()];
        },
        async insertObservation(_input: CreateObservationInput) {
            return 1;
        },
        async upsertNutritionLogLink() {
            return 1;
        },
        async updateRevisionStatus() {},
        async supersedeConfirmedRevisions() {},
        async listPending() {
            return [];
        },
        async findByFoodCode() {
            return null;
        },
        async searchByEmbedding() {
            return [];
        },
    };
    return { repo: repo as unknown as NutritionEstimationRepository, state };
}

function makeService(repo: NutritionEstimationRepository) {
    return createNutritionEstimationService({
        repo,
        matcher: { matchReference: async () => ({ tier: "gap" }) },
    });
}

describe("resolveComponentReference (ADR 0026 per-component resolve)", () => {
    test("resolves one component to the chosen reference and keeps the others", async () => {
        const { repo, state } = createFakeRepo();
        const prevCalc = observationWithCalculation(state);
        const service = makeService(repo);

        const result = await service.resolveComponentReference(1, 1, REF_B.id, 1);

        // Component 1 now uses REF_B: 100 g × 210 kcal/100 g = 210 kcal.
        const calc = result.observation.calculation!;
        expect(calc.per_component[1]!.contribution.calories.central).toBeCloseTo(210);
        expect(calc.per_component[1]!.estimated).toBe(false);
        expect(calc.per_component[1]!.reference?.id).toBe(REF_B.id);
        // Component 0 keeps REF_A: 100 g × 130 = 130 kcal.
        expect(calc.per_component[0]!.contribution.calories.central).toBeCloseTo(130);
        expect(calc.per_component[0]!.reference?.id).toBe(REF_A.id);
        expect(calc.nutrients.calories.central).toBeCloseTo(340);
        expect(calc.drivers.join(" ")).toContain("แกงป่าไม่รู้จัก");
        // New pending revision, observation back to draft, no fabricated single reference.
        expect(result.revision.status).toBe("pending_confirmation");
        expect(result.observation.status).toBe("draft");
        expect(state.revisions).toHaveLength(2);
        expect(prevCalc.per_component[1]!.estimated).toBe(true); // source calc untouched
    });

    test("rejects a confirmed observation", async () => {
        const { repo, state } = createFakeRepo();
        observationWithCalculation(state);
        state.observations[0]!.status = "confirmed";
        const service = makeService(repo);

        expect(service.resolveComponentReference(1, 1, REF_B.id, 1)).rejects.toThrow(ConflictError);
    });

    test("rejects an unknown reference", async () => {
        const { repo, state } = createFakeRepo();
        observationWithCalculation(state);
        const service = makeService(repo);

        expect(service.resolveComponentReference(1, 0, 999, 1)).rejects.toThrow(NotFoundError);
    });

    test("rejects an out-of-range position", async () => {
        const { repo, state } = createFakeRepo();
        observationWithCalculation(state);
        const service = makeService(repo);

        expect(service.resolveComponentReference(1, 9, REF_B.id, 1)).rejects.toThrow(ValidationError);
    });
});
