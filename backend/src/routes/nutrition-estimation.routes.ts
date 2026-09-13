// src/routes/nutrition-estimation.routes.ts
// Meal Observation endpoints for Nutrition Estimation V1 (design spec §1, §7).
// Registered inside the /api group; image upload endpoints are out of scope —
// only the interpret pass-through accepts base64 payloads (size-capped).
import { t } from "elysia";
import { routeHandlerCtx } from "../lib/route-handler";
import { MEAL_VALUES } from "../constants";
import {
  COMPONENT_KINDS,
  EVIDENCE_BASES,
  EVIDENCE_SOURCES,
  HINT_KINDS,
  HINT_LEVELS,
  PORTION_MODES,
} from "../nutrition-estimation/types";
import type { AppContext } from "../context";

const literals = <T extends readonly string[]>(values: T) =>
  values.map((v) => t.Literal(v));

const MassRangeSchema = t.Object({
  low: t.Number(),
  central: t.Number(),
  high: t.Number(),
});

// ≈ 6 MB of base64 per image (~4.5 MB binary) — uploads proper go through the
// R2 pipeline (ADR 0013/0023); this cap only guards the interpret pass-through.
const IMAGE_BASE64_MAX_LENGTH = 8_000_000;

const Per100Schema = t.Object({
  protein: t.Number(),
  carbs: t.Number(),
  fat: t.Number(),
  alcohol: t.Number(),
  calories: t.Number(),
});

const ComponentSchema = t.Object({
  name: t.String(),
  kind: t.Optional(t.Union(literals(COMPONENT_KINDS))),
  weight_g: t.Union([t.Number(), MassRangeSchema]),
  consumed_fraction: t.Optional(t.Number()),
  ingredient_evidence: t.Optional(
    t.Array(
      t.Object({
        name: t.String(),
        source: t.Union(literals(EVIDENCE_SOURCES)),
        basis: t.Union(literals(EVIDENCE_BASES)),
        grams: t.Union([t.Number(), MassRangeSchema]),
        per100: t.Optional(Per100Schema),
      }),
    ),
  ),
  latent_hints: t.Optional(
    t.Array(
      t.Object({
        kind: t.Union(literals(HINT_KINDS)),
        level: t.Union(literals(HINT_LEVELS)),
      }),
    ),
  ),
});

const InterpretationSchema = t.Object({
  menu_name: t.String({ maxLength: 300 }),
  before_image_base64: t.Optional(t.String({ maxLength: IMAGE_BASE64_MAX_LENGTH })),
  after_image_base64: t.Optional(t.String({ maxLength: IMAGE_BASE64_MAX_LENGTH })),
});

export function registerNutritionEstimationRoutes(app: any, ctx: AppContext): void {
  const { nutritionEstimationService } = ctx;

  app
    // Pending list first so the static path wins over /:id.
    .get("/meal-observations/pending", routeHandlerCtx(async () => {
      return await nutritionEstimationService.listPending();
    }))
    // Reference search for the pending-meal resolution picker (design spec §7).
    // Static path registered before /:id; query params arrive as strings, so
    // limit is coerced here (invalid → undefined → service default 10).
    .get("/meal-observations/references/search", routeHandlerCtx(async ({ query }) => {
      const parsed = query.limit !== undefined ? Number.parseInt(query.limit, 10) : Number.NaN;
      return await nutritionEstimationService.searchReferences(
        query.q,
        Number.isFinite(parsed) ? parsed : undefined,
      );
    }), {
      query: t.Object({
        q: t.String({ minLength: 1 }),
        limit: t.Optional(t.String()),
      }),
    })
    .get("/meal-observations/:id", routeHandlerCtx(async ({ params }) => {
      return await nutritionEstimationService.getObservation(Number(params.id));
    }))
    .post("/meal-observations", routeHandlerCtx(async ({ body }) => {
      return await nutritionEstimationService.createObservation({
        date: body.date,
        meal: body.meal,
        menu_name: body.menu_name,
        portion_mode: body.portion_mode,
        meal_source: body.meal_source,
        components: body.components,
        reference_id: body.reference_id,
        has_after_image: body.has_after_image,
      });
    }), {
      body: t.Object({
        date: t.Optional(t.String()),
        meal: t.Union(literals(MEAL_VALUES)),
        menu_name: t.String({ minLength: 1, maxLength: 300 }),
        portion_mode: t.Union(literals(PORTION_MODES)),
        meal_source: t.Optional(t.String({ maxLength: 200 })),
        components: t.Array(ComponentSchema, { minItems: 1 }),
        reference_id: t.Optional(t.Integer()),
        // Fractions were confirmed against an after image → any value in (0, 1]
        // is accepted; otherwise only the fixed quartile choices (ADR 0015).
        has_after_image: t.Optional(t.Boolean()),
      }),
    })
    .post("/meal-observations/interpret", routeHandlerCtx(async ({ body }) => {
      return await nutritionEstimationService.interpret({
        menuName: body.menu_name,
        beforeImageBase64: body.before_image_base64,
        afterImageBase64: body.after_image_base64,
      });
    }), {
      body: InterpretationSchema,
    })
    .post("/meal-observations/:id/confirm", routeHandlerCtx(async ({ params }) => {
      return await nutritionEstimationService.confirmEstimate(Number(params.id));
    }))
    .post("/meal-observations/:id/resolve", routeHandlerCtx(async ({ params, body }) => {
      return await nutritionEstimationService.resolveReference(
        Number(params.id),
        body.reference_id,
      );
    }), {
      body: t.Object({
        reference_id: t.Integer(),
      }),
    });
}
