// src/routes/gyms.routes.ts

import { t } from "elysia";
import { routeHandlerCtx } from "../lib/route-handler";
import type { AppContext } from "../context";

export function registerGymsRoutes(app: any, ctx: AppContext): void {
  const { gymsService } = ctx;

  app
    .get("/gyms", routeHandlerCtx(async ({ user_id }: any) => {
      return await gymsService.list(user_id);
    }))
    .post("/gyms", routeHandlerCtx(async ({ body, user_id }: any) => {
      return await gymsService.create(body.name, user_id);
    }), {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
      }),
    });
}
