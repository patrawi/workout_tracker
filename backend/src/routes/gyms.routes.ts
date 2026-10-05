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
    })
    // Gym Profile equipment tick list (ADR 0027). null clears the profile —
    // the gym becomes unrestricted (additive override).
    .put("/gyms/:id/profile", routeHandlerCtx(async ({ body, params, user_id }: any) => {
      return await gymsService.setEquipmentProfile(
        Number(params.id),
        user_id,
        body.equipment ?? null,
      );
    }), {
      body: t.Object({
        equipment: t.Union([t.Array(t.String({ maxLength: 60 })), t.Null()]),
      }),
    });
}
