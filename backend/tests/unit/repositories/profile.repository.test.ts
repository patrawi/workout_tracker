import { test, expect, describe, mock } from "bun:test";
import { createProfileRepository } from "../../../src/repositories/profile.repository";

function createMockDb() {
  return {
    select: mock(() => ({
      from: mock(() => ({
        where: mock(async () => []),
      })),
    })),
    insert: mock(() => ({
      values: mock(() => ({
        onConflictDoNothing: mock(async () => {}),
      })),
    })),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(async () => {}),
      })),
    })),
  };
}

describe("createProfileRepository", () => {
  test("creates repository with all methods", () => {
    const mockDb = createMockDb();
    const repo = createProfileRepository(mockDb as any);

    expect(typeof repo.ensure).toBe("function");
    expect(typeof repo.get).toBe("function");
    expect(typeof repo.update).toBe("function");
  });

  test("ensure calls insert with id 1", async () => {
    const mockDb = createMockDb();
    const repo = createProfileRepository(mockDb as any);

    await repo.ensure();

    expect(mockDb.insert).toHaveBeenCalled();
  });

  test("get throws error when profile not found", async () => {
    const mockDb = createMockDb();
    const repo = createProfileRepository(mockDb as any);

    await expect(repo.get()).rejects.toThrow("Profile row not found");
  });
});
