// src/lib/route-handler.ts

import { fail, ok } from "./api";
import { logger } from "./logger";
import type { ApiResponse } from "../types";

/**
 * Wraps an async route handler with automatic error handling.
 * Eliminates repetitive try/catch/ok/fail boilerplate.
 *
 * Usage:
 *   .get("/workouts", routeHandler(async () => {
 *     return await workoutService.getRecent(DEFAULT_WORKOUT_LIMIT);
 *   }))
 */
export function routeHandler<T>(
  handler: (...args: any[]) => Promise<T>
): (...args: any[]) => Promise<ApiResponse<T>> {
  return async (...args: any[]): Promise<ApiResponse<T>> => {
    try {
      const result = await handler(...args);
      return ok(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Route handler error", {
        message,
        stack: error instanceof Error ? error.stack : undefined,
        args: args.length > 0 ? { count: args.length } : undefined,
      });
      return fail(message);
    }
  };
}

/**
 * Extended handler that also receives the Elysia context.
 * Use when you need access to params, query, body, etc.
 *
 * Usage:
 *   .get("/workouts/date/:date", routeHandlerCtx(async ({ params }) => {
 *     return await workoutService.getByDate(params.date);
 *   }))
 */
export function routeHandlerCtx<T>(
  handler: (ctx: any) => Promise<T>
): (ctx: any) => Promise<ApiResponse<T>> {
  return async (ctx: any): Promise<ApiResponse<T>> => {
    try {
      const result = await handler(ctx);
      return ok(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Route handler error", {
        message,
        stack: error instanceof Error ? error.stack : undefined,
        path: ctx.path,
      });
      return fail(message);
    }
  };
}
