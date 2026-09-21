// src/routes/profile.routes.ts

import { t } from "elysia";
import { routeHandler, routeHandlerCtx } from "../lib/route-handler";
import type { AppContext } from "../context";

export function registerProfileRoutes(app: any, ctx: AppContext): void {
  const { profileService } = ctx;

  app
    .get("/profile", routeHandler(async ({ user_id }: any) => {
      return await profileService.get(user_id);
    }))
    .put("/profile", routeHandlerCtx(async ({ body, user_id }: any) => {
      const { bodyweight_date, ...profileData } = body;
      return await profileService.update(profileData, bodyweight_date, user_id);
    }), {
      body: t.Object({
        weight_kg: t.Number(),
        height_cm: t.Number(),
        tdee: t.Number(),
        calories_intake: t.Number(),
        protein_target: t.Number(),
        carbs_target: t.Number(),
        fat_target: t.Number(),
        water_target_glasses: t.Number(),
        bodyweight_date: t.Optional(t.String()),
      }),
    });
}
