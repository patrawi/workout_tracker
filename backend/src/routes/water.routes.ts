// src/routes/water.routes.ts

import { t } from "elysia";
import { routeHandlerCtx } from "../lib/route-handler";
import { ValidationError } from "../lib/errors";
import type { AppContext } from "../context";

export function registerWaterRoutes(app: any, ctx: AppContext): void {
  const { waterService } = ctx;

  app
    .get("/water", routeHandlerCtx(async ({ query, user_id }: any) => {
      if (!query.date) throw new ValidationError("date is required");
      return await waterService.getByDate(query.date, user_id);
    }))
    .post("/water", routeHandlerCtx(async ({ body, user_id }: any) => {
      return await waterService.set(body.date, body.glasses, user_id);
    }), {
      body: t.Object({
        date: t.String(),
        glasses: t.Number(),
      }),
    });
}
