import {
  getDistinctExercises,
  getWorkoutsByExercise,
  getRecentNotes,
  getWorkoutHeatmap,
  getVolumeAnalytics,
} from "../db";
import type { HeatmapDay, VolumeData } from "../db";
import type { ApiResponse, WorkoutRow } from "../types";
import { ok, fail, getErrorMessage } from "../lib/api";
import { isNonEmptyString, parseDaysBack } from "../lib/validation";

type AnalyticsApp = {
  get: (...args: any[]) => AnalyticsApp;
};

type QueryContext = {
  query: Record<string, string | undefined>;
};

export function registerAnalyticsRoutes(app: AnalyticsApp): AnalyticsApp {
  return app
    .get("/exercises", async (): Promise<ApiResponse<string[]>> => {
      try {
        return ok(await getDistinctExercises());
      } catch (error) {
        return fail(getErrorMessage(error));
      }
    })
    .get(
      "/analytics",
      async ({ query }: QueryContext): Promise<ApiResponse<WorkoutRow[]>> => {
        try {
          const exercise = query.exercise;

          if (!isNonEmptyString(exercise)) {
            return fail("exercise query parameter is required.");
          }

          const days = parseDaysBack(query.days, 0);
          return ok(await getWorkoutsByExercise(exercise, days));
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
    )
    .get(
      "/analytics/volume",
      async ({ query }: QueryContext): Promise<ApiResponse<VolumeData[]>> => {
        try {
          const days = parseDaysBack(query.days, 7);
          return ok(await getVolumeAnalytics(days));
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
    )
    .get(
      "/notes",
      async ({ query }: QueryContext): Promise<ApiResponse<WorkoutRow[]>> => {
        try {
          const exercise = query.exercise;

          if (!isNonEmptyString(exercise)) {
            return fail("exercise query parameter is required.");
          }

          return ok(await getRecentNotes(exercise, 5));
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
    )
    .get("/heatmap", async (): Promise<ApiResponse<HeatmapDay[]>> => {
      try {
        return ok(await getWorkoutHeatmap());
      } catch (error) {
        return fail(getErrorMessage(error));
      }
    });
}
