import { test, expect, describe, mock } from "bun:test";
import { createWorkoutRepository } from "../../../src/repositories/workout.repository";

function createMockDb() {
  return {
    select: mock(() => ({
      from: mock(() => ({
        orderBy: mock(() => ({
          limit: mock(async () => []),
        })),
        where: mock(() => ({
          orderBy: mock(async () => []),
        })),
        $dynamic: mock(() => ({})),
      })),
    })),
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(async () => []),
      })),
    })),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => ({
          returning: mock(async () => []),
        })),
      })),
    })),
    delete: mock(() => ({
      where: mock(() => ({
        returning: mock(async () => []),
      })),
    })),
    execute: mock(async () => []),
    transaction: mock(async (fn) => fn({
      insert: mock(() => ({
        values: mock(() => ({
          returning: mock(async () => [{ id: 1 }]),
        })),
      })),
    })),
  };
}

describe("createWorkoutRepository", () => {
  test("creates repository with all methods", () => {
    const mockDb = createMockDb();
    const repo = createWorkoutRepository(mockDb as any);

    expect(typeof repo.getRecent).toBe("function");
    expect(typeof repo.getByDate).toBe("function");
    expect(typeof repo.getDates).toBe("function");
    expect(typeof repo.create).toBe("function");
    expect(typeof repo.update).toBe("function");
    expect(typeof repo.delete).toBe("function");
    expect(typeof repo.createBatch).toBe("function");
    expect(typeof repo.getDistinctExercises).toBe("function");
    expect(typeof repo.getByExercise).toBe("function");
    expect(typeof repo.getRecentNotes).toBe("function");
  });

  test("getRecent returns empty array", async () => {
    const mockDb = createMockDb();
    const repo = createWorkoutRepository(mockDb as any);

    const result = await repo.getRecent(10);
    expect(result).toEqual([]);
  });

  test("getDates returns empty array", async () => {
    const mockDb = createMockDb();
    const repo = createWorkoutRepository(mockDb as any);

    const result = await repo.getDates();
    expect(result).toEqual([]);
  });
});
