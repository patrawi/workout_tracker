import { test, expect, describe, mock } from "bun:test";
import { createGymsService } from "../../../src/services/gyms.service";

function createMockRepo() {
  return {
    list: mock(async () => []),
    findByIdAndUser: mock(
      async (): Promise<{ id: number; user_id: number; name: string; created_at: null } | null> => null,
    ),
    findOrCreateByName: mock(async () => ({
      id: 3,
      user_id: 1,
      name: "Iron House",
      created_at: null,
    })),
  };
}

describe("createGymsService", () => {
  test("create trims the gym name", async () => {
    const repo = createMockRepo();
    const service = createGymsService(repo as any);

    await service.create("  Iron House  ", 1);

    expect(repo.findOrCreateByName).toHaveBeenCalledWith("Iron House", 1);
  });

  test("create rejects an empty name", () => {
    const service = createGymsService(createMockRepo() as any);

    expect(service.create("   ", 1)).rejects.toThrow("Gym name cannot be empty.");
  });

  test("resolveForSession accepts a gym owned by the user", async () => {
    const repo = createMockRepo();
    repo.findByIdAndUser = mock(async () => ({
      id: 5,
      user_id: 1,
      name: "G",
      created_at: null,
    }));
    const service = createGymsService(repo as any);

    const gymId = await service.resolveForSession(5, undefined, 1);

    expect(gymId).toBe(5);
  });

  test("resolveForSession rejects a gym owned by another user", () => {
    const service = createGymsService(createMockRepo() as any);

    expect(service.resolveForSession(5, undefined, 1)).rejects.toThrow("Unknown gym");
  });

  test("resolveForSession falls back to find-or-create by name", async () => {
    const repo = createMockRepo();
    const service = createGymsService(repo as any);

    const gymId = await service.resolveForSession(undefined, " Iron House ", 1);

    expect(repo.findOrCreateByName).toHaveBeenCalledWith(" Iron House ", 1);
    expect(gymId).toBe(3);
  });

  test("resolveForSession returns undefined when no gym reference is given", async () => {
    const service = createGymsService(createMockRepo() as any);

    expect(await service.resolveForSession(undefined, undefined, 1)).toBeUndefined();
  });
});
