// Persistence for Nutrition Estimation V1 (design spec §8, ADR 0012, 0020, 0022).
// The estimate tables own the full model (observations + components + evidence +
// hints + revisions); `nutrition_logs` only receives a dual-written point row
// with provenance markers when an estimate is confirmed.
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  mealComponents,
  mealIngredientEvidence,
  mealLatentHints,
  mealObservations,
  nutritionEstimateRevisions,
  nutritionLogs,
  nutritionReferences,
} from "../schema";
import type {
  CalculationResult,
  ComponentKind,
  EvidenceSource,
  IngredientBasis,
  LatentHintKind,
  LatentHintLevel,
  Macronutrients,
  MatchTier,
} from "../nutrition-estimation/types";
import type { ReferenceRow } from "../nutrition-estimation/types";

export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";
export type ObservationStatus = "draft" | "confirmed" | "reference_pending";
export type RevisionStatus = "pending_confirmation" | "confirmed" | "superseded";

export interface CreateIngredientEvidenceInput {
  name: string;
  source: EvidenceSource;
  basis: IngredientBasis;
  /** Point value → all three columns set equal; range → low/central/high. */
  grams_low: number | null;
  grams_central: number | null;
  grams_high: number | null;
  per100: Macronutrients | null;
}

export interface CreateLatentHintInput {
  kind: LatentHintKind;
  level: LatentHintLevel;
}

export interface CreateComponentInput {
  name: string;
  kind: ComponentKind;
  weight_mode: "measured" | "estimated";
  weight_low: number | null;
  weight_central: number | null;
  weight_high: number | null;
  consumed_fraction: number;
  position: number;
  ingredient_evidence?: CreateIngredientEvidenceInput[];
  latent_hints?: CreateLatentHintInput[];
}

export interface CreateObservationInput {
  date: string;
  meal_type: MealType;
  menu_name: string;
  portion_mode: "measured" | "estimated";
  meal_source: string | null;
  status: ObservationStatus;
  reference_id: number | null;
  match_tier: MatchTier | null;
  calculation: CalculationResult | null;
  components: CreateComponentInput[];
}

export interface PersistedIngredientEvidence {
  id: number;
  component_id: number;
  name: string;
  source: EvidenceSource;
  basis: IngredientBasis;
  grams_low: number | null;
  grams_central: number | null;
  grams_high: number | null;
  per100: Macronutrients | null;
}

export interface PersistedLatentHint {
  id: number;
  component_id: number;
  kind: LatentHintKind;
  level: LatentHintLevel;
}

export interface PersistedComponent {
  id: number;
  observation_id: number;
  name: string;
  kind: ComponentKind;
  weight_mode: "measured" | "estimated";
  weight_low: number | null;
  weight_central: number | null;
  weight_high: number | null;
  consumed_fraction: number;
  position: number;
  ingredient_evidence: PersistedIngredientEvidence[];
  latent_hints: PersistedLatentHint[];
}

export interface PersistedRevision {
  id: number;
  observation_id: number;
  reference_id: number | null;
  reference_provider: string | null;
  reference_version: string | null;
  calculation: CalculationResult;
  status: RevisionStatus;
  created_at: string | null;
  confirmed_at: string | null;
}

export interface PersistedObservation {
  id: number;
  date: string;
  meal_type: MealType;
  menu_name: string;
  portion_mode: "measured" | "estimated";
  meal_source: string | null;
  status: ObservationStatus;
  reference_id: number | null;
  match_tier: MatchTier | null;
  calculation: CalculationResult | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ObservationDetail extends PersistedObservation {
  components: PersistedComponent[];
  latest_revision: PersistedRevision | null;
  reference: ReferenceRow | null;
}

export interface UpsertNutritionLogInput {
  date: string;
  meal: MealType;
  food_name: string;
  protein: number;
  carbs: number;
  fat: number;
  alcohol: number;
  calories: number;
  observation_id: number;
}

export interface UpdateEstimateInput {
  reference_id: number;
  calculation: CalculationResult;
}

export function createNutritionEstimationRepository(dbInstance: PostgresJsDatabase) {
  const REFERENCE_COLUMNS = {
    id: nutritionReferences.id,
    provider: nutritionReferences.provider,
    provider_food_code: nutritionReferences.provider_food_code,
    version: nutritionReferences.version,
    name_en: nutritionReferences.name_en,
    name_th: nutritionReferences.name_th,
    protein: nutritionReferences.protein,
    carbs: nutritionReferences.carbs,
    fat: nutritionReferences.fat,
    alcohol: nutritionReferences.alcohol,
    calories: nutritionReferences.calories,
  } as const;

  type ReferenceSqlRow = {
    id: number;
    provider: string;
    provider_food_code: string;
    version: string;
    name_en: string | null;
    name_th: string | null;
    protein: number;
    carbs: number;
    fat: number;
    alcohol: number;
    calories: number;
  };

  function mapReferenceRow(row: ReferenceSqlRow): ReferenceRow {
    return {
      id: row.id,
      provider: row.provider,
      providerFoodCode: row.provider_food_code,
      version: row.version,
      nameEn: row.name_en,
      nameTh: row.name_th,
      per100: {
        protein: row.protein,
        carbs: row.carbs,
        fat: row.fat,
        alcohol: row.alcohol,
        calories: row.calories,
      },
    };
  }

  function mapObservationRow(row: typeof mealObservations.$inferSelect): PersistedObservation {
    return {
      id: row.id,
      date: row.date,
      meal_type: row.meal_type,
      menu_name: row.menu_name,
      portion_mode: row.portion_mode,
      meal_source: row.meal_source,
      status: row.status,
      reference_id: row.reference_id,
      match_tier: row.match_tier,
      calculation: row.calculation ?? null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    };
  }

  return {
    /**
     * Insert an observation with its components, ingredient evidence and
     * latent hints in one transaction. Returns the observation id.
     */
    async insertObservation(input: CreateObservationInput): Promise<number> {
      return await dbInstance.transaction(async (tx) => {
        const [observation] = await tx
          .insert(mealObservations)
          .values({
            date: input.date,
            meal_type: input.meal_type,
            menu_name: input.menu_name,
            portion_mode: input.portion_mode,
            meal_source: input.meal_source,
            status: input.status,
            reference_id: input.reference_id,
            match_tier: input.match_tier,
            calculation: input.calculation,
          })
          .returning();

        const observationId = observation!.id;

        for (const component of input.components) {
          const [insertedComponent] = await tx
            .insert(mealComponents)
            .values({
              observation_id: observationId,
              name: component.name,
              kind: component.kind,
              weight_mode: component.weight_mode,
              weight_low: component.weight_low,
              weight_central: component.weight_central,
              weight_high: component.weight_high,
              consumed_fraction: component.consumed_fraction,
              position: component.position,
            })
            .returning();

          const componentId = insertedComponent!.id;

          if (component.ingredient_evidence?.length) {
            await tx.insert(mealIngredientEvidence).values(
              component.ingredient_evidence.map((e) => ({
                component_id: componentId,
                name: e.name,
                source: e.source,
                basis: e.basis,
                grams_low: e.grams_low,
                grams_central: e.grams_central,
                grams_high: e.grams_high,
                per100: e.per100,
              })),
            );
          }
          if (component.latent_hints?.length) {
            await tx.insert(mealLatentHints).values(
              component.latent_hints.map((h) => ({
                component_id: componentId,
                kind: h.kind,
                level: h.level,
              })),
            );
          }
        }

        return observationId;
      });
    },

    /** Full aggregate: observation + components + evidence + hints + latest revision + reference. */
    async getObservationDetail(id: number): Promise<ObservationDetail | null> {
      const [observation] = await dbInstance
        .select()
        .from(mealObservations)
        .where(eq(mealObservations.id, id))
        .limit(1);
      if (!observation) return null;

      const componentRows = await dbInstance
        .select()
        .from(mealComponents)
        .where(eq(mealComponents.observation_id, id))
        .orderBy(asc(mealComponents.position), asc(mealComponents.id));

      const componentIds = componentRows.map((c) => c.id);
      const evidenceRows = componentIds.length
        ? await dbInstance
            .select()
            .from(mealIngredientEvidence)
            .where(inArray(mealIngredientEvidence.component_id, componentIds))
        : [];
      const hintRows = componentIds.length
        ? await dbInstance
            .select()
            .from(mealLatentHints)
            .where(inArray(mealLatentHints.component_id, componentIds))
        : [];

      const [revision] = await dbInstance
        .select()
        .from(nutritionEstimateRevisions)
        .where(eq(nutritionEstimateRevisions.observation_id, id))
        .orderBy(desc(nutritionEstimateRevisions.id))
        .limit(1);

      let reference: ReferenceRow | null = null;
      const referenceId = observation.reference_id;
      if (referenceId !== null) {
        const [refRow] = await dbInstance
          .select(REFERENCE_COLUMNS)
          .from(nutritionReferences)
          .where(eq(nutritionReferences.id, referenceId))
          .limit(1);
        if (refRow) reference = mapReferenceRow(refRow);
      }

      return {
        ...mapObservationRow(observation),
        components: componentRows.map((c) => ({
          id: c.id,
          observation_id: c.observation_id,
          name: c.name,
          kind: c.kind,
          weight_mode: c.weight_mode,
          weight_low: c.weight_low,
          weight_central: c.weight_central,
          weight_high: c.weight_high,
          consumed_fraction: c.consumed_fraction,
          position: c.position,
          ingredient_evidence: evidenceRows
            .filter((e) => e.component_id === c.id)
            .map((e) => ({
              id: e.id,
              component_id: e.component_id,
              name: e.name,
              source: e.source,
              basis: e.basis,
              grams_low: e.grams_low,
              grams_central: e.grams_central,
              grams_high: e.grams_high,
              per100: e.per100 ?? null,
            })),
          latent_hints: hintRows
            .filter((h) => h.component_id === c.id)
            .map((h) => ({ id: h.id, component_id: h.component_id, kind: h.kind, level: h.level })),
        })),
        latest_revision: revision
          ? {
              id: revision.id,
              observation_id: revision.observation_id,
              reference_id: revision.reference_id,
              reference_provider: revision.reference_provider,
              reference_version: revision.reference_version,
              calculation: revision.calculation,
              status: revision.status,
              created_at: revision.created_at ?? null,
              confirmed_at: revision.confirmed_at ?? null,
            }
          : null,
        reference,
      };
    },

    /** Pending work queue: reference-pending meals plus unconfirmed drafts. */
    async listPending(): Promise<PersistedObservation[]> {
      const rows = await dbInstance
        .select()
        .from(mealObservations)
        .where(inArray(mealObservations.status, ["reference_pending", "draft"]))
        .orderBy(desc(mealObservations.created_at));
      return rows.map(mapObservationRow);
    },

    /**
     * Dual-write (ADR 0022): insert the point-estimate row into nutrition_logs
     * with provenance markers, or update the already-linked row when a newer
     * confirmed revision supersedes the previous write.
     */
    async upsertNutritionLogLink(input: UpsertNutritionLogInput): Promise<number> {
      const [existing] = await dbInstance
        .select({ id: nutritionLogs.id })
        .from(nutritionLogs)
        .where(
          and(
            isNotNull(nutritionLogs.observation_id),
            eq(nutritionLogs.observation_id, input.observation_id),
          ),
        )
        .limit(1);

      if (existing) {
        await dbInstance
          .update(nutritionLogs)
          .set({
            date: input.date,
            meal: input.meal,
            food_name: input.food_name,
            protein: input.protein,
            carbs: input.carbs,
            fat: input.fat,
            alcohol: input.alcohol,
            calories: input.calories,
            source: "meal_observation",
          })
          .where(eq(nutritionLogs.id, existing.id));
        return existing.id;
      }

      const [inserted] = await dbInstance
        .insert(nutritionLogs)
        .values({
          date: input.date,
          meal: input.meal,
          food_name: input.food_name,
          protein: input.protein,
          carbs: input.carbs,
          fat: input.fat,
          alcohol: input.alcohol,
          calories: input.calories,
          source: "meal_observation",
          observation_id: input.observation_id,
        })
        .returning({ id: nutritionLogs.id });
      return inserted!.id;
    },

    async insertRevision(revision: {
      observation_id: number;
      reference_id: number | null;
      reference_provider: string | null;
      reference_version: string | null;
      calculation: CalculationResult;
      status?: RevisionStatus;
    }): Promise<PersistedRevision> {
      const [row] = await dbInstance
        .insert(nutritionEstimateRevisions)
        .values({
          observation_id: revision.observation_id,
          reference_id: revision.reference_id,
          reference_provider: revision.reference_provider,
          reference_version: revision.reference_version,
          calculation: revision.calculation,
          status: revision.status ?? "pending_confirmation",
        })
        .returning();
      return {
        id: row!.id,
        observation_id: row!.observation_id,
        reference_id: row!.reference_id,
        reference_provider: row!.reference_provider,
        reference_version: row!.reference_version,
        calculation: row!.calculation,
        status: row!.status,
        created_at: row!.created_at ?? null,
        confirmed_at: row!.confirmed_at ?? null,
      };
    },

    async updateRevisionStatus(id: number, status: RevisionStatus): Promise<void> {
      await dbInstance
        .update(nutritionEstimateRevisions)
        .set({
          status,
          ...(status === "confirmed" ? { confirmed_at: sql`now()` } : {}),
        })
        .where(eq(nutritionEstimateRevisions.id, id));
    },

    /** Supersede every previously confirmed revision except the one just confirmed. */
    async supersedeConfirmedRevisions(observationId: number, exceptRevisionId: number): Promise<void> {
      await dbInstance
        .update(nutritionEstimateRevisions)
        .set({ status: "superseded" })
        .where(
          and(
            eq(nutritionEstimateRevisions.observation_id, observationId),
            eq(nutritionEstimateRevisions.status, "confirmed"),
            sql`${nutritionEstimateRevisions.id} <> ${exceptRevisionId}`,
          ),
        );
    },

    async getReferenceById(id: number): Promise<ReferenceRow | null> {
      const [row] = await dbInstance
        .select(REFERENCE_COLUMNS)
        .from(nutritionReferences)
        .where(eq(nutritionReferences.id, id))
        .limit(1);
      return row ? mapReferenceRow(row) : null;
    },

    async updateObservationStatus(id: number, status: ObservationStatus): Promise<void> {
      await dbInstance
        .update(mealObservations)
        .set({ status, updated_at: sql`now()` })
        .where(eq(mealObservations.id, id));
    },

    /** Persist a calculated estimate onto the observation (reference, cached calculation). */
    async updateObservationEstimate(id: number, update: UpdateEstimateInput): Promise<void> {
      await dbInstance
        .update(mealObservations)
        .set({
          reference_id: update.reference_id,
          calculation: update.calculation,
          updated_at: sql`now()`,
        })
        .where(eq(mealObservations.id, id));
    },

    // ——— ReferenceMatcherRepo implementation (ADR 0014 hybrid retrieval) ———

    /** Exact food-code lookup, case-insensitive on the trimmed code (spec §7 tier 0). */
    async findByFoodCode(code: string): Promise<ReferenceRow | null> {
      const normalized = code.trim().toLowerCase();
      if (!normalized) return null;
      const [row] = await dbInstance
        .select(REFERENCE_COLUMNS)
        .from(nutritionReferences)
        .where(sql`lower(${nutritionReferences.provider_food_code}) = ${normalized}`)
        .limit(1);
      return row ? mapReferenceRow(row) : null;
    },

    /** Candidate pool for lexical matching (Nutrition Reference Catalog). */
    async listReferences(): Promise<ReferenceRow[]> {
      const rows = await dbInstance.select(REFERENCE_COLUMNS).from(nutritionReferences);
      return rows.map(mapReferenceRow);
    },

    /** pgvector fallback: nearest references by cosine similarity. */
    async searchByEmbedding(
      embedding: number[],
      k = 10,
    ): Promise<Array<ReferenceRow & { similarity: number }>> {
      const distance = cosineDistance(nutritionReferences.embedding, embedding);
      const rows = await dbInstance
        .select({ ...REFERENCE_COLUMNS, similarity: sql<number>`1 - (${distance})` })
        .from(nutritionReferences)
        .orderBy(distance)
        .limit(k);
      return rows.map((row) => ({ ...mapReferenceRow(row), similarity: Number(row.similarity) }));
    },
  };
}

export type NutritionEstimationRepository = ReturnType<typeof createNutritionEstimationRepository>;
