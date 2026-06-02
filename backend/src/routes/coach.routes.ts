// src/routes/coach.routes.ts

import { t } from "elysia";
import { routeHandler, routeHandlerCtx } from "../lib/route-handler";
import type { AppContext } from "../context";

const planExerciseSchema = t.Object({
  position: t.Number(),
  exercise_name: t.String(),
  is_bodyweight: t.Boolean(),
  target_weight: t.Union([t.Number(), t.Null()]),
  sets: t.Number(),
  rep_low: t.Number(),
  rep_high: t.Number(),
  rpe_low: t.Number(),
  rpe_high: t.Number(),
  notes: t.String(),
});

export function registerCoachRoutes(app: any, ctx: AppContext): void {
  const { coachService } = ctx;

  app
    .post(
      "/coach/chat",
      routeHandlerCtx(async ({ body }) => {
        return await coachService.chat(body.messages);
      }),
      {
        body: t.Object({
          messages: t.Array(
            t.Object({
              role: t.Union([t.Literal("user"), t.Literal("coach")]),
              text: t.String(),
            })
          ),
        }),
      }
    )
    .get(
      "/coach/plan",
      routeHandler(async () => {
        return await coachService.getPlan();
      })
    )
    .post(
      "/coach/plan/next",
      routeHandlerCtx(async ({ body }) => {
        return await coachService.proposeNextSession(body.day_type);
      }),
      {
        body: t.Object({ day_type: t.String() }),
      }
    )
    .put(
      "/coach/plan",
      routeHandlerCtx(async ({ body }) => {
        return await coachService.savePlan(body.day_type, body.exercises);
      }),
      {
        body: t.Object({
          day_type: t.String(),
          exercises: t.Array(planExerciseSchema),
        }),
      }
    );
}
