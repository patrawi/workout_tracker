// src/routes/water.routes.ts

import { t } from "elysia";
import { routeHandlerCtx } from "../lib/route-handler";
import { ValidationError } from "../lib/errors";
import type { AppContext } from "../context";

export function registerWaterRoutes(app: any, ctx: AppContext): void {
  const { waterService } = ctx;

  app
    .get("/water", routeHandlerCtx(async ({ query }) => {
      if (!query.date) throw new ValidationError("date is required");
      return await waterService.getByDate(query.date);
    }))
    .post("/water", routeHandlerCtx(async ({ body }) => {
      return await waterService.set(body.date, body.glasses);
    }), {
      body: t.Object({
        date: t.String(),
        glasses: t.Number(),
      }),
    });
}
