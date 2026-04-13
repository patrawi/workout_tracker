import { test, expect, describe, mock } from "bun:test";
import { routeHandler, routeHandlerCtx } from "../../../src/lib/route-handler";

describe("routeHandler", () => {
  test("wraps successful handler with ok()", async () => {
    const handler = mock(async () => ({ id: 1, name: "test" }));
    const wrapped = routeHandler(handler);

    const result = await wrapped();

    expect(result).toEqual({
      success: true,
      data: { id: 1, name: "test" },
    });
  });

  test("catches errors and returns fail()", async () => {
    const handler = mock(async () => {
      throw new Error("Database connection failed");
    });
    const wrapped = routeHandler(handler);

    const result = await wrapped();

    expect(result).toEqual({
      success: false,
      error: "Database connection failed",
    });
  });

  test("handles non-Error thrown values", async () => {
    const handler = mock(async () => {
      throw "string error";
    });
    const wrapped = routeHandler(handler);

    const result = await wrapped();

    expect(result).toEqual({
      success: false,
      error: "string error",
    });
  });
});

describe("routeHandlerCtx", () => {
  test("passes context to handler", async () => {
    const handler = mock(async (ctx) => ({ path: ctx.path }));
    const wrapped = routeHandlerCtx(handler);
    const mockCtx = { path: "/api/workouts" };

    const result = await wrapped(mockCtx);

    expect(result).toEqual({
      success: true,
      data: { path: "/api/workouts" },
    });
    expect(handler).toHaveBeenCalledWith(mockCtx);
  });

  test("catches errors with context logging", async () => {
    const handler = mock(async () => {
      throw new Error("Handler failed");
    });
    const wrapped = routeHandlerCtx(handler);
    const mockCtx = { path: "/api/workouts/1" };

    const result = await wrapped(mockCtx);

    expect(result).toEqual({
      success: false,
      error: "Handler failed",
    });
  });
});
