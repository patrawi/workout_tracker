import { test, expect, describe } from "bun:test";
import {
  ErrorCode,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ConflictError,
  ExternalServiceError,
  getErrorMessage,
  getErrorStatusCode,
} from "../../../src/lib/errors";

describe("Error classes", () => {
  test("ValidationError has correct code and status", () => {
    const error = new ValidationError("Invalid input");
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Invalid input");
    expect(error.name).toBe("ValidationError");
  });

  test("NotFoundError has correct code and status", () => {
    const error = new NotFoundError("Workout");
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Workout not found");
    expect(error.name).toBe("NotFoundError");
  });

  test("UnauthorizedError has correct code and status", () => {
    const error = new UnauthorizedError("Please log in");
    expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Please log in");
  });

  test("UnauthorizedError uses default message", () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe("Unauthorized");
  });

  test("ConflictError has correct code and status", () => {
    const error = new ConflictError("Duplicate entry");
    expect(error.code).toBe(ErrorCode.CONFLICT);
    expect(error.statusCode).toBe(409);
  });

  test("ExternalServiceError has correct code and status", () => {
    const error = new ExternalServiceError("Gemini", "API key invalid");
    expect(error.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
    expect(error.statusCode).toBe(502);
    expect(error.message).toBe("Gemini error: API key invalid");
  });
});

describe("getErrorMessage", () => {
  test("extracts message from Error instances", () => {
    expect(getErrorMessage(new Error("test error"))).toBe("test error");
    expect(getErrorMessage(new ValidationError("validation failed"))).toBe("validation failed");
  });

  test("returns string as-is", () => {
    expect(getErrorMessage("something went wrong")).toBe("something went wrong");
  });

  test("returns fallback for unknown types", () => {
    expect(getErrorMessage(null)).toBe("Unknown error");
    expect(getErrorMessage(undefined)).toBe("Unknown error");
    expect(getErrorMessage(123)).toBe("Unknown error");
    expect(getErrorMessage({})).toBe("Unknown error");
  });
});

describe("getErrorStatusCode", () => {
  test("returns status from AppError", () => {
    expect(getErrorStatusCode(new ValidationError("bad"))).toBe(400);
    expect(getErrorStatusCode(new NotFoundError("x"))).toBe(404);
  });

  test("returns 500 for regular Error", () => {
    expect(getErrorStatusCode(new Error("oops"))).toBe(500);
  });

  test("returns 500 for non-Error values", () => {
    expect(getErrorStatusCode("error")).toBe(500);
    expect(getErrorStatusCode(null)).toBe(500);
  });
});
