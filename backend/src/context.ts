// src/context.ts

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createAnalyticsRepository } from "./repositories/analytics.repository";
import { createWorkoutRepository } from "./repositories/workout.repository";
import { createProfileRepository } from "./repositories/profile.repository";
import { createBodyweightRepository } from "./repositories/bodyweight.repository";
import { createRestDayRepository } from "./repositories/rest-day.repository";
import { createHistoryRepository } from "./repositories/history.repository";
import { createNutritionRepository } from "./repositories/nutrition.repository";
import { createFoodCatalogRepository } from "./repositories/food-catalog.repository";
import { createAIService } from "./services/ai.service";
import { createAnalyticsService } from "./services/analytics.service";
import { createBodyweightService } from "./services/bodyweight.service";
import { createRestDayService } from "./services/rest-day.service";
import { createHistoryService } from "./services/history.service";
import { createProfileService } from "./services/profile.service";
import { createWorkoutService } from "./services/workout.service";
import { createNutritionService } from "./services/nutrition.service";
import { createFoodCatalogService } from "./services/food-catalog.service";
import type { FoodCatalogService } from "./services/food-catalog.service";
import { createEmbeddingClient } from "./embeddings/client";
import { createAuthService } from "./services/auth.service";
import type { AnalyticsService } from "./services/analytics.service";
import type { BodyweightService } from "./services/bodyweight.service";
import type { RestDayService } from "./services/rest-day.service";
import type { HistoryService } from "./services/history.service";
import type { ProfileService } from "./services/profile.service";
import type { WorkoutService } from "./services/workout.service";
import type { NutritionService } from "./services/nutrition.service";
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
  foodCatalogService: FoodCatalogService;
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
  const foodCatalogRepo = createFoodCatalogRepository(db);

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
  const profileService = createProfileService(profileRepo, bodyweightService);
  const authService = createAuthService(config);

  return {
    analyticsService,
    bodyweightService,
    restDayService,
    historyService,
    profileService,
    workoutService,
    nutritionService,
    foodCatalogService,
    configService: config,
    authService,
  };
}
