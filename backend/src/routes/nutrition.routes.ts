// src/routes/nutrition.routes.ts

import { t } from "elysia";
import { routeHandler, routeHandlerCtx } from "../lib/route-handler";
import { ValidationError } from "../lib/errors";
import type { AppContext } from "../context";

const MEAL_VALUES = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

export function registerNutritionRoutes(app: any, ctx: AppContext): void {
  const { nutritionService } = ctx;

  app
    .post("/nutrition/parse", routeHandlerCtx(async ({ body }) => {
      return await nutritionService.parse(body.raw_text);
    }), {
      body: t.Object({
        raw_text: t.String(),
      }),
    })
    .post("/nutrition/confirm", routeHandlerCtx(async ({ body }) => {
      return await nutritionService.log(body.items, body.date);
    }), {
      body: t.Object({
        date: t.String(),
        items: t.Array(
          t.Object({
            food_name: t.String(),
            meal: t.Union(MEAL_VALUES.map((v) => t.Literal(v))),
            protein: t.Number(),
            carbs: t.Number(),
            fat: t.Number(),
            calories: t.Number(),
            has_missing_macros: t.Boolean(),
          }),
        ),
      }),
    })
    .get("/nutrition/date/:date", routeHandlerCtx(async ({ params }) => {
      return await nutritionService.getByDate(params.date);
    }))
    .get("/nutrition/dates", routeHandler(async () => {
      return await nutritionService.getDates();
    }))
    .put("/nutrition/:id", routeHandlerCtx(async ({ params, body }) => {
      const id = Number(params.id);
      const updated = await nutritionService.update(id, body);
      if (!updated) {
        throw new ValidationError("Item not found");
      }
      return updated;
    }), {
      body: t.Object({
        food_name: t.Optional(t.String()),
        meal: t.Optional(t.Union(MEAL_VALUES.map((v) => t.Literal(v)))),
        protein: t.Optional(t.Number()),
        carbs: t.Optional(t.Number()),
        fat: t.Optional(t.Number()),
        calories: t.Optional(t.Number()),
      }),
    })
    .delete("/nutrition/:id", routeHandlerCtx(async ({ params }) => {
      await nutritionService.deleteItem(Number(params.id));
      return { deleted: true };
    }))
    .delete("/nutrition/date/:date", routeHandlerCtx(async ({ params }) => {
      await nutritionService.deleteByDate(params.date);
      return { deleted: true };
    }));
}
