import { test, expect, describe, mock } from "bun:test";
import { createGymsService } from "../../../src/services/gyms.service";
import type { GymRow } from "../../../src/repositories/gyms.repository";

function createMockRepo(equipment: string[] | null = null) {
  return {
    list: mock(async () => []),
    findByIdAndUser: mock(async (): Promise<GymRow | null> => null),
    findOrCreateByName: mock(async () => ({ id: 3, user_id: 1, name: "G", created_at: null, equipment: null })),
    setEquipmentProfile: mock(
      async (_id: number, _userId: number, next: string[] | null) => ({
        id: 5,
        user_id: 1,
        name: "G",
        equipment: next,
        created_at: null,
      }),
    ),
  };
}

describe("gyms equipment profile (ADR 0027)", () => {
  test("set trims, drops empties, and dedupes the tick list", async () => {
    const repo = createMockRepo();
    repo.findByIdAndUser = mock(async () => ({ id: 5, user_id: 1, name: "G", created_at: null, equipment: null }));
    const service = createGymsService(repo as any);

    await service.setEquipmentProfile(5, 1, [" dumbbell ", "", "cable", "dumbbell"]);

    expect(repo.setEquipmentProfile).toHaveBeenCalledWith(5, 1, ["dumbbell", "cable"]);
  });

  test("set null clears the profile (gym becomes unrestricted)", async () => {
    const repo = createMockRepo(["dumbbell"]);
    repo.findByIdAndUser = mock(async () => ({ id: 5, user_id: 1, name: "G", created_at: null, equipment: ["dumbbell"] }));
    const service = createGymsService(repo as any);

    await service.setEquipmentProfile(5, 1, null);

    expect(repo.setEquipmentProfile).toHaveBeenCalledWith(5, 1, null);
  });

  test("an empty array is a valid profile (nothing ticked)", async () => {
    const repo = createMockRepo();
    repo.findByIdAndUser = mock(async () => ({ id: 5, user_id: 1, name: "G", created_at: null, equipment: null }));
    const service = createGymsService(repo as any);

    await service.setEquipmentProfile(5, 1, []);

    expect(repo.setEquipmentProfile).toHaveBeenCalledWith(5, 1, []);
  });

  test("set on an unknown gym (or another user's gym) rejects", async () => {
    const service = createGymsService(createMockRepo() as any);

    expect(service.setEquipmentProfile(99, 1, ["dumbbell"])).rejects.toThrow("Unknown gym");
  });

  test("set rejects a non-array body and non-string entries", async () => {
    const repo = createMockRepo();
    repo.findByIdAndUser = mock(async () => ({ id: 5, user_id: 1, name: "G", created_at: null, equipment: null }));
    const service = createGymsService(repo as any);

    expect(service.setEquipmentProfile(5, 1, "dumbbell" as any)).rejects.toThrow("equipment must be");
    expect(service.setEquipmentProfile(5, 1, [1, 2] as any)).rejects.toThrow("equipment must be");
  });
});
