// src/routes/rest-days.routes.ts

import { t } from "elysia";
import { routeHandler, routeHandlerCtx } from "../lib/route-handler";
import { ValidationError } from "../lib/errors";
import type { AppContext } from "../context";

export function registerRestDayRoutes(app: any, ctx: AppContext): void {
  const { restDayService } = ctx;

  app
    .post("/rest-days", routeHandlerCtx(async ({ body }) => {
      return await restDayService.upsert(body);
    }), {
      body: t.Object({
        date: t.String(),
        walked_10k: t.Optional(t.Boolean()),
        did_liss: t.Optional(t.Boolean()),
        did_stretch: t.Optional(t.Boolean()),
        notes: t.Optional(t.String()),
      }),
    })
    .delete("/rest-days/:date", routeHandlerCtx(async ({ params }) => {
      const deleted = await restDayService.delete(params.date);
      if (!deleted) {
        throw new ValidationError("Rest day not found.");
      }
      return { deleted: true };
    }));
}
