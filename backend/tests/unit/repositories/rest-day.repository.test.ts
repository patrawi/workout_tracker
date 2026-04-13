import { test, expect, describe, mock } from "bun:test";
import { createRestDayRepository } from "../../../src/repositories/rest-day.repository";

function createMockDb() {
  return {
    insert: mock(() => ({
      values: mock(() => ({
        onConflictDoUpdate: mock(() => ({
          returning: mock(async () => []),
        })),
      })),
    })),
    delete: mock(() => ({
      where: mock(() => ({
        returning: mock(async () => []),
      })),
    })),
  };
}

describe("createRestDayRepository", () => {
  test("creates repository with all methods", () => {
    const mockDb = createMockDb();
    const repo = createRestDayRepository(mockDb as any);

    expect(typeof repo.upsert).toBe("function");
    expect(typeof repo.delete).toBe("function");
  });
});
