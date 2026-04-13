import { test, expect, describe, mock } from "bun:test";
import { createProfileService } from "../../../src/services/profile.service";

function createMockProfileRepo() {
  return {
    ensure: mock(async () => {}),
    get: mock(async () => ({
      id: 1,
      weight_kg: 70,
      height_cm: 175,
      tdee: 2200,
      calories_intake: 2000,
      protein_target: 150,
      carbs_target: 250,
      fat_target: 65,
      updated_at: "2024-01-01",
    })),
    update: mock(async (data: any) => {}),
  };
}

function createMockBodyweightService() {
  return {
    log: mock(async (date: string, weight: number) => {}),
    getLogs: mock(async (daysBack: number) => []),
  };
}

describe("createProfileService", () => {
  test("creates service with all methods", () => {
    const mockRepo = createMockProfileRepo();
    const mockBW = createMockBodyweightService();
    const service = createProfileService(mockRepo as any, mockBW);

    expect(typeof service.get).toBe("function");
    expect(typeof service.update).toBe("function");
  });

  test("update calls profile repo", async () => {
    const mockRepo = createMockProfileRepo();
    const mockBW = createMockBodyweightService();
    const service = createProfileService(mockRepo as any, mockBW);

    await service.update({
      weight_kg: 70,
      height_cm: 175,
      tdee: 2200,
      calories_intake: 2000,
      protein_target: 150,
      carbs_target: 250,
      fat_target: 65,
    });

    expect(mockRepo.update).toHaveBeenCalled();
  });

  test("update logs bodyweight when weight changes", async () => {
    const mockRepo = createMockProfileRepo();
    const mockBW = createMockBodyweightService();
    const service = createProfileService(mockRepo as any, mockBW);

    await service.update({
      weight_kg: 72, // Different from mock's 70
      height_cm: 175,
      tdee: 2200,
      calories_intake: 2000,
      protein_target: 150,
      carbs_target: 250,
      fat_target: 65,
    });

    expect(mockBW.log).toHaveBeenCalled();
  });

  test("update does not log bodyweight when weight unchanged", async () => {
    const mockRepo = createMockProfileRepo();
    const mockBW = createMockBodyweightService();
    const service = createProfileService(mockRepo as any, mockBW);

    await service.update({
      weight_kg: 70, // Same as mock's 70
      height_cm: 175,
      tdee: 2200,
      calories_intake: 2000,
      protein_target: 150,
      carbs_target: 250,
      fat_target: 65,
    });

    expect(mockBW.log).not.toHaveBeenCalled();
  });
});
