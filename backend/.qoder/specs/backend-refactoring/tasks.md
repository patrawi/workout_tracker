# Backend Refactoring - Implementation Tasks

## Overview

This task list implements the refactoring design document in 6 phases. Each phase is independently verifiable and builds on the previous phase. No phase introduces breaking changes to the API.

**Estimated Total Effort:** ~40-50 hours across 6 phases
**Risk Level:** Medium (mitigated by phased approach and comprehensive tests)

---

## Phase 1: Foundation Infrastructure (No Breaking Changes)

**Goal:** Create all new utility files and infrastructure. Existing code remains untouched.

- [ ] 1.1 **Create `src/constants.ts`** (S)
  - Extract all magic values from codebase
  - Define: `DEFAULT_WORKOUT_LIMIT = 20`, `ANALYTICS_DEFAULT_DAYS_BACK = 7`, `AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 86400`, `HEATMAP_LOOKBACK_DAYS = 365`, `DEFAULT_RECENT_NOTES_LIMIT = 5`, `DEFAULT_EXERCISE_NAME`, `DEFAULT_MUSCLE_GROUP`, `DEFAULT_EMPTY_STRING`, `DEFAULT_NUMBER`, `DEFAULT_BOOLEAN_FALSE`, `DEFAULT_TAGS`, `GEMINI_MODEL_WORKOUT`, `GEMINI_MODEL_NUTRITION`, `GEMINI_TEMPERATURE`, `PROFILE_DEFAULT_ID`
  - File: `src/constants.ts`

- [ ] 1.2 **Create `src/lib/defaults.ts`** (S)
  - Implement `withWorkoutDefaults()` function that applies defaults to workout objects
  - Implement `defaultNumber()`, `defaultString()`, `defaultBoolean()`, `defaultArray()` generic helpers
  - Import constants from `src/constants.ts`
  - File: `src/lib/defaults.ts`

- [ ] 1.3 **Create `src/lib/errors.ts`** (S)
  - Implement `ErrorCode` enum: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `CONFLICT`, `INTERNAL_ERROR`, `EXTERNAL_SERVICE_ERROR`
  - Implement `AppError` base class with `code`, `statusCode`, `details` properties
  - Implement subclasses: `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ConflictError`, `ExternalServiceError`
  - Implement type-safe `getErrorMessage(error: unknown): string` (no type assertions)
  - Implement `getErrorStatusCode(error: unknown): number`
  - File: `src/lib/errors.ts`

- [ ] 1.4 **Create `src/lib/logger.ts`** (M)
  - Implement `LogLevel` enum: `DEBUG`, `INFO`, `WARN`, `ERROR`
  - Implement `LogEntry` interface
  - Implement `createLogger(context: string)` factory returning `{ debug, info, warn, error }` methods
  - Export default `logger` instance and `createChildLogger()` function
  - Respect `LOG_LEVEL` environment variable for filtering
  - File: `src/lib/logger.ts`

- [ ] 1.5 **Create `src/lib/route-handler.ts`** (M)
  - Implement `routeHandler<T>(handler)` that wraps async functions with try/catch/ok/fail
  - Implement `routeHandlerCtx<T>(handler)` that passes Elysia context to handler
  - Both functions catch errors, log via `logger.error()`, and return `fail(message)`
  - File: `src/lib/route-handler.ts`

- [ ] 1.6 **Create `src/services/config.service.ts`** (M)
  - Implement `AppConfig` interface with all config properties
  - Implement `ConfigService` class with:
    - `static fromEnv(env)` - reads from process.env (default) or provided env object
    - `static forTest(overrides)` - creates test config
    - Getter properties for each config value
    - `isAuthEnabled` getter
  - Move env-reading helper functions inside this file (getRequiredEnv, getOptionalEnv, getNumberEnv) - all accept env object parameter
  - File: `src/services/config.service.ts`

- [ ] 1.7 **Update `src/db/client.ts` to factory pattern** (S)
  - Replace singleton export with `createDatabaseClient(databaseUrl: string)` factory
  - Add `createTestDatabaseClient(databaseUrl: string)` for testing
  - Keep default export for backward compatibility during migration: `export default createDatabaseClient(config.databaseUrl)`
  - File: `src/db/client.ts`

- [ ] 1.8 **Write unit tests for Phase 1 utilities** (M)
  - `tests/unit/lib/defaults.test.ts` - test withWorkoutDefaults applies all defaults, test generic helpers
  - `tests/unit/lib/errors.test.ts` - test error classes have correct codes/statusCodes, test getErrorMessage handles all input types
  - `tests/unit/lib/route-handler.test.ts` - test routeHandler returns ok() on success, returns fail() on error, logs errors
  - `tests/unit/lib/validation.test.ts` - test existing validation functions (regression)
  - `tests/unit/lib/date.test.ts` - test existing date functions (regression)

---

## Phase 2: Repository Layer Refactoring

**Goal:** Convert all repositories to factory pattern. Old exports kept for backward compatibility.

- [ ] 2.1 **Refactor `src/repositories/workout.repository.ts`** (M)
  - Create `createWorkoutRepository(db)` factory function
  - Return object with methods: `getRecent`, `getByDate`, `getDates`, `create`, `update`, `delete`, `createBatch`, `getDistinctExercises`, `getByExercise`, `getRecentNotes`
  - Use `withWorkoutDefaults()` from `src/lib/defaults.ts` in insert operations
  - Keep existing function exports for backward compatibility (deprecated, add JSDoc comment)
  - File: `src/repositories/workout.repository.ts`

- [ ] 2.2 **Refactor `src/repositories/analytics.repository.ts`** (S)
  - Create `createAnalyticsRepository(db)` factory
  - Return object with methods: `getHeatmap`, `getVolume`
  - File: `src/repositories/analytics.repository.ts`

- [ ] 2.3 **Refactor `src/repositories/bodyweight.repository.ts`** (S)
  - Create `createBodyweightRepository(db)` factory
  - Return object with methods: `insert`, `getAll`
  - File: `src/repositories/bodyweight.repository.ts`

- [ ] 2.4 **Refactor `src/repositories/rest-day.repository.ts`** (S)
  - Create `createRestDayRepository(db)` factory
  - Return object with methods: `upsert`, `delete`
  - File: `src/repositories/rest-day.repository.ts`

- [ ] 2.5 **Refactor `src/repositories/profile.repository.ts`** (S)
  - Create `createProfileRepository(db)` factory
  - Return object with methods: `ensureProfile`, `get`, `update`
  - File: `src/repositories/profile.repository.ts`

- [ ] 2.6 **Refactor `src/repositories/nutrition.repository.ts`** (S)
  - Create `createNutritionRepository(db)` factory
  - Return object with methods: `insertBatch`, `getByDate`, `getDates`, `deleteItem`, `deleteByDate`
  - File: `src/repositories/nutrition.repository.ts`

- [ ] 2.7 **Refactor `src/repositories/history.repository.ts`** (S)
  - Create `createHistoryRepository(db)` factory
  - Return object with methods: `getDates`
  - File: `src/repositories/history.repository.ts`

- [ ] 2.8 **Refactor `src/repositories/push-subscription.repository.ts`** (S)
  - Create `createPushSubscriptionRepository(db)` factory
  - Return object with methods: `save`, `getAll`, `delete`
  - File: `src/repositories/push-subscription.repository.ts`

- [ ] 2.9 **Update `src/db/mappers.ts` to use defaults** (S)
  - Update `mapWorkoutRow` to use `withWorkoutDefaults` or individual default helpers
  - Update `mapProfileRow`, `mapRestDayRow`, `mapBodyweightLogRow`, `mapNutritionLogRow` similarly
  - File: `src/db/mappers.ts`

- [ ] 2.10 **Write unit tests for repository factories** (M)
  - `tests/unit/repositories/workout.repository.test.ts` - test factory creates correct methods, test with mocked db
  - `tests/unit/repositories/profile.repository.test.ts` - test ensureProfile, get, update with mocked db
  - (Additional repo tests as needed for complex repos)

---

## Phase 3: AI Layer Refactoring

**Goal:** Split monolithic AI files into testable, mockable structure.

- [ ] 3.1 **Create `src/ai/prompts.ts`** (S)
  - Move `SYSTEM_PROMPT` from `ai.ts` to `WORKOUT_SYSTEM_PROMPT`
  - File: `src/ai/prompts.ts`

- [ ] 3.2 **Create `src/ai/normalizers.ts`** (S)
  - Move `normalizeItem` from `ai.ts` to `normalizeWorkoutItem`
  - Use `withWorkoutDefaults()` from `src/lib/defaults.ts`
  - File: `src/ai/normalizers.ts`

- [ ] 3.3 **Create `src/ai/client.ts`** (M)
  - Implement `AIClient` interface with `parse(rawText): Promise<WorkoutData[]>`
  - Implement `createWorkoutAIClient(apiKey, model)` factory
  - Uses prompts and normalizers from sibling files
  - File: `src/ai/client.ts`

- [ ] 3.4 **Create `src/nutrition-ai/prompts.ts`** (S)
  - Move `SYSTEM_PROMPT` from `nutrition-ai.ts` to `NUTRITION_SYSTEM_PROMPT`
  - File: `src/nutrition-ai/prompts.ts`

- [ ] 3.5 **Create `src/nutrition-ai/normalizers.ts`** (S)
  - Move `normalizeItem`, `normalizeMeal`, `roundTo1` from `nutrition-ai.ts`
  - File: `src/nutrition-ai/normalizers.ts`

- [ ] 3.6 **Create `src/nutrition-ai/client.ts`** (M)
  - Implement `NutritionAIClient` interface with `parse(rawText): Promise<NutritionItem[]>`
  - Implement `createNutritionAIClient(apiKey, model)` factory
  - File: `src/nutrition-ai/client.ts`

- [ ] 3.7 **Create `src/services/ai.service.ts`** (M)
  - Implement `AIService` interface: `parseWorkoutText()`, `parseNutritionText()`
  - Implement `createAIService(config: ConfigService)` factory
  - Wraps AI clients with error handling (ExternalServiceError) and logging
  - Checks for missing API key and throws appropriate error
  - File: `src/services/ai.service.ts`

- [ ] 3.8 **Write unit tests for AI layer** (M)
  - `tests/unit/ai/normalizers.test.ts` - test normalizeWorkoutItem applies correct defaults
  - `tests/unit/nutrition-ai/normalizers.test.ts` - test normalizeNutritionItem, normalizeMeal
  - `tests/unit/services/ai.service.test.ts` - test AIService throws ExternalServiceError when API key missing, delegates to clients

---

## Phase 4: Service Layer Creation

**Goal:** Create full service layer with proper domain boundaries.

- [ ] 4.1 **Create `src/services/workout.service.ts`** (M)
  - Implement `WorkoutService` interface
  - Implement `createWorkoutService(repo, aiService)` factory
  - Methods: `getRecent`, `getByDate`, `getDates`, `create`, `update`, `delete`, `parseWorkoutText`, `confirmSession`
  - Move validation logic from routes into service (exercise_name check, raw_text check, items check)
  - Use constants for default values
  - File: `src/services/workout.service.ts`

- [ ] 4.2 **Create `src/services/analytics.service.ts`** (S)
  - Implement `AnalyticsService` interface
  - Implement `createAnalyticsService(repo)` factory
  - Methods: `getExercises`, `getAnalytics`, `getVolume`, `getNotes`, `getHeatmap`
  - Use constants for default days-back values
  - File: `src/services/analytics.service.ts`

- [ ] 4.3 **Create `src/services/bodyweight.service.ts`** (S)
  - Implement `BodyweightService` interface
  - Implement `createBodyweightService(repo)` factory
  - Methods: `log(date, weight)`, `getLogs(daysBack)`
  - File: `src/services/bodyweight.service.ts`

- [ ] 4.4 **Create `src/services/rest-day.service.ts`** (S)
  - Implement `RestDayService` interface
  - Implement `createRestDayService(repo)` factory
  - Methods: `upsert(input)`, `delete(date)`
  - File: `src/services/rest-day.service.ts`

- [ ] 4.5 **Create `src/services/nutrition.service.ts`** (M)
  - Implement `NutritionService` interface
  - Implement `createNutritionService(repo, aiService)` factory
  - Methods: `parse(rawText)`, `log(items, date)`, `getByDate(date)`, `getDates()`, `deleteItem(id)`, `deleteByDate(date)`
  - File: `src/services/nutrition.service.ts`

- [ ] 4.6 **Create `src/services/history.service.ts`** (S)
  - Implement `HistoryService` interface
  - Implement `createHistoryService(repo)` factory
  - Methods: `getDates()`
  - File: `src/services/history.service.ts`

- [ ] 4.7 **Refactor `src/services/profile.service.ts`** (M)
  - Update to use `createProfileService(profileRepo, bodyweightService)` factory
  - Replace direct `insertBodyweightLog` import with `bodyweightService.log()` call
  - Add logging for auto bodyweight logging
  - Wrap bodyweight logging in try/catch so profile update doesn't fail if bodyweight fails
  - File: `src/services/profile.service.ts`

- [ ] 4.8 **Refactor `src/services/auth.service.ts`** (M)
  - Implement `AuthService` interface
  - Implement `createAuthService(config: ConfigService)` factory
  - Use `AUTH_COOKIE_MAX_AGE_SECONDS` from constants
  - Move `isPublicPath`, `AUTH_PUBLIC_PATHS` into service
  - Export existing functions for backward compatibility (used by app.ts)
  - File: `src/services/auth.service.ts`

- [ ] 4.9 **Write unit tests for service layer** (L)
  - `tests/unit/services/workout.service.test.ts` - test validation, delegation to repo, AI integration
  - `tests/unit/services/profile.service.test.ts` - test auto bodyweight logging on weight change, no logging when weight unchanged
  - `tests/unit/services/analytics.service.test.ts` - test default values, delegation
  - `tests/unit/services/bodyweight.service.test.ts` - test log and getLogs
  - `tests/unit/services/nutrition.service.test.ts` - test parsing, logging

---

## Phase 5: Route Layer Refactoring

**Goal:** Convert routes to use routeHandler wrapper and services. One route file at a time.

- [ ] 5.1 **Refactor `src/routes/workouts.routes.ts`** (M)
  - Update function signature: `registerWorkoutRoutes(app, ctx: AppContext)`
  - Replace all direct repo imports with `ctx.workoutService`
  - Replace try/catch/ok/fail blocks with `routeHandler`/`routeHandlerCtx`
  - Replace magic values with constants
  - Replace console.log/console.error with logger
  - Throw `ValidationError` for validation failures instead of returning fail()
  - File: `src/routes/workouts.routes.ts`

- [ ] 5.2 **Refactor `src/routes/analytics.routes.ts`** (S)
  - Update to use `ctx.analyticsService`
  - Use routeHandler wrapper
  - Use constants for default days-back
  - File: `src/routes/analytics.routes.ts`

- [ ] 5.3 **Refactor `src/routes/bodyweight.routes.ts`** (S)
  - Update to use `ctx.bodyweightService`
  - Use routeHandler wrapper
  - File: `src/routes/bodyweight.routes.ts`

- [ ] 5.4 **Refactor `src/routes/rest-days.routes.ts`** (S)
  - Update to use `ctx.restDayService`
  - Use routeHandler wrapper
  - File: `src/routes/rest-days.routes.ts`

- [ ] 5.5 **Refactor `src/routes/profile.routes.ts`** (S)
  - Update to use `ctx.profileService`
  - Use routeHandler wrapper
  - File: `src/routes/profile.routes.ts`

- [ ] 5.6 **Refactor `src/routes/nutrition.routes.ts`** (S)
  - Update to use `ctx.nutritionService`
  - Use routeHandler wrapper
  - File: `src/routes/nutrition.routes.ts`

- [ ] 5.7 **Refactor `src/routes/history.routes.ts`** (S)
  - Update to use `ctx.historyService`
  - Use routeHandler wrapper
  - File: `src/routes/history.routes.ts`

- [ ] 5.8 **Refactor `src/routes/notifications.ts`** (S)
  - Replace console.log with logger
  - Use routeHandler for the POST endpoint
  - File: `src/routes/notifications.ts`

- [ ] 5.9 **Refactor `src/routes/cron.ts`** (S)
  - Replace console.log with logger
  - Use routeHandler
  - File: `src/routes/cron.ts`

- [ ] 5.10 **Write integration tests for converted routes** (L)
  - `tests/integration/workouts.test.ts` - full CRUD, validation errors, response structure
  - `tests/integration/analytics.test.ts` - analytics endpoints with test data
  - `tests/integration/profile.test.ts` - profile CRUD, bodyweight auto-log verification
  - `tests/integration/bodyweight.test.ts` - bodyweight CRUD
  - `tests/integration/auth.test.ts` - login, logout, verify, protected routes

---

## Phase 6: Wiring, Bootstrap & Cleanup

**Goal:** Connect everything together and remove deprecated code.

- [ ] 6.1 **Create `src/context.ts`** (M)
  - Implement `AppContext` interface with all service types
  - Implement `createAppContext(db, config)` factory that builds the full dependency graph
  - Order: repos → AI service → services → auth service
  - ProfileService receives BodyweightService (cross-domain dependency)
  - File: `src/context.ts`

- [ ] 6.2 **Update `src/app.ts`** (M)
  - Change `createApp()` to `createApp(ctx: AppContext)`
  - Pass ctx to all route registration functions
  - Keep auth middleware logic (uses AuthService from ctx)
  - File: `src/app.ts`

- [ ] 6.3 **Update `src/index.ts`** (M)
  - Import and use new bootstrap pattern:
    - `ConfigService.fromEnv()`
    - `createDatabaseClient(config.databaseUrl)`
    - `createAppContext(db, config)`
    - `ensureProfileRow` via ctx
    - `createApp(ctx)`
  - Replace all console.log with logger
  - Add error handling for bootstrap failures
  - File: `src/index.ts`

- [ ] 6.4 **Update `src/config.ts`** (S)
  - Simplify to re-export from ConfigService for backward compatibility
  - Keep `config` object and `isAuthEnabled` export for any remaining direct imports
  - Add deprecation JSDoc comments
  - File: `src/config.ts`

- [ ] 6.5 **Remove deprecated `src/db.ts` barrel file** (S)
  - Ensure no remaining imports from `../db` in route/repo/service files
  - Delete `src/db.ts`
  - File: `src/db.ts` (DELETE)

- [ ] 6.6 **Clean up deprecated exports** (S)
  - Remove old function exports from repository files (marked deprecated in Phase 2)
  - Remove old auth function exports if no longer needed
  - Remove unused imports across all files
  - Run TypeScript compiler to verify no type errors

- [ ] 6.7 **Write test helpers and fixtures** (M)
  - `tests/helpers/test-db.ts` - test database setup with cleanup
  - `tests/helpers/test-app.ts` - test app factory with ConfigService.forTest()
  - `tests/helpers/fixtures.ts` - workout, profile, bodyweight fixtures
  - `tests/helpers/mocks.ts` - mock AI service, mock repositories
  - Files: `tests/helpers/*.ts`

- [ ] 6.8 **Full test suite verification** (M)
  - Run `bun test` and ensure all tests pass
  - Fix any failures
  - Ensure no TypeScript compilation errors

- [ ] 6.9 **Manual smoke testing** (S)
  - Start the server with `bun run src/index.ts`
  - Verify all endpoints work:
    - GET /health
    - GET/POST /api/workouts
    - GET/POST /api/bodyweight
    - GET/PUT /api/profile
    - POST /api/parse
    - POST /api/confirm
    - GET /api/analytics
    - GET /api/heatmap
    - GET/POST /api/rest-days
    - GET/POST /api/nutrition
    - POST /api/auth/login
    - GET /api/auth/verify
  - Verify structured logging output in console

---

## Implementation Order Summary

```
Phase 1 (Foundation) → Phase 2 (Repos) → Phase 3 (AI) → Phase 4 (Services) → Phase 5 (Routes) → Phase 6 (Wiring)
```

**Parallel Opportunities:**
- Within Phase 2: All repository refactors (2.1-2.8) can be done in parallel
- Within Phase 3: Workout AI and Nutrition AI refactors (3.1-3.3, 3.4-3.6) can be done in parallel
- Within Phase 4: Services 4.2-4.6 can be done in parallel (only 4.1 and 4.7 have dependencies)
- Within Phase 5: Route refactors (5.2-5.9) can be done in parallel (only 5.1 is most complex)

**Dependencies:**
- Phase 2 depends on Phase 1 (uses defaults, errors, logger)
- Phase 3 depends on Phase 1 (uses constants, defaults, errors, logger)
- Phase 4 depends on Phase 2 (uses repo factories) and Phase 3 (uses AIService)
- Phase 4.7 depends on Phase 4.3 (ProfileService needs BodyweightService)
- Phase 5 depends on Phase 4 (uses services) and Phase 1 (uses routeHandler, errors)
- Phase 6 depends on all previous phases

---

## Files Summary

### New Files to Create (26+)
- `src/constants.ts`
- `src/lib/defaults.ts`
- `src/lib/errors.ts`
- `src/lib/logger.ts`
- `src/lib/route-handler.ts`
- `src/services/config.service.ts`
- `src/services/workout.service.ts`
- `src/services/analytics.service.ts`
- `src/services/bodyweight.service.ts`
- `src/services/rest-day.service.ts`
- `src/services/nutrition.service.ts`
- `src/services/history.service.ts`
- `src/services/ai.service.ts`
- `src/ai/prompts.ts`
- `src/ai/normalizers.ts`
- `src/ai/client.ts`
- `src/nutrition-ai/prompts.ts`
- `src/nutrition-ai/normalizers.ts`
- `src/nutrition-ai/client.ts`
- `src/context.ts`
- `tests/helpers/test-db.ts`
- `tests/helpers/test-app.ts`
- `tests/helpers/fixtures.ts`
- `tests/helpers/mocks.ts`
- `tests/unit/**/*.test.ts` (10+ test files)
- `tests/integration/**/*.test.ts` (5+ test files)

### Files to Modify (25)
- `src/index.ts`, `src/app.ts`, `src/config.ts`
- `src/db/client.ts`, `src/db/mappers.ts`
- `src/ai.ts`, `src/nutrition-ai.ts` (refactored into directories)
- `src/lib/api.ts`
- `src/routes/*.ts` (8 route files)
- `src/repositories/*.ts` (8 repository files)
- `src/services/auth.service.ts`, `src/services/profile.service.ts`

### Files to Delete (1)
- `src/db.ts` (deprecated barrel file)

### Files Unchanged (5)
- `src/schema.ts`, `src/types.ts`, `src/migrate.ts`
- `src/lib/validation.ts`, `src/lib/date.ts`
- `src/scripts/generate-vapid.ts`

---

## Success Criteria

- [ ] All 6 phases completed
- [ ] `bun test` passes with unit and integration tests
- [ ] `bun run src/index.ts` starts server without errors
- [ ] All API endpoints respond correctly (manual verification)
- [ ] No TypeScript compilation errors
- [ ] No `console.log`/`console.error` remaining in application code (only in logger)
- [ ] No magic values remaining (all in constants.ts)
- [ ] No direct repository imports from route files
- [ ] No `as ApiError` type assertions
- [ ] `src/db.ts` barrel file removed
- [ ] Profile update correctly uses BodyweightService (not direct repo)
- [ ] Structured JSON logging in output
- [ ] No breaking API changes (same request/response contracts)
