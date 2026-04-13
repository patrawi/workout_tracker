export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  CONFLICT = "CONFLICT",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, details?: Record<string, unknown>) {
    super(ErrorCode.NOT_FOUND, `${resource} not found`, 404, details);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(ErrorCode.UNAUTHORIZED, message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.CONFLICT, message, 409, details);
    this.name = "ConflictError";
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      `${service} error: ${message}`,
      502
    );
    this.name = "ExternalServiceError";
  }
}

/**
 * Type-safe error message extraction - no type assertions needed.
 * Replaces the old getErrorMessage that used `as ApiError`.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/**
 * Get the appropriate HTTP status code for an error.
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof AppError) return error.statusCode;
  if (error instanceof Error) return 500;
  return 500;
}
