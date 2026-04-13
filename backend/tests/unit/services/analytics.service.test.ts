import { test, expect, describe, mock } from "bun:test";
import { createAnalyticsService } from "../../../src/services/analytics.service";

function createMockAnalyticsRepo() {
  return {
    getHeatmap: mock(async () => []),
    getVolume: mock(async (daysBack: number) => []),
  };
}

function createMockWorkoutRepo() {
  return {
    getDistinctExercises: mock(async () => []),
    getByExercise: mock(async (exercise: string, daysBack: number) => []),
    getRecentNotes: mock(async (exercise: string, limit: number) => []),
  };
}

describe("createAnalyticsService", () => {
  test("creates service with all methods", () => {
    const mockAR = createMockAnalyticsRepo();
    const mockWR = createMockWorkoutRepo();
    const service = createAnalyticsService(mockAR as any, mockWR as any);

    expect(typeof service.getExercises).toBe("function");
    expect(typeof service.getAnalytics).toBe("function");
    expect(typeof service.getVolume).toBe("function");
    expect(typeof service.getNotes).toBe("function");
    expect(typeof service.getHeatmap).toBe("function");
  });
});
