import { test, expect, describe, mock } from "bun:test";
import { createBodyweightRepository } from "../../../src/repositories/bodyweight.repository";

function createMockDb() {
  return {
    insert: mock(() => ({
      values: mock(() => ({
        onConflictDoUpdate: mock(async () => {}),
      })),
    })),
    select: mock(() => ({
      from: mock(() => ({
        $dynamic: mock(() => ({
          where: mock(async () => []),
          orderBy: mock(async () => []),
        })),
        orderBy: mock(async () => []),
      })),
    })),
  };
}

describe("createBodyweightRepository", () => {
  test("creates repository with all methods", () => {
    const mockDb = createMockDb();
    const repo = createBodyweightRepository(mockDb as any);

    expect(typeof repo.insert).toBe("function");
    expect(typeof repo.getAll).toBe("function");
  });

  test("insert calls database insert", async () => {
    const mockDb = createMockDb();
    const repo = createBodyweightRepository(mockDb as any);

    await repo.insert("2024-01-15", 75.5);

    expect(mockDb.insert).toHaveBeenCalled();
  });
});
