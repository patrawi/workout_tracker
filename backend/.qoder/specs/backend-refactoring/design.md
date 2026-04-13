# Backend Refactoring - Design Document

## Overview

This document describes a comprehensive refactoring of the workout tracker backend built with Elysia, Drizzle ORM, and PostgreSQL. The refactoring addresses six critical problem areas: magic values, code duplication, cross-domain coupling, testing unfriendliness, error handling weaknesses, and zero test coverage.

The goal is to improve code maintainability, testability, and architectural clarity while preserving all existing functionality and API contracts.

## Confidence Assessment

**Confidence Level:** High

**Confidence Basis:**
- Complete codebase analysis performed across all 20+ source files
- Clear problem identification with specific file/line references
- Proven architectural patterns (layered architecture, factory DI, handler wrappers)
- Incremental migration strategy minimizes risk
- All changes are backward-compatible at the API level

**Risk Factors:**
- Cross-service refactoring (profile + bodyweight) requires careful ordering
- Handler wrapper must preserve Elysia's type inference

---

## Technical Architecture

### Current Architecture (Problems)

```
┌─────────────────────────────────────────────────────┐
│                    index.ts                          │
│  (reads process.env directly, imports from many)     │
├─────────────────────────────────────────────────────┤
│                    app.ts                            │
│  (registers routes, auth middleware, static files)   │
├──────────────┬──────────────┬───────────────────────┤
│   Routes     │   Routes     │   Routes              │
│  (import     │  (import     │  (import              │
│   from db,   │   from db,   │   from db,            │
│   ai,        │   validate,  │   call repos          │
│   validate)  │   return     │   directly)           │
│              │   ok/fail)   │                       │
├──────────────┼──────────────┼───────────────────────┤
│  Repositories (import db client directly)           │
│  (duplicate ?? defaults, no DI)                     │
├─────────────────────────────────────────────────────┤
│  Services (mixed concerns, profile calls bodyweight)│
├─────────────────────────────────────────────────────┤
│  db/client.ts (singleton, reads process.env)        │
│  config.ts (reads process.env directly)             │
│  ai.ts (instantiates GoogleGenAI directly)          │
└─────────────────────────────────────────────────────┘
```

**Problems:** Routes import from multiple layers, no service boundary, no DI, magic values everywhere, duplicated try/catch/ok/fail pattern.

### Proposed Architecture

```
┌──────────────────────────────────────────────────────┐
│                     index.ts                          │
│  - Creates AppContext via createAppContext()          │
│  - Passes context to createApp(ctx)                   │
│  - Reads config via ConfigService (injectable)        │
├──────────────────────────────────────────────────────┤
│                     app.ts                            │
│  - Receives AppContext (db, services, config)         │
│  - Registers routes with context                      │
│  - Sets up auth middleware using AuthService          │
├──────────────────────────────────────────────────────┤
│                  Route Handlers                       │
│  - Use routeHandler() wrapper (eliminates try/catch)  │
│  - Call Services only (never repos directly)          │
│  - Use constants from constants.ts                    │
├──────────────────────────────────────────────────────┤
│                  Service Layer                        │
│  - One service per domain boundary                   │
│  - Services receive dependencies via factory params   │
│  - Cross-domain: explicit service-to-service calls    │
│  - Services call repositories                         │
├──────────────────────────────────────────────────────┤
│                Repository Layer                       │
│  - Receive db client via factory params               │
│  - Use withDefaults() for consistent defaults         │
│  - Return domain types (mapped rows)                  │
├──────────────────────────────────────────────────────┤
│              Infrastructure Layer                     │
│  - db/client.ts (factory, not singleton)              │
│  - config.ts (ConfigService, injectable)              │
│  - ai/ (AI providers via factory, mockable)           │
│  - logger.ts (structured logging)                     │
│  - constants.ts (all magic values)                    │
└──────────────────────────────────────────────────────┘
```

### Dependency Flow (strict unidirectional)

```
index.ts → app.ts → routes → services → repositories → db client
              ↑          ↑           ↑
          config     constants    logger
          auth       AI provider  (structured)
```

**Key Rule:** Each layer only imports from layers below it. Routes never import repositories. Repositories never import services.

---

## Component Design

### 1. Constants Extraction

#### File: `src/constants.ts`

All magic values centralized in one file with clear naming conventions.

```typescript
// src/constants.ts

// Pagination & Limits
export const DEFAULT_WORKOUT_LIMIT = 20;
export const DEFAULT_RECENT_NOTES_LIMIT = 5;

// Time Windows (in days)
export const ANALYTICS_DEFAULT_DAYS_BACK = 7;
export const ANALYTICS_DEFAULT_DAYS_BACK_FOR_EXERCISE = 0;
export const BODYWEIGHT_DEFAULT_DAYS_BACK = 0;
export const HEATMAP_LOOKBACK_DAYS = 365;

// Auth
export const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 86400; // 7 days
export const AUTH_JWT_EXPIRY = "7d";

// AI Models
export const GEMINI_MODEL_WORKOUT = "gemini-3-flash-preview";
export const GEMINI_MODEL_NUTRITION = "gemini-3-flash-preview";
export const GEMINI_TEMPERATURE = 0.1;

// Database
export const PROFILE_DEFAULT_ID = 1;

// API Defaults (for ?? fallbacks)
export const DEFAULT_EXERCISE_NAME = "Unknown Exercise";
export const DEFAULT_MUSCLE_GROUP = "Other";
export const DEFAULT_EMPTY_STRING = "";
export const DEFAULT_NUMBER = 0;
export const DEFAULT_BOOLEAN_FALSE = false;
export const DEFAULT_TAGS: string[] = [];

// Static Assets
export const STATIC_ASSETS_PREFIX = "/assets";
export const STATIC_FILES_PATTERN = /\.(js|css|ico|png|jpg|svg|woff|woff2|ttf|eot)$/;
```

**Naming Convention:** `{DOMAIN}_{PURPOSE} = value` for scoped constants, `DEFAULT_{TYPE}` for universal defaults.

#### Default Value Utility: `src/lib/defaults.ts`

Eliminates duplication of `?? 0`, `?? ""`, `?? []` across repos, mappers, and AI.

```typescript
// src/lib/defaults.ts
import {
  DEFAULT_NUMBER,
  DEFAULT_EMPTY_STRING,
  DEFAULT_BOOLEAN_FALSE,
  DEFAULT_TAGS,
  DEFAULT_EXERCISE_NAME,
  DEFAULT_MUSCLE_GROUP,
} from "../constants";

/**
 * Apply defaults to a workout data object.
 * Used by: repositories (insert), mappers (map), AI (normalize).
 */
export function withWorkoutDefaults<T extends Record<string, unknown>>(
  item: T
): T & {
  weight: number;
  reps: number;
  rpe: number;
  is_bodyweight: boolean;
  is_assisted: boolean;
  variant_details: string;
  notes_thai: string;
  notes_english: string;
  tags: string[];
  muscle_group: string;
  exercise_name: string;
} {
  return {
    ...item,
    exercise_name: (item.exercise_name as string) || DEFAULT_EXERCISE_NAME,
    weight: (item.weight as number) ?? DEFAULT_NUMBER,
    reps: (item.reps as number) ?? DEFAULT_NUMBER,
    rpe: (item.rpe as number) ?? DEFAULT_NUMBER,
    is_bodyweight: (item.is_bodyweight as boolean) ?? DEFAULT_BOOLEAN_FALSE,
    is_assisted: (item.is_assisted as boolean) ?? DEFAULT_BOOLEAN_FALSE,
    variant_details: (item.variant_details as string) ?? DEFAULT_EMPTY_STRING,
    notes_thai: (item.notes_thai as string) ?? DEFAULT_EMPTY_STRING,
    notes_english: (item.notes_english as string) ?? DEFAULT_EMPTY_STRING,
    tags: (item.tags as string[]) ?? DEFAULT_TAGS,
    muscle_group: (item.muscle_group as string) ?? DEFAULT_MUSCLE_GROUP,
  } as any;
}

/** Generic default helpers for other entities */
export function defaultNumber(value: unknown): number {
  return (value as number) ?? DEFAULT_NUMBER;
}

export function defaultString(value: unknown): string {
  return (value as string) ?? DEFAULT_EMPTY_STRING;
}

export function defaultBoolean(value: unknown): boolean {
  return (value as boolean) ?? DEFAULT_BOOLEAN_FALSE;
}

export function defaultArray<T>(value: unknown): T[] {
  return (value as T[]) ?? [];
}
```

**Usage Examples:**

Before (in `workout.repository.ts`):
```typescript
values({
  exercise_name: item.exercise_name,
  weight: item.weight ?? 0,
  reps: item.reps ?? 0,
  rpe: item.rpe ?? 0,
  is_bodyweight: item.is_bodyweight ?? false,
  is_assisted: item.is_assisted ?? false,
  variant_details: item.variant_details ?? "",
  notes_thai: item.notes_thai ?? "",
  notes_english: item.notes_english ?? "",
  tags: item.tags ?? [],
  muscle_group: item.muscle_group ?? "Other",
})
```

After:
```typescript
values(withWorkoutDefaults(item))
```

Before (in `ai.ts` normalizeItem):
```typescript
function normalizeItem(item: Record<string, unknown>): WorkoutData {
    return {
        exercise_name: String(item.exercise_name || "Unknown Exercise"),
        weight: Number(item.weight) || 0,
        reps: Number(item.reps) || 0,
        ...
    };
}
```

After:
```typescript
function normalizeItem(item: Record<string, unknown>): WorkoutData {
    return withWorkoutDefaults({
        exercise_name: item.exercise_name ? String(item.exercise_name) : undefined,
        weight: Number(item.weight) || undefined,
        reps: Number(item.reps) || undefined,
        ...
    });
}
```

### 2. Route Handler Abstraction

#### File: `src/lib/route-handler.ts`

Eliminates the repetitive `try { return ok(await ...) } catch (error) { return fail(getErrorMessage(error)) }` pattern.

```typescript
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
```

**Before/After Comparison:**

Before (`workouts.routes.ts`):
```typescript
.get("/workouts", async (): Promise<ApiResponse<WorkoutRow[]>> => {
  try {
    return ok(await getRecentWorkouts(20));
  } catch (error) {
    return fail(getErrorMessage(error));
  }
})
```

After:
```typescript
.get("/workouts", routeHandler(async () => {
  return await workoutService.getRecent(DEFAULT_WORKOUT_LIMIT);
}))
```

**Before:**
```typescript
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
```

**After:**
```typescript
.get(
  "/workouts/date/:date",
  routeHandlerCtx(async ({ params }) => {
    const { date } = params;
    if (!isValidDateString(date)) {
      throw new ValidationError("Invalid date format. Use YYYY-MM-DD.");
    }
    return await workoutService.getByDate(date);
  }),
)
```

**Note on Validation Errors:** Validation failures that should return a 4xx response throw a `ValidationError` (new custom error type). The route handler catches all errors uniformly. For more granular control, a future enhancement could add error-type-aware response mapping.

### 3. Error Handling & Logging

#### File: `src/lib/errors.ts`

Type-safe error hierarchy replacing `getErrorMessage` with `as ApiError` assertion.

```typescript
// src/lib/errors.ts

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
```

#### File: `src/lib/logger.ts`

Structured logging replacing scattered `console.log`/`console.error` calls.

```typescript
// src/lib/logger.ts

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function createLogger(context: string = "app") {
  const logLevel = (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;
  const levelOrder = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
  const minLevel = levelOrder[logLevel] ?? 1;

  function emit(level: LogLevel, message: string, contextData?: Record<string, unknown>) {
    if (levelOrder[level] < minLevel) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...contextData, source: context },
    };

    const output = formatLogEntry(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  return {
    debug: (message: string, ctx?: Record<string, unknown>) => emit(LogLevel.DEBUG, message, ctx),
    info: (message: string, ctx?: Record<string, unknown>) => emit(LogLevel.INFO, message, ctx),
    warn: (message: string, ctx?: Record<string, unknown>) => emit(LogLevel.WARN, message, ctx),
    error: (message: string, ctx?: Record<string, unknown>) => emit(LogLevel.ERROR, message, ctx),
  };
}

export const logger = createLogger("app");
export function createChildLogger(context: string) {
  return createLogger(context);
}
```

**Usage - replacing console.log:**

Before:
```typescript
console.log("[POST /workouts] Received session_id:", session_id, "type:", typeof session_id);
console.error("[POST /workouts] Error:", getErrorMessage(error));
```

After:
```typescript
logger.debug("Received workout request", { sessionId, sessionIdType: typeof session_id });
logger.error("Failed to create workout", { error: getErrorMessage(error) });
```

### 4. Dependency Injection (Factory Pattern)

#### File: `src/context.ts`

Lightweight dependency injection using factory functions. No heavy DI frameworks.

```typescript
// src/context.ts
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ConfigService } from "./services/config.service";
import type { WorkoutService } from "./services/workout.service";
import type { AnalyticsService } from "./services/analytics.service";
import type { BodyweightService } from "./services/bodyweight.service";
import type { RestDayService } from "./services/rest-day.service";
import type { ProfileService } from "./services/profile.service";
import type { NutritionService } from "./services/nutrition.service";
import type { HistoryService } from "./services/history.service";
import type { AuthService } from "./services/auth.service";
import type { AIService } from "./services/ai.service";

/**
 * AppContext holds all application dependencies.
 * Created once at startup, passed through to route registration.
 */
export interface AppContext {
  db: PostgresJsDatabase;
  config: ConfigService;
  authService: AuthService;
  aiService: AIService;
  workoutService: WorkoutService;
  analyticsService: AnalyticsService;
  bodyweightService: BodyweightService;
  restDayService: RestDayService;
  profileService: ProfileService;
  nutritionService: NutritionService;
  historyService: HistoryService;
}

/**
 * Factory function that creates the full dependency graph.
 * Dependencies are created in order of their dependencies.
 */
export function createAppContext(db: PostgresJsDatabase, config: ConfigService): AppContext {
  // Repositories get db
  const workoutRepo = createWorkoutRepository(db);
  const analyticsRepo = createAnalyticsRepository(db);
  const bodyweightRepo = createBodyweightRepository(db);
  const restDayRepo = createRestDayRepository(db);
  const profileRepo = createProfileRepository(db);
  const nutritionRepo = createNutritionRepository(db);
  const historyRepo = createHistoryRepository(db);

  // AI service gets config
  const aiService = createAIService(config);

  // Services get their repos + any cross-service deps
  const workoutService = createWorkoutService(workoutRepo, aiService);
  const analyticsService = createAnalyticsService(analyticsRepo);
  const bodyweightService = createBodyweightService(bodyweightRepo);
  const restDayService = createRestDayService(restDayRepo);
  const nutritionService = createNutritionService(nutritionRepo, aiService);
  const historyService = createHistoryService(historyRepo);

  // ProfileService needs both profileRepo AND bodyweightService (cross-domain)
  const profileService = createProfileService(profileRepo, bodyweightService);

  // Auth service gets config
  const authService = createAuthService(config);

  return {
    db,
    config,
    authService,
    aiService,
    workoutService,
    analyticsService,
    bodyweightService,
    restDayService,
    profileService,
    nutritionService,
    historyService,
  };
}
```

**How it works:**
1. `createAppContext(db, config)` builds the entire dependency graph
2. Each factory function (`createWorkoutService`, etc.) takes only its direct dependencies
3. Cross-domain dependencies are explicit (ProfileService receives BodyweightService)
4. For testing, individual factories can be called with mock dependencies

#### Config Service: `src/services/config.service.ts`

Makes config injectable and testable.

```typescript
// src/services/config.service.ts

export interface AppConfig {
  port: number;
  databaseUrl: string;
  masterPassword: string;
  jwtSecret: string;
  geminiApiKey: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  CRON_SECRET: string;
}

export class ConfigService {
  constructor(private readonly config: AppConfig) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): ConfigService {
    return new ConfigService({
      port: getNumberEnv(env, "PORT", 3000),
      databaseUrl: getRequiredEnv(env, "DATABASE_URL"),
      masterPassword: getOptionalEnv(env, "MASTER_PASSWORD"),
      jwtSecret: getOptionalEnv(env, "JWT_SECRET", "frictionless-tracker-secret-change-me"),
      geminiApiKey: getOptionalEnv(env, "GEMINI_API_KEY"),
      VAPID_PUBLIC_KEY: getOptionalEnv(env, "VAPID_PUBLIC_KEY"),
      VAPID_PRIVATE_KEY: getOptionalEnv(env, "VAPID_PRIVATE_KEY"),
      VAPID_SUBJECT: getOptionalEnv(env, "VAPID_SUBJECT", "mailto:admin@localhost"),
      CRON_SECRET: getOptionalEnv(env, "CRON_SECRET"),
    });
  }

  static forTest(overrides: Partial<AppConfig> = {}): ConfigService {
    return new ConfigService({
      port: 3000,
      databaseUrl: "postgresql://test: test@localhost :5432/test_db",
      masterPassword: "test-password",
      jwtSecret: "test-secret",
      geminiApiKey: "test-gemini-key",
      VAPID_PUBLIC_KEY: "test-vapid-public",
      VAPID_PRIVATE_KEY: "test-vapid-private",
      VAPID_SUBJECT: "mailto:test@localhost",
      CRON_SECRET: "test-cron-secret",
      ...overrides,
    });
  }

  get port() { return this.config.port; }
  get databaseUrl() { return this.config.databaseUrl; }
  get masterPassword() { return this.config.masterPassword; }
  get jwtSecret() { return this.config.jwtSecret; }
  get geminiApiKey() { return this.config.geminiApiKey; }
  get VAPID_PUBLIC_KEY() { return this.config.VAPID_PUBLIC_KEY; }
  get VAPID_PRIVATE_KEY() { return this.config.VAPID_PRIVATE_KEY; }
  get VAPID_SUBJECT() { return this.config.VAPID_SUBJECT; }
  get CRON_SECRET() { return this.config.CRON_SECRET; }
  get isAuthEnabled() { return this.config.masterPassword.length > 0; }
}

// Env reading helpers (now accept env object for testability)
function getRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} environment variable is not set.`);
  }
  return value;
}

function getOptionalEnv(env: NodeJS.ProcessEnv, name: string, fallback = ""): string {
  const value = env[name];
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  return value;
}

function getNumberEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = env[name];
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}
```

#### DB Client Factory: `src/db/client.ts` (refactored)

```typescript
// src/db/client.ts (refactored)
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Factory to create a database client.
 * Accepts a connection string or postgres client directly.
 * This makes testing easy - pass a test database URL.
 */
export function createDatabaseClient(databaseUrl: string): PostgresJsDatabase {
  const client = postgres(databaseUrl);
  return drizzle(client);
}

/**
 * Create a database client for testing with transaction rollback.
 */
export async function createTestDatabaseClient(
  databaseUrl: string
): Promise<{ db: PostgresJsDatabase; cleanup: () => Promise<void> }> {
  const client = postgres(databaseUrl);
  const db = drizzle(client);

  // Begin a transaction that will be rolled back
  await client`BEGIN`;

  return {
    db,
    cleanup: async () => {
      await client`ROLLBACK`;
      await client.end();
    },
  };
}
```

#### AI Service: `src/services/ai.service.ts`

AI provider behind an interface, mockable for testing.

```typescript
// src/services/ai.service.ts
import type { WorkoutData, NutritionItem } from "../types";
import type { ConfigService } from "./config.service";
import { createWorkoutAIClient } from "../ai/client";
import { createNutritionAIClient } from "../nutrition-ai/client";
import { ExternalServiceError } from "../lib/errors";
import { createChildLogger } from "../lib/logger";
import { GEMINI_MODEL_WORKOUT, GEMINI_MODEL_NUTRITION } from "../constants";

const logger = createChildLogger("ai-service");

export interface AIService {
  parseWorkoutText(rawText: string): Promise<WorkoutData[]>;
  parseNutritionText(rawText: string): Promise<NutritionItem[]>;
}

export function createAIService(config: ConfigService): AIService {
  const apiKey = config.geminiApiKey;

  if (!apiKey) {
    logger.warn("GEMINI_API_KEY not set, AI features will throw on use");
  }

  const workoutClient = createWorkoutAIClient(apiKey, GEMINI_MODEL_WORKOUT);
  const nutritionClient = createNutritionAIClient(apiKey, GEMINI_MODEL_NUTRITION);

  return {
    async parseWorkoutText(rawText: string): Promise<WorkoutData[]> {
      if (!apiKey) {
        throw new ExternalServiceError("Gemini", "GEMINI_API_KEY is not set");
      }
      try {
        return await workoutClient.parse(rawText);
      } catch (error) {
        logger.error("Failed to parse workout text", { error: String(error) });
        throw new ExternalServiceError("Gemini", String(error));
      }
    },
    async parseNutritionText(rawText: string): Promise<NutritionItem[]> {
      if (!apiKey) {
        throw new ExternalServiceError("Gemini", "GEMINI_API_KEY is not set");
      }
      try {
        return await nutritionClient.parse(rawText);
      } catch (error) {
        logger.error("Failed to parse nutrition text", { error: String(error) });
        throw new ExternalServiceError("Gemini", String(error));
      }
    },
  };
}
```

#### AI Client Refactoring: `src/ai/client.ts` and `src/nutrition-ai/client.ts`

Split the current monolithic `ai.ts` and `nutrition-ai.ts` into:
- `client.ts` - The AI client implementation (mockable interface)
- `prompts.ts` - System prompts (pure constants)
- `normalizers.ts` - Normalization functions (pure functions, use withWorkoutDefaults)

```typescript
// src/ai/client.ts
import { GoogleGenAI } from "@google/genai";
import type { WorkoutData } from "../types";
import { WORKOUT_SYSTEM_PROMPT } from "./prompts";
import { normalizeWorkoutItem } from "./normalizers";
import { GEMINI_TEMPERATURE } from "../constants";

export interface AIClient {
  parse(rawText: string): Promise<WorkoutData[]>;
}

export function createWorkoutAIClient(
  apiKey: string,
  model: string
): AIClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async parse(rawText: string): Promise<WorkoutData[]> {
      const response = await ai.models.generateContent({
        model,
        contents: rawText,
        config: {
          systemInstruction: WORKOUT_SYSTEM_PROMPT,
          temperature: GEMINI_TEMPERATURE,
        },
      });

      const textContent = response.text ?? "";
      const cleaned = textContent
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned);
        const items: Record<string, unknown>[] = Array.isArray(parsed)
          ? parsed
          : [parsed];
        return items.map(normalizeWorkoutItem);
      } catch {
        throw new Error(
          `Failed to parse LLM response as JSON. Raw response: ${cleaned.slice(0, 500)}`
        );
      }
    },
  };
}
```

### 5. Service Layer Refactoring

#### Service Boundaries

Each service owns one domain. Cross-domain operations use explicit service-to-service calls.

| Service | Dependencies | Responsibilities |
|---------|-------------|-----------------|
| `WorkoutService` | WorkoutRepository, AIService | CRUD workouts, AI parsing, confirm sessions |
| `AnalyticsService` | AnalyticsRepository | Heatmap, volume analytics, exercise lists |
| `BodyweightService` | BodyweightRepository | CRUD bodyweight logs |
| `RestDayService` | RestDayRepository | CRUD rest days |
| `ProfileService` | ProfileRepository, BodyweightService | Profile CRUD, auto-log bodyweight on change |
| `NutritionService` | NutritionRepository, AIService | CRUD nutrition, AI parsing |
| `HistoryService` | HistoryRepository | Date history queries |
| `AuthService` | ConfigService | Login, logout, verify, public path checks |
| `AIService` | ConfigService | Orchestrate AI clients |

#### ProfileService + BodyweightService Cross-Domain Pattern

**Current Problem:** `profile.service.ts` directly imports `insertBodyweightLog` from the bodyweight repository.

**Solution:** ProfileService receives BodyweightService as a dependency and calls it explicitly.

```typescript
// src/services/profile.service.ts (refactored)
import type { ProfileRepository } from "../repositories/profile.repository";
import type { BodyweightService } from "./bodyweight.service";
import type { ProfileRow } from "../types";
import type { ProfileUpdateInput } from "../repositories/profile.repository";
import { getLocalDateString } from "../lib/date";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("profile-service");

export interface ProfileService {
  get(): Promise<ProfileRow>;
  update(data: ProfileUpdateInput, bodyweightDate?: string): Promise<ProfileRow>;
}

export function createProfileService(
  profileRepo: ReturnType<typeof createProfileRepository>,
  bodyweightService: BodyweightService
): ProfileService {
  return {
    async get(): Promise<ProfileRow> {
      return profileRepo.get();
    },
    async update(data: ProfileUpdateInput, bodyweightDate?: string): Promise<ProfileRow> {
      const currentProfile = await profileRepo.get();
      await profileRepo.update(data);

      // Cross-domain: use BodyweightService, not repository directly
      if (data.weight_kg !== currentProfile.weight_kg) {
        const date = bodyweightDate?.trim() ? bodyweightDate : getLocalDateString();
        try {
          await bodyweightService.log(date, data.weight_kg);
          logger.info("Auto-logged bodyweight on profile update", { date, weight: data.weight_kg });
        } catch (error) {
          logger.warn("Failed to auto-log bodyweight", { error: String(error) });
          // Don't fail the profile update if bodyweight logging fails
        }
      }

      return profileRepo.get();
    },
  };
}
```

#### Service Factory Example: `src/services/workout.service.ts`

```typescript
// src/services/workout.service.ts
import type { WorkoutRepository } from "../repositories/workout.repository";
import type { AIService } from "./ai.service";
import type { WorkoutData, WorkoutRow } from "../types";
import type { WorkoutUpdateData } from "../repositories/workout.repository";
import { ValidationError } from "../lib/errors";
import { DEFAULT_WORKOUT_LIMIT, DEFAULT_RECENT_NOTES_LIMIT } from "../constants";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("workout-service");

export interface WorkoutService {
  getRecent(limit?: number): Promise<WorkoutRow[]>;
  getByDate(date: string): Promise<WorkoutRow[]>;
  getDates(): Promise<string[]>;
  create(item: WorkoutData, createdAt?: string, sessionId?: number): Promise<WorkoutRow>;
  update(id: number, data: WorkoutUpdateData): Promise<WorkoutRow | null>;
  delete(id: number): Promise<boolean>;
  parseWorkoutText(rawText: string): Promise<WorkoutData[]>;
  confirmSession(rawText: string, items: WorkoutData[], createdAt: string): Promise<WorkoutRow[]>;
}

export function createWorkoutService(
  repo: ReturnType<typeof createWorkoutRepository>,
  aiService: AIService
): WorkoutService {
  return {
    async getRecent(limit = DEFAULT_WORKOUT_LIMIT): Promise<WorkoutRow[]> {
      return repo.getRecent(limit);
    },
    async getByDate(date: string): Promise<WorkoutRow[]> {
      return repo.getByDate(date);
    },
    async getDates(): Promise<string[]> {
      return repo.getDates();
    },
    async create(item: WorkoutData, createdAt?: string, sessionId?: number): Promise<WorkoutRow> {
      if (!item.exercise_name || item.exercise_name.trim().length === 0) {
        throw new ValidationError("exercise_name cannot be empty");
      }
      const effectiveCreatedAt = createdAt || new Date().toISOString();
      return repo.create(item, effectiveCreatedAt, sessionId);
    },
    async update(id: number, data: WorkoutUpdateData): Promise<WorkoutRow | null> {
      return repo.update(id, data);
    },
    async delete(id: number): Promise<boolean> {
      return repo.delete(id);
    },
    async parseWorkoutText(rawText: string): Promise<WorkoutData[]> {
      if (!rawText || rawText.trim().length === 0) {
        throw new ValidationError("raw_text cannot be empty");
      }
      return aiService.parseWorkoutText(rawText);
    },
    async confirmSession(rawText: string, items: WorkoutData[], createdAt: string): Promise<WorkoutRow[]> {
      if (!items || items.length === 0) {
        throw new ValidationError("No workout items to save");
      }
      return repo.createBatch(rawText, items, createdAt);
    },
  };
}
```

### 6. Route Refactoring Example

#### `src/routes/workouts.routes.ts` (refactored)

```typescript
// src/routes/workouts.routes.ts
import { t } from "elysia";
import { routeHandler, routeHandlerCtx } from "../lib/route-handler";
import { ValidationError } from "../lib/errors";
import { isValidDateString, parseNumericId, isNonEmptyString } from "../lib/validation";
import type { AppContext } from "../context";

export function registerWorkoutRoutes(app: any, ctx: AppContext): void {
  const { workoutService } = ctx;

  app
    .get("/workouts", routeHandler(async () => {
      return await workoutService.getRecent();
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
        body.created_at
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
```

### 7. Refactored Entry Point

#### `src/index.ts` (refactored)

```typescript
// src/index.ts
import { createApp } from "./app";
import { createAppContext } from "./context";
import { createDatabaseClient } from "./db/client";
import { ConfigService } from "./services/config.service";
import { logger } from "./lib/logger";
import { LogLevel } from "./lib/logger";

async function bootstrap() {
  const config = ConfigService.fromEnv();
  const db = createDatabaseClient(config.databaseUrl);
  const ctx = createAppContext(db, config);

  // Ensure profile row exists (startup task)
  await ctx.profileRepository.ensureProfile();
  logger.info("Database connected & profile row ensured");

  if (!config.isAuthEnabled) {
    logger.warn("MASTER_PASSWORD not set - authentication is DISABLED", {
      hint: "Set MASTER_PASSWORD in .env to enable",
    });
  }

  const app = createApp(ctx).listen(config.port);

  logger.info("Frictionless Tracker API started", {
    hostname: app.server?.hostname,
    port: app.server?.port,
  });
}

bootstrap().catch((error) => {
  logger.error("Failed to start application", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
```

---

## Test Architecture Design

### Test File Organization

```
backend/
├── src/
│   └── ... (source files)
└── tests/
    ├── helpers/
    │   ├── test-db.ts          # Test database setup/teardown
    │   ├── test-app.ts         # Test app factory
    │   ├── fixtures.ts         # Test data factories
    │   └── mocks.ts            # Mock factories (AI, etc.)
    ├── unit/
    │   ├── lib/
    │   │   ├── defaults.test.ts
    │   │   ├── errors.test.ts
    │   │   ├── route-handler.test.ts
    │   │   └── validation.test.ts
    │   ├── services/
    │   │   ├── workout.service.test.ts
    │   │   ├── profile.service.test.ts
    │   │   └── ...
    │   └── utils/
    │       └── date.test.ts
    └── integration/
        ├── workouts.test.ts
        ├── analytics.test.ts
        ├── bodyweight.test.ts
        ├── profile.test.ts
        ├── nutrition.test.ts
        ├── auth.test.ts
        └── rest-days.test.ts
```

### Unit Test Strategy

**What to unit test:**
- `lib/defaults.ts` - Default value application
- `lib/errors.ts` - Error classes and helper functions
- `lib/route-handler.ts` - Handler wrapping behavior
- `lib/validation.ts` - Validation functions
- `lib/date.ts` - Date utilities
- All services - with mocked repositories
- AI normalizers - pure functions

**Mocking approach:**
- Use factory pattern: pass mock repos/services to `createXxxService()`
- No need for complex mocking libraries - plain objects work

```typescript
// tests/unit/services/workout.service.test.ts
import { test, expect, mock } from "bun:test";
import { createWorkoutService } from "../../../src/services/workout.service";
import { createWorkoutRepository } from "../../../src/repositories/workout.repository";

test("createWorkoutService validates exercise_name", async () => {
  const mockRepo = createMockWorkoutRepository();
  const mockAI = createMockAIService();
  const service = createWorkoutService(mockRepo, mockAI);

  await expect(
    service.create({ exercise_name: "", weight: 0, reps: 0, /* ... */ })
  ).rejects.toThrow("exercise_name cannot be empty");
});

function createMockWorkoutRepository() {
  return {
    getRecent: mock(async (limit: number) => []),
    getByDate: mock(async (date: string) => []),
    getDates: mock(async () => []),
    create: mock(async (item, createdAt, sessionId) => ({
      id: 1,
      ...item,
      session_id: sessionId ?? 1,
      created_at: createdAt,
    })),
    update: mock(async (id, data) => null),
    delete: mock(async (id) => false),
    createBatch: mock(async (rawText, items, createdAt) => []),
  };
}

function createMockAIService() {
  return {
    parseWorkoutText: mock(async (text: string) => []),
    parseNutritionText: mock(async (text: string) => []),
  };
}
```

### Integration Test Strategy

**Test database with transaction rollback:**

```typescript
// tests/helpers/test-db.ts
import { createDatabaseClient } from "../../src/db/client";
import { migrate } from "../../src/migrate";

let testDbUrl: string;

export async function setupTestDatabase(): Promise<{ db: any; cleanup: () => Promise<void> }> {
  testDbUrl = process.env.TEST_DATABASE_URL || "postgresql://test: test@localhost :5432/workout_tracker_test";
  const db = createDatabaseClient(testDbUrl);

  // Run migrations on test database
  await migrate(db);

  return {
    db,
    cleanup: async () => {
      // Clean up all tables between tests
      await db.execute("TRUNCATE workouts, sessions, bodyweight_logs, nutrition_logs, rest_days RESTART IDENTITY CASCADE");
    },
  };
}
```

```typescript
// tests/helpers/test-app.ts
import { createApp } from "../../src/app";
import { createAppContext } from "../../src/context";
import { ConfigService } from "../../src/services/config.service";

export function createTestApp(db: any): { app: any; ctx: any } {
  const config = ConfigService.forTest({
    masterPassword: "test-pass",
    jwtSecret: "test-secret",
  });

  const ctx = createAppContext(db, config);
  const app = createApp(ctx);

  return { app, ctx };
}
```

**Integration test example:**

```typescript
// tests/integration/workouts.test.ts
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { setupTestDatabase } from "../helpers/test-db";
import { createTestApp } from "../helpers/test-app";

describe("Workout Routes", () => {
  let app: any;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const { db, cleanup: dbCleanup } = await setupTestDatabase();
    cleanup = dbCleanup;
    ({ app } = createTestApp(db));
  });

  afterAll(async () => {
    await cleanup();
  });

  test("GET /api/workouts returns empty array initially", async () => {
    const res = await app.fetch(new Request("http://localhost/api/workouts"));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test("POST /api/workouts creates a workout", async () => {
    const workout = {
      exercise_name: "Bench Press",
      weight: 80,
      reps: 10,
      rpe: 8,
    };

    const res = await app.fetch(
      new Request("http://localhost/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workout),
      })
    );

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.exercise_name).toBe("Bench Press");
    expect(body.data.weight).toBe(80);
  });
});
```

### Test Utilities & Fixtures

```typescript
// tests/helpers/fixtures.ts
import type { WorkoutData } from "../../src/types";

export function createWorkoutFixture(overrides: Partial<WorkoutData> = {}): WorkoutData {
  return {
    exercise_name: "Bench Press",
    weight: 80,
    reps: 10,
    rpe: 8,
    is_bodyweight: false,
    is_assisted: false,
    variant_details: "",
    notes_thai: "",
    notes_english: "",
    tags: [],
    muscle_group: "Chest",
    ...overrides,
  };
}

export function createProfileFixture(overrides = {}) {
  return {
    weight_kg: 70,
    height_cm: 175,
    tdee: 2200,
    calories_intake: 2000,
    protein_target: 150,
    carbs_target: 250,
    fat_target: 65,
    ...overrides,
  };
}
```

---

## Data Models

No changes to database schema. All existing tables and columns remain unchanged. The refactoring affects only the application layer.

---

## API Specifications

**No API changes.** All existing endpoints maintain the same request/response contracts. This is a pure internal refactoring.

---

## Error Handling

### Error Categories

| Error Type | HTTP Status | When |
|-----------|------------|------|
| `ValidationError` | 400 | Invalid input, missing required fields |
| `UnauthorizedError` | 401 | Missing/invalid auth token |
| `NotFoundError` | 404 | Resource not found |
| `ConflictError` | 409 | Duplicate resource, constraint violation |
| `ExternalServiceError` | 502 | AI service failure |
| `AppError` (generic) | 500 | Unexpected errors |

### Error Flow

```
Route Handler (routeHandler/routeHandlerCtx)
  ↓
Service Layer (may throw AppError subclasses)
  ↓
Repository Layer (may throw DB errors, caught and wrapped)
  ↓
routeHandler catches all → logs → returns fail(message)
```

---

## Testing Strategy

### Key Test Cases

#### Unit Tests
1. `withWorkoutDefaults` applies all defaults correctly
2. `routeHandler` catches errors and returns `fail()` response
3. `routeHandler` wraps successful results in `ok()` response
4. `ValidationError` has correct code and status code
5. Date validation functions work correctly
6. Service validation logic (empty exercise name, etc.)

#### Integration Tests
1. Full CRUD lifecycle for each resource type
2. Profile update triggers bodyweight auto-log
3. AI parsing returns structured data (mocked)
4. Auth middleware blocks unauthenticated requests
5. Public paths bypass auth
6. Error responses have correct structure

---

## Implementation Notes

### Elysia Type System Considerations

The `routeHandler` wrapper returns `Promise<ApiResponse<T>>` which is compatible with Elysia's handler return types. However, the generic `any` type for context params is used intentionally to avoid fighting Elysia's complex type system. The actual types are enforced at the validation schema level (Elysia's `body`, `query`, `params` schemas).

### Backward Compatibility

- All existing API endpoints maintain the same paths, methods, and response shapes
- The `db.ts` barrel file is kept temporarily during migration, then removed
- No database schema changes
- No changes to environment variable names

### Performance Considerations

- No new runtime overhead: factory functions run once at startup
- Route handler wrapper adds a single try/catch per handler (negligible)
- Structured logging uses `JSON.stringify` only when emitting (sync, but fast for JSON)

---

## File Change Map

### Files to Create (New)

| File | Purpose |
|------|---------|
| `src/constants.ts` | All magic values centralized |
| `src/lib/defaults.ts` | Default value utilities |
| `src/lib/route-handler.ts` | Route handler wrapper |
| `src/lib/errors.ts` | Type-safe error classes |
| `src/lib/logger.ts` | Structured logging |
| `src/context.ts` | AppContext interface + factory |
| `src/services/config.service.ts` | Injectable config |
| `src/services/workout.service.ts` | Workout domain service |
| `src/services/analytics.service.ts` | Analytics domain service |
| `src/services/bodyweight.service.ts` | Bodyweight domain service |
| `src/services/rest-day.service.ts` | Rest day domain service |
| `src/services/nutrition.service.ts` | Nutrition domain service |
| `src/services/history.service.ts` | History domain service |
| `src/services/auth.service.ts` | Refactored auth service |
| `src/services/ai.service.ts` | AI orchestration service |
| `src/ai/client.ts` | AI client interface + factory |
| `src/ai/prompts.ts` | Workout system prompt |
| `src/ai/normalizers.ts` | Workout data normalization |
| `src/nutrition-ai/client.ts` | Nutrition AI client |
| `src/nutrition-ai/prompts.ts` | Nutrition system prompt |
| `src/nutrition-ai/normalizers.ts` | Nutrition data normalization |
| `tests/helpers/test-db.ts` | Test database setup |
| `tests/helpers/test-app.ts` | Test app factory |
| `tests/helpers/fixtures.ts` | Test data factories |
| `tests/helpers/mocks.ts` | Mock factories |
| `tests/unit/**/*.test.ts` | Unit tests |
| `tests/integration/**/*.test.ts` | Integration tests |

### Files to Modify

| File | Changes |
|------|---------|
| `src/index.ts` | Use createAppContext, createApp(ctx), structured logging |
| `src/app.ts` | Accept AppContext parameter, use route factories with context |
| `src/config.ts` | Simplified - re-exports from ConfigService |
| `src/db.ts` | Deprecated (barrel file) - gradually removed |
| `src/db/client.ts` | Factory functions instead of singleton |
| `src/db/mappers.ts` | Use withDefaults utilities |
| `src/ai.ts` | Refactored into ai/ directory structure |
| `src/nutrition-ai.ts` | Refactored into nutrition-ai/ directory structure |
| `src/lib/api.ts` | Keep ok/fail, update getErrorMessage |
| `src/routes/workouts.routes.ts` | Use routeHandler, call WorkoutService, use constants |
| `src/routes/analytics.routes.ts` | Use routeHandler, call AnalyticsService |
| `src/routes/bodyweight.routes.ts` | Use routeHandler, call BodyweightService |
| `src/routes/rest-days.routes.ts` | Use routeHandler, call RestDayService |
| `src/routes/profile.routes.ts` | Use routeHandler, call ProfileService |
| `src/routes/nutrition.routes.ts` | Use routeHandler, call NutritionService |
| `src/routes/history.routes.ts` | Use routeHandler, call HistoryService |
| `src/routes/notifications.ts` | Use routeHandler, structured logging |
| `src/routes/cron.ts` | Use routeHandler, structured logging |
| `src/repositories/workout.repository.ts` | Factory pattern, use withDefaults |
| `src/repositories/analytics.repository.ts` | Factory pattern |
| `src/repositories/bodyweight.repository.ts` | Factory pattern |
| `src/repositories/history.repository.ts` | Factory pattern |
| `src/repositories/nutrition.repository.ts` | Factory pattern |
| `src/repositories/profile.repository.ts` | Factory pattern |
| `src/repositories/push-subscription.repository.ts` | Factory pattern |
| `src/repositories/rest-day.repository.ts` | Factory pattern |
| `src/services/profile.service.ts` | Use BodyweightService, not repo |
| `src/services/auth.service.ts` | Use ConfigService, constants |

### Files Unchanged

| File | Reason |
|------|--------|
| `src/schema.ts` | No schema changes |
| `src/types.ts` | Domain types unchanged |
| `src/migrate.ts` | Migration logic unchanged |
| `src/lib/validation.ts` | Validation logic unchanged |
| `src/lib/date.ts` | Date utilities unchanged |
| `src/scripts/generate-vapid.ts` | One-off script, no changes needed |

---

## Migration Strategy

### Phase 1: Foundation (no breaking changes)
1. Create `constants.ts` - extract all magic values
2. Create `lib/defaults.ts` - default value utilities
3. Create `lib/errors.ts` - error classes
4. Create `lib/logger.ts` - structured logging
5. Create `lib/route-handler.ts` - handler wrapper
6. Create `services/config.service.ts` - injectable config
7. Update `db/client.ts` to factory pattern
8. Add basic unit tests for new utilities

### Phase 2: Repository Layer
1. Convert all repositories to factory pattern
2. Update repositories to use `withDefaults`
3. Add unit tests for repository factories

### Phase 3: AI Layer
1. Refactor `ai.ts` into `ai/` directory (client, prompts, normalizers)
2. Refactor `nutrition-ai.ts` into `nutrition-ai/` directory
3. Create `AIService` facade
4. Add unit tests for normalizers

### Phase 4: Service Layer
1. Create all service factories
2. Update `profile.service.ts` to use `BodyweightService`
3. Add unit tests for all services

### Phase 5: Route Layer
1. Refactor routes one-by-one to use `routeHandler` and services
2. Replace console.log with structured logging
3. Use constants instead of magic values
4. Add integration tests as routes are converted

### Phase 6: Wiring & Cleanup
1. Create `context.ts` with `createAppContext`
2. Update `app.ts` to accept `AppContext`
3. Update `index.ts` to use new bootstrap pattern
4. Remove deprecated `db.ts` barrel file
5. Clean up unused imports
6. Full integration test suite

### Rollback Strategy

Each phase is independently deployable:
- Phase 1: New files are additive, existing code unchanged
- Phase 2: Repositories keep old exports alongside new factories
- Phase 3: Old `ai.ts` kept alongside new `ai/` structure
- Phase 4: Old services kept during transition
- Phase 5: Routes converted one at a time, others unchanged
- Phase 6: Final cleanup, can revert individual routes if issues

If a phase causes issues:
1. Revert the specific phase's changes
2. All previous phases remain functional
3. No data migration required (no schema changes)

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Route handler breaks Elysia type inference | Medium | Low | Test each route after conversion; keep explicit type annotations |
| Service layer introduces bugs in business logic | High | Low | Comprehensive unit tests; preserve exact same logic during refactor |
| Cross-service call (profile→bodyweight) fails silently | Medium | Low | Log warnings; don't fail profile update if bodyweight fails |
| AI service refactoring breaks parsing | High | Medium | Keep old AI code until new code is fully tested |
| DI context becomes too large | Low | Low | Lazy initialization if needed; currently ~12 dependencies is manageable |
| Test database setup fails in CI | Medium | Medium | Use Docker Compose for test DB; fallback to mocked integration tests |
| Migration takes too long | Low | Medium | Phased approach allows pausing at any point with working code |

### Testing During Migration

1. **After each phase:** Run all existing manual testing (the API still works)
2. **After Phase 1:** Run new unit tests for utilities
3. **After Phase 4:** Run service unit tests with mocked repos
4. **After Phase 5:** Run integration tests against converted routes
5. **After Phase 6:** Full test suite (unit + integration)

### Rollback Checklist

If something breaks during migration:
1. Identify which phase introduced the issue
2. Revert that phase's changes (git revert)
3. Verify the API still works (previous phases are stable)
4. Fix the issue in a branch
5. Re-apply the phase with fixes
