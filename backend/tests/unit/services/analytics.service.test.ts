import { test, expect, describe, mock } from "bun:test";
import { createAnalyticsService } from "../../../src/services/analytics.service";

function createMockAnalyticsRepo() {
  return {
    getHeatmap: mock(async () => []),
    getVolume: mock(async (daysBack: number) => []),
    getVolumeTrend: mock(async (daysBack: number) => []),
    getMuscleDetail: mock(async (group: string) => ({
      muscle_group: group,
      sets_7d: 16,
      exercises_7d: 4,
      weekly_volume: [],
      exercises: [],
    })),
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
    expect(typeof service.getVolumeTrend).toBe("function");
    expect(typeof service.getNotes).toBe("function");
    expect(typeof service.getHeatmap).toBe("function");
    expect(typeof service.getMuscleDetail).toBe("function");
  });

  test("getMuscleDetail passes the group and user through to the repository", async () => {
    const mockAR = createMockAnalyticsRepo();
    const service = createAnalyticsService(mockAR as any, createMockWorkoutRepo() as any);

    const detail = await service.getMuscleDetail("Chest", 9);

    expect(mockAR.getMuscleDetail).toHaveBeenCalledWith("Chest", 9);
    expect(detail.muscle_group).toBe("Chest");
    expect(detail.sets_7d).toBe(16);
  });
});
