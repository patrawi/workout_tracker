// src/context.ts

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createAnalyticsRepository } from "./repositories/analytics.repository";
import { createWorkoutRepository } from "./repositories/workout.repository";
import { createProfileRepository } from "./repositories/profile.repository";
import { createBodyweightRepository } from "./repositories/bodyweight.repository";
import { createRestDayRepository } from "./repositories/rest-day.repository";
import { createHistoryRepository } from "./repositories/history.repository";
import { createNutritionRepository } from "./repositories/nutrition.repository";
import { createWaterRepository } from "./repositories/water.repository";
import { createGymsRepository } from "./repositories/gyms.repository";
import { createFoodCatalogRepository } from "./repositories/food-catalog.repository";
import { createCoachPlanRepository } from "./repositories/coach-plan.repository";
import { createCoachKnowledgeRepository } from "./repositories/coach-knowledge.repository";
import { createNutritionEstimationRepository } from "./repositories/nutrition-estimation.repository";
import { createReferenceMatcher } from "./nutrition-estimation/matching/matcher";
import { createNutritionEstimationService } from "./nutrition-estimation/service";
import { createDeepSeekVisionInterpreter } from "./nutrition-estimation/vlm/deepseek-vision";
import { createAIService } from "./services/ai.service";
import { createAnalyticsService } from "./services/analytics.service";
import { createBodyweightService } from "./services/bodyweight.service";
import { createRestDayService } from "./services/rest-day.service";
import { createHistoryService } from "./services/history.service";
import { createProfileService } from "./services/profile.service";
import { createWorkoutService } from "./services/workout.service";
import { createNutritionService } from "./services/nutrition.service";
import { createWaterService } from "./services/water.service";
import { createGymsService } from "./services/gyms.service";
import { createFoodCatalogService } from "./services/food-catalog.service";
import type { FoodCatalogService } from "./services/food-catalog.service";
import { createCoachService } from "./services/coach.service";
import type { CoachService } from "./services/coach.service";
import { createEmbeddingClient } from "./embeddings/client";
import { createAuthService } from "./services/auth.service";
import { createUsersRepository } from "./repositories/users.repository";
import type { AnalyticsService } from "./services/analytics.service";
import type { BodyweightService } from "./services/bodyweight.service";
import type { RestDayService } from "./services/rest-day.service";
import type { HistoryService } from "./services/history.service";
import type { ProfileService } from "./services/profile.service";
import type { WorkoutService } from "./services/workout.service";
import type { NutritionService } from "./services/nutrition.service";
import type { NutritionEstimationService } from "./nutrition-estimation/service";
import type { WaterService } from "./services/water.service";
import type { GymsService } from "./services/gyms.service";
import type { ConfigService } from "./services/config.service";
import type { AuthService } from "./services/auth.service";

export interface AppContext {
  analyticsService: AnalyticsService;
  bodyweightService: BodyweightService;
  restDayService: RestDayService;
  historyService: HistoryService;
  profileService: ProfileService;
  workoutService: WorkoutService;
  nutritionService: NutritionService;
  nutritionEstimationService: NutritionEstimationService;
  waterService: WaterService;
  gymsService: GymsService;
  foodCatalogService: FoodCatalogService;
  coachService: CoachService;
  configService: ConfigService;
  authService: AuthService;
}

export function createAppContext(
  db: PostgresJsDatabase,
  config: ConfigService,
): AppContext {
  // Create repositories
  const analyticsRepo = createAnalyticsRepository(db);
  const workoutRepo = createWorkoutRepository(db);
  const profileRepo = createProfileRepository(db);
  const bodyweightRepo = createBodyweightRepository(db);
  const restDayRepo = createRestDayRepository(db);
  const historyRepo = createHistoryRepository(db);
  const nutritionRepo = createNutritionRepository(db);
  const waterRepo = createWaterRepository(db);
  const gymsRepo = createGymsRepository(db);
  const foodCatalogRepo = createFoodCatalogRepository(db);
  const coachPlanRepo = createCoachPlanRepository(db);
  const coachKnowledgeRepo = createCoachKnowledgeRepository(db);
  const nutritionEstimationRepo = createNutritionEstimationRepository(db);

  // Create AI service
  const aiService = createAIService(config);
  const embeddingClient = createEmbeddingClient(config.geminiApiKey);
  // Create services
  const analyticsService = createAnalyticsService(analyticsRepo, workoutRepo);
  const bodyweightService = createBodyweightService(bodyweightRepo);
  const restDayService = createRestDayService(restDayRepo);
  const historyService = createHistoryService(historyRepo);
  const workoutService = createWorkoutService(workoutRepo, aiService);
  const foodCatalogService = createFoodCatalogService(foodCatalogRepo, embeddingClient);
  const nutritionService = createNutritionService(nutritionRepo, aiService, foodCatalogService);

  // Nutrition Estimation V1 — hybrid matcher uses the same repo for the lexical
  // pool and the pgvector fallback (embedding only wired when a Gemini key
  // exists; otherwise lexical-only, which is acceptable for V1 core).
  const referenceMatcher = createReferenceMatcher(nutritionEstimationRepo, {
    embed: config.geminiApiKey
      ? (text) => embeddingClient.embed(text)
      : undefined,
  });
  const nutritionEstimationService = createNutritionEstimationService({
    repo: nutritionEstimationRepo,
    matcher: referenceMatcher,
    // VLM interpreter is optional; without a DeepSeek key interpret() returns
    // { status: "unavailable" } and logging proceeds manually (ADR 0017).
    interpreter: config.deepseekApiKey
      ? createDeepSeekVisionInterpreter({ apiKey: config.deepseekApiKey })
      : undefined,
    // Query embedder for the search vector tier (ADR 0014) — same client the
    // matcher fallback uses; harmless when the key is absent.
    embed: config.geminiApiKey
      ? (text) => embeddingClient.embed(text)
      : undefined,
  });
  const waterService = createWaterService(waterRepo);
  const gymsService = createGymsService(gymsRepo);
  const profileService = createProfileService(profileRepo, bodyweightService);
  const usersRepo = createUsersRepository(db);
  const authService = createAuthService(config, { usersRepo });
  const coachService = createCoachService(config, {
    analyticsService,
    nutritionService,
    bodyweightService,
    profileService,
    coachPlanRepo,
    coachKnowledgeRepo,
    workoutRepo,
  });

  return {
    analyticsService,
    bodyweightService,
    restDayService,
    historyService,
    profileService,
    workoutService,
    nutritionService,
    nutritionEstimationService,
    waterService,
    gymsService,
    foodCatalogService,
    coachService,
    configService: config,
    authService,
  };
}
