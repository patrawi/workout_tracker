import { test, expect, describe, mock } from "bun:test";
import { createWorkoutService } from "../../../src/services/workout.service";
import { ValidationError } from "../../../src/lib/errors";

function createMockWorkoutRepo() {
  return {
    getRecent: mock(async (limit: number) => []),
    getByDate: mock(async (date: string) => []),
    getDates: mock(async () => []),
    create: mock(async (item: any, createdAt: string, sessionId?: number) => ({
      id: 1,
      ...item,
      session_id: sessionId ?? 1,
      created_at: createdAt,
    })),
    update: mock(async (id: number, data: any) => null),
    delete: mock(async (id: number) => false),
    createBatch: mock(async (raw: string, items: any[], createdAt: string) => []),
    getDistinctExercises: mock(async () => []),
    getByExercise: mock(async (exercise: string, daysBack: number) => []),
    getRecentNotes: mock(async (exercise: string, limit: number) => []),
  };
}

function createMockAIService() {
  return {
    parseWorkoutText: mock(async (text: string) => []),
    parseNutritionText: mock(async (text: string) => []),
  };
}

describe("createWorkoutService", () => {
  test("creates service with all methods", () => {
    const mockRepo = createMockWorkoutRepo();
    const mockAI = createMockAIService();
    const service = createWorkoutService(mockRepo as any, mockAI);

    expect(typeof service.getRecent).toBe("function");
    expect(typeof service.getByDate).toBe("function");
    expect(typeof service.getDates).toBe("function");
    expect(typeof service.create).toBe("function");
    expect(typeof service.update).toBe("function");
    expect(typeof service.delete).toBe("function");
    expect(typeof service.parseWorkoutText).toBe("function");
    expect(typeof service.confirmSession).toBe("function");
  });

  test("create validates exercise_name", async () => {
    const mockRepo = createMockWorkoutRepo();
    const mockAI = createMockAIService();
    const service = createWorkoutService(mockRepo as any, mockAI);

    await expect(
      service.create({ exercise_name: "", weight: 0, reps: 0, rpe: 0, is_bodyweight: false, is_assisted: false, variant_details: "", notes_thai: "", notes_english: "", tags: [], muscle_group: "Other" })
    ).rejects.toThrow(ValidationError);
  });

  test("parseWorkoutText validates raw_text", async () => {
    const mockRepo = createMockWorkoutRepo();
    const mockAI = createMockAIService();
    const service = createWorkoutService(mockRepo as any, mockAI);

    await expect(service.parseWorkoutText("")).rejects.toThrow(ValidationError);
  });

  test("confirmSession validates items", async () => {
    const mockRepo = createMockWorkoutRepo();
    const mockAI = createMockAIService();
    const service = createWorkoutService(mockRepo as any, mockAI);

    await expect(
      service.confirmSession("text", [], "2024-01-01")
    ).rejects.toThrow(ValidationError);
  });

  test("delegates to repo on valid create", async () => {
    const mockRepo = createMockWorkoutRepo();
    const mockAI = createMockAIService();
    const service = createWorkoutService(mockRepo as any, mockAI);

    const result = await service.create({
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
    });

    expect(mockRepo.create).toHaveBeenCalled();
    expect(result.exercise_name).toBe("Bench Press");
  });
});
