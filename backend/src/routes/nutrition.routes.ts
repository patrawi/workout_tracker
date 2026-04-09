import { t } from "elysia";
import { ok, fail, getErrorMessage } from "../lib/api";
import type { ApiResponse, NutritionItem, NutritionRow } from "../types";
import { parseNutritionText } from "../nutrition-ai";
import {
  insertNutritionItems,
  getNutritionByDate,
  getNutritionDates,
  deleteNutritionItem,
  deleteNutritionByDate,
  updateNutritionItem,
} from "../repositories/nutrition.repository";

type NutritionRouteApp = {
  get: (...args: any[]) => NutritionRouteApp;
  post: (...args: any[]) => NutritionRouteApp;
  put: (...args: any[]) => NutritionRouteApp;
  delete: (...args: any[]) => NutritionRouteApp;
};

type ParseBodyContext = {
  body: {
    raw_text: string;
  };
};

type ConfirmBodyContext = {
  body: {
    date: string;
    items: NutritionItem[];
  };
};

type UpdateBodyContext = {
  params: {
    id: string;
  };
  body: {
    food_name?: string;
    meal?: "Breakfast" | "Lunch" | "Dinner" | "Snack";
    protein?: number;
    carbs?: number;
    fat?: number;
    calories?: number;
  };
};

type DateParams = {
  params: {
    date: string;
  };
};

type IdParams = {
  params: {
    id: string;
  };
};

const MEAL_VALUES = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

export function registerNutritionRoutes(app: NutritionRouteApp): NutritionRouteApp {
  return app
    // Parse raw food text → AI → structured items
    .post(
      "/nutrition/parse",
      async ({
        body,
      }: ParseBodyContext): Promise<ApiResponse<NutritionItem[]>> => {
        try {
          const items = await parseNutritionText(body.raw_text);
          return ok(items);
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
      {
        body: t.Object({
          raw_text: t.String(),
        }),
      },
    )
    // Confirm & save parsed items for a date
    .post(
      "/nutrition/confirm",
      async ({
        body,
      }: ConfirmBodyContext): Promise<ApiResponse<NutritionRow[]>> => {
        try {
          const saved = await insertNutritionItems(body.date, body.items);
          return ok(saved);
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
      {
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
      },
    )
    // Get all items for a specific date
    .get(
      "/nutrition/date/:date",
      async ({
        params,
      }: DateParams): Promise<ApiResponse<NutritionRow[]>> => {
        try {
          const items = await getNutritionByDate(params.date);
          return ok(items);
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
    )
    // Get all dates that have nutrition logs
    .get(
      "/nutrition/dates",
      async (): Promise<ApiResponse<string[]>> => {
        try {
          const dates = await getNutritionDates();
          return ok(dates);
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
    )
    // Update a single item
    .put(
      "/nutrition/:id",
      async ({
        params,
        body,
      }: UpdateBodyContext): Promise<ApiResponse<NutritionRow>> => {
        try {
          const updated = await updateNutritionItem(Number(params.id), body);
          if (!updated) {
            return fail("Item not found");
          }
          return ok(updated);
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
      {
        body: t.Object({
          food_name: t.Optional(t.String()),
          meal: t.Optional(t.Union(MEAL_VALUES.map((v) => t.Literal(v)))),
          protein: t.Optional(t.Number()),
          carbs: t.Optional(t.Number()),
          fat: t.Optional(t.Number()),
          calories: t.Optional(t.Number()),
        }),
      },
    )
    // Delete a single item
    .delete(
      "/nutrition/:id",
      async ({
        params,
      }: IdParams): Promise<ApiResponse<{ deleted: boolean }>> => {
        try {
          await deleteNutritionItem(Number(params.id));
          return ok({ deleted: true });
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
    )
    // Delete all items for a date (re-log)
    .delete(
      "/nutrition/date/:date",
      async ({
        params,
      }: DateParams): Promise<ApiResponse<{ deleted: boolean }>> => {
        try {
          await deleteNutritionByDate(params.date);
          return ok({ deleted: true });
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
    );
}

