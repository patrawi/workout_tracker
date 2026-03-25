import { t } from "elysia";
import {
  getRecentWorkouts,
  insertWorkouts,
  insertWorkout,
  getWorkoutsByDate,
  getWorkoutDates,
  updateWorkout,
  deleteWorkout,
} from "../db";
import { parseWorkoutText } from "../ai";
import { ok, fail, getErrorMessage } from "../lib/api";
import {
  isValidDateString,
  parseNumericId,
  isNonEmptyString,
} from "../lib/validation";
import type { WorkoutData, WorkoutRow, ApiResponse } from "../types";

type WorkoutRouteApp = {
  get: (...args: any[]) => WorkoutRouteApp;
  post: (...args: any[]) => WorkoutRouteApp;
  patch: (...args: any[]) => WorkoutRouteApp;
  delete: (...args: any[]) => WorkoutRouteApp;
};

type DateParams = {
  params: {
    date: string;
  };
};

type WorkoutIdParams = {
  params: {
    id: string;
  };
};

type ParseBodyContext = {
  body: {
    raw_text: string;
  };
};

type ConfirmBodyContext = {
  body: {
    raw_text: string;
    created_at: string;
    items: WorkoutData[];
  };
};

type AddWorkoutBodyContext = {
  body: {
    exercise_name: string;
    weight?: number;
    reps?: number;
    rpe?: number;
    is_bodyweight?: boolean;
    is_assisted?: boolean;
    variant_details?: string;
    notes_thai?: string;
    notes_english?: string;
    tags?: string[];
    muscle_group?: string;
    created_at?: string;
    session_id?: number;
  };
};

type PatchWorkoutBodyContext = {
  params: {
    id: string;
  };
  body: {
    exercise_name?: string;
    weight?: number;
    reps?: number;
    rpe?: number;
    is_bodyweight?: boolean;
    is_assisted?: boolean;
    variant_details?: string;
    notes_thai?: string;
    notes_english?: string;
    tags?: string[];
  };
};

export function registerWorkoutRoutes(app: WorkoutRouteApp): WorkoutRouteApp {
  return app
    .get("/workouts", async (): Promise<ApiResponse<WorkoutRow[]>> => {
      try {
        return ok(await getRecentWorkouts(20));
      } catch (error) {
        return fail(getErrorMessage(error));
      }
    })
    .post(
      "/workouts",
      async ({
        body,
      }: AddWorkoutBodyContext): Promise<ApiResponse<WorkoutRow>> => {
        try {
          const { exercise_name, created_at, session_id, ...rest } = body;

          console.log("[POST /workouts] Received session_id:", session_id, "type:", typeof session_id);

          if (!isNonEmptyString(exercise_name)) {
            return fail("exercise_name cannot be empty.");
          }

          const createdAt =
            created_at && isValidDateString(created_at)
              ? created_at
              : new Date().toISOString();

          return ok(
            await insertWorkout(
              {
                exercise_name,
                weight: rest.weight ?? 0,
                reps: rest.reps ?? 0,
                rpe: rest.rpe ?? 0,
                is_bodyweight: rest.is_bodyweight ?? false,
                is_assisted: rest.is_assisted ?? false,
                variant_details: rest.variant_details ?? "",
                notes_thai: rest.notes_thai ?? "",
                notes_english: rest.notes_english ?? "",
                tags: rest.tags ?? [],
                muscle_group: rest.muscle_group ?? "Other",
              },
              createdAt,
              session_id,
            ),
          );
        } catch (error) {
          console.error("[POST /workouts] Error:", getErrorMessage(error));
          return fail(getErrorMessage(error));
        }
      },
      {
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
      },
    )
    .get("/workouts/dates", async (): Promise<ApiResponse<string[]>> => {
      try {
        return ok(await getWorkoutDates());
      } catch (error) {
        return fail(getErrorMessage(error));
      }
    })
    .get(
      "/workouts/date/:date",
      async ({ params }: DateParams): Promise<ApiResponse<WorkoutRow[]>> => {
        try {
          const { date } = params;

          if (!isValidDateString(date)) {
            return fail("Invalid date format. Use YYYY-MM-DD.");
          }

          return ok(await getWorkoutsByDate(date));
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
    )
    .post(
      "/parse",
      async ({
        body,
      }: ParseBodyContext): Promise<ApiResponse<WorkoutData[]>> => {
        try {
          const { raw_text } = body;

          if (!isNonEmptyString(raw_text)) {
            return fail("raw_text cannot be empty.");
          }

          return ok(await parseWorkoutText(raw_text));
        } catch (error) {
          console.error("[POST /parse] Error:", getErrorMessage(error));
          return fail(getErrorMessage(error));
        }
      },
      {
        body: t.Object({
          raw_text: t.String(),
        }),
      },
    )
    .post(
      "/confirm",
      async ({
        body,
      }: ConfirmBodyContext): Promise<ApiResponse<WorkoutRow[]>> => {
        try {
          const { raw_text, items, created_at } = body;

          if (!items || items.length === 0) {
            return fail("No workout items to save.");
          }

          return ok(await insertWorkouts(raw_text, items, created_at));
        } catch (error) {
          console.error("[POST /confirm] Error:", getErrorMessage(error));
          return fail(getErrorMessage(error));
        }
      },
      {
        body: t.Object({
          raw_text: t.String(),
          created_at: t.String(),
          items: t.Array(
            t.Object({
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
            }),
          ),
        }),
      },
    )
    .patch(
      "/workouts/:id",
      async ({
        params,
        body,
      }: PatchWorkoutBodyContext): Promise<ApiResponse<WorkoutRow>> => {
        try {
          const id = parseNumericId(params.id);

          if (id === null) {
            return fail("Invalid workout id.");
          }

          const updated = await updateWorkout(id, body);

          if (!updated) {
            return fail("Workout not found or no fields to update.");
          }

          return ok(updated);
        } catch (error) {
          console.error("[PATCH /workouts/:id] Error:", getErrorMessage(error));
          return fail(getErrorMessage(error));
        }
      },
      {
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
      },
    )
    .delete(
      "/workouts/:id",
      async ({
        params,
      }: WorkoutIdParams): Promise<ApiResponse<{ deleted: boolean }>> => {
        try {
          const id = parseNumericId(params.id);

          if (id === null) {
            return fail("Invalid workout id.");
          }

          const deleted = await deleteWorkout(id);

          if (!deleted) {
            return fail("Workout not found.");
          }

          return ok({ deleted: true });
        } catch (error) {
          console.error(
            "[DELETE /workouts/:id] Error:",
            getErrorMessage(error),
          );
          return fail(getErrorMessage(error));
        }
      },
    );
}
