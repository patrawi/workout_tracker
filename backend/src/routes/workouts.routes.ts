// src/routes/workouts.routes.ts

import { t } from "elysia";
import { routeHandler, routeHandlerCtx } from "../lib/route-handler";
import { ValidationError } from "../lib/errors";
import { isValidDateString, parseNumericId, isNonEmptyString } from "../lib/validation";
import { DEFAULT_WORKOUT_LIMIT } from "../constants";
import type { AppContext } from "../context";

export function registerWorkoutRoutes(app: any, ctx: AppContext): void {
  const { workoutService } = ctx;

  app
    .get("/workouts", routeHandler(async () => {
      return await workoutService.getRecent(DEFAULT_WORKOUT_LIMIT);
    }))
    .post("/workouts", routeHandlerCtx(async ({ body }) => {
      const { exercise_name, created_at, session_id, ...rest } = body;
      return await workoutService.create(rest, created_at, session_id);
    }), {
      body: t.Object({
        exercise_name: t.String(),
        weight: t.Optional(t.Number()),
        reps: t.Optional(t.Number()),
        rpe: t.Optional(t.Number()),
        is_bodyweight: t.Optional(t.Boolean()),
        is_assisted: t.Optional(t.Boolean()),
        variant_details: t.Optional(t.String()),
        notes_thai: t.Optional(t.String()),
        notes_english: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
        muscle_group: t.Optional(t.String()),
        created_at: t.Optional(t.String()),
        session_id: t.Optional(t.Number()),
      }),
    })
    .get("/workouts/dates", routeHandler(async () => {
      return await workoutService.getDates();
    }))
    .get("/workouts/date/:date", routeHandlerCtx(async ({ params }) => {
      if (!isValidDateString(params.date)) {
        throw new ValidationError("Invalid date format. Use YYYY-MM-DD.");
      }
      return await workoutService.getByDate(params.date);
    }))
    .post("/parse", routeHandlerCtx(async ({ body }) => {
      if (!isNonEmptyString(body.raw_text)) {
        throw new ValidationError("raw_text cannot be empty.");
      }
      return await workoutService.parseWorkoutText(body.raw_text);
    }), {
      body: t.Object({ raw_text: t.String() }),
    })
    .post("/confirm", routeHandlerCtx(async ({ body }) => {
      return await workoutService.confirmSession(
        body.raw_text,
        body.items,
        body.created_at,
        body.activity
      );
    }), {
      body: t.Object({
        raw_text: t.String(),
        created_at: t.String(),
        items: t.Array(t.Object({
          exercise_name: t.String(),
          weight: t.Number(),
          reps: t.Number(),
          rpe: t.Number(),
          is_bodyweight: t.Boolean(),
          is_assisted: t.Boolean(),
          variant_details: t.String(),
          notes_thai: t.String(),
          notes_english: t.String(),
          tags: t.Array(t.String()),
          muscle_group: t.String(),
        })),
        activity: t.Optional(t.Object({
          walked_10k: t.Boolean(),
          did_liss: t.Boolean(),
          did_stretch: t.Boolean(),
          notes: t.String(),
        })),
      }),
    })
    .patch("/workouts/:id", routeHandlerCtx(async ({ params, body }) => {
      const id = parseNumericId(params.id);
      if (id === null) {
        throw new ValidationError("Invalid workout id.");
      }
      const updated = await workoutService.update(id, body);
      if (!updated) {
        throw new ValidationError("Workout not found or no fields to update.");
      }
      return updated;
    }), {
      body: t.Object({
        exercise_name: t.Optional(t.String()),
        weight: t.Optional(t.Number()),
        reps: t.Optional(t.Number()),
        rpe: t.Optional(t.Number()),
        is_bodyweight: t.Optional(t.Boolean()),
        is_assisted: t.Optional(t.Boolean()),
        variant_details: t.Optional(t.String()),
        notes_thai: t.Optional(t.String()),
        notes_english: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
      }),
    })
    .delete("/workouts/:id", routeHandlerCtx(async ({ params }) => {
      const id = parseNumericId(params.id);
      if (id === null) {
        throw new ValidationError("Invalid workout id.");
      }
      const deleted = await workoutService.delete(id);
      if (!deleted) {
        throw new ValidationError("Workout not found.");
      }
      return { deleted: true };
    }));
}
