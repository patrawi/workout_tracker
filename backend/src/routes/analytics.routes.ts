// src/routes/analytics.routes.ts

import { routeHandler, routeHandlerCtx } from "../lib/route-handler";
import { ValidationError } from "../lib/errors";
import { isNonEmptyString, parseDaysBack } from "../lib/validation";
import { ANALYTICS_DEFAULT_DAYS_BACK, ANALYTICS_DEFAULT_DAYS_BACK_FOR_EXERCISE } from "../constants";
import type { AppContext } from "../context";

export function registerAnalyticsRoutes(app: any, ctx: AppContext): void {
  const { analyticsService } = ctx;

  app
    .get("/exercises", routeHandler(async ({ user_id }: any) => {
      return await analyticsService.getExercises(user_id);
    }))
    .get("/analytics", routeHandlerCtx(async ({ query, user_id }: any) => {
      const exercise = query.exercise;
      if (!isNonEmptyString(exercise)) {
        throw new ValidationError("exercise query parameter is required.");
      }
      const days = parseDaysBack(query.days, ANALYTICS_DEFAULT_DAYS_BACK_FOR_EXERCISE);
      return await analyticsService.getAnalytics(exercise, days, user_id);
    }))
    .get("/analytics/volume", routeHandlerCtx(async ({ query, user_id }: any) => {
      const days = parseDaysBack(query.days, ANALYTICS_DEFAULT_DAYS_BACK);
      return await analyticsService.getVolume(days, user_id);
    }))
    .get("/notes", routeHandlerCtx(async ({ query, user_id }: any) => {
      const exercise = query.exercise;
      if (!isNonEmptyString(exercise)) {
        throw new ValidationError("exercise query parameter is required.");
      }
      return await analyticsService.getNotes(exercise, user_id);
    }))
    .get("/heatmap", routeHandler(async ({ user_id }: any) => {
      return await analyticsService.getHeatmap(user_id);
    }));
}
