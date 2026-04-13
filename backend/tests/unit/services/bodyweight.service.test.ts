import { test, expect, describe, mock } from "bun:test";
import { createBodyweightService } from "../../../src/services/bodyweight.service";

function createMockBodyweightRepo() {
  return {
    insert: mock(async (date: string, weight: number) => {}),
    getAll: mock(async (daysBack: number) => []),
  };
}

describe("createBodyweightService", () => {
  test("creates service with all methods", () => {
    const mockRepo = createMockBodyweightRepo();
    const service = createBodyweightService(mockRepo as any);

    expect(typeof service.log).toBe("function");
    expect(typeof service.getLogs).toBe("function");
  });

  test("log calls repo.insert", async () => {
    const mockRepo = createMockBodyweightRepo();
    const service = createBodyweightService(mockRepo as any);

    await service.log("2024-01-15", 75.5);

    expect(mockRepo.insert).toHaveBeenCalledWith("2024-01-15", 75.5);
  });
});
