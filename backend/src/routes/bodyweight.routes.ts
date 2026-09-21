// src/routes/bodyweight.routes.ts

import { t } from "elysia";
import { routeHandlerCtx } from "../lib/route-handler";
import { parseDaysBack } from "../lib/validation";
import { BODYWEIGHT_DEFAULT_DAYS_BACK } from "../constants";
import type { AppContext } from "../context";

export function registerBodyweightRoutes(app: any, ctx: AppContext): void {
  const { bodyweightService } = ctx;

  app
    .get("/bodyweight", routeHandlerCtx(async ({ query, user_id }: any) => {
      const days = parseDaysBack(query.days, BODYWEIGHT_DEFAULT_DAYS_BACK);
      return await bodyweightService.getLogs(days, user_id);
    }))
    .post("/bodyweight", routeHandlerCtx(async ({ body, user_id }: any) => {
      await bodyweightService.log(body.date, body.weight_kg, user_id);
      return { success: true };
    }), {
      body: t.Object({
        date: t.String(),
        weight_kg: t.Number(),
      }),
    });
}
