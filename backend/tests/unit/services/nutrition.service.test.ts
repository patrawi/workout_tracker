import { test, expect, describe, mock } from "bun:test";
import { createNutritionService } from "../../../src/services/nutrition.service";
import { ValidationError } from "../../../src/lib/errors";

function createMockNutritionRepo() {
  return {
    insertBatch: mock(async (date: string, items: any[]) => []),
    update: mock(async (id: number, data: any) => null),
    getByDate: mock(async (date: string) => []),
    getDates: mock(async () => []),
    deleteItem: mock(async (id: number) => {}),
    deleteByDate: mock(async (date: string) => {}),
  };
}

function createMockAIService() {
  return {
    parseWorkoutText: mock(async (text: string) => []),
    parseNutritionText: mock(async (text: string) => []),
  };
}

describe("createNutritionService", () => {
  test("creates service with all methods", () => {
    const mockRepo = createMockNutritionRepo();
    const mockAI = createMockAIService();
    const service = createNutritionService(mockRepo as any, mockAI);

    expect(typeof service.parse).toBe("function");
    expect(typeof service.log).toBe("function");
    expect(typeof service.getByDate).toBe("function");
    expect(typeof service.getDates).toBe("function");
    expect(typeof service.deleteItem).toBe("function");
    expect(typeof service.deleteByDate).toBe("function");
  });

  test("parse validates raw_text", async () => {
    const mockRepo = createMockNutritionRepo();
    const mockAI = createMockAIService();
    const service = createNutritionService(mockRepo as any, mockAI);

    await expect(service.parse("")).rejects.toThrow(ValidationError);
  });

  test("log validates items", async () => {
    const mockRepo = createMockNutritionRepo();
    const mockAI = createMockAIService();
    const service = createNutritionService(mockRepo as any, mockAI);

    await expect(service.log([], "2024-01-01")).rejects.toThrow(ValidationError);
  });
});
