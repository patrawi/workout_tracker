import { test, expect, describe, mock } from "bun:test";
import { buildCoachTools } from "../../../src/coach/tools";
import type { CoachServiceDeps } from "../../../src/services/coach.service";

function createDeps(overrides: Partial<CoachServiceDeps> = {}): CoachServiceDeps {
  return {
    analyticsService: {} as any,
    nutritionService: {} as any,
    bodyweightService: {} as any,
    profileService: {} as any,
    coachPlanRepo: {
      getAll: mock(async () => [
        { exercise_name: "Dumbbell Incline Press" },
        { exercise_name: "Leg Press Machine" },
        { exercise_name: "Dumbbell Incline Press" }, // dup across day types
      ]),
    } as any,
    coachKnowledgeRepo: {} as any,
    workoutRepo: {} as any,
    gymEquipment: {
      getGym: mock(async (gymId?: number) =>
        gymId === 7 ? { id: 7, name: "LED Gym", equipment: ["leg_press"] } : { id: 2, name: "Dcondo", equipment: ["dumbbell"] },
      ),
      listPlayedExercises: mock(async () => [
        { exercise_name: "Machine Chest Fly", canonical_exercise_id: null },
      ]),
      equipmentFor: mock(async (name: string) => {
        if (name === "Dumbbell Incline Press") return { equipment: "dumbbell", canonical_exercise_id: 42 };
        if (name === "Leg Press Machine") return { equipment: "leg_press", canonical_exercise_id: 50 };
        return undefined;
      }),
    },
    ...overrides,
  };
}

describe("lookup_gym_equipment tool (ADR 0027)", () => {
  test("summarizes the requested gym with deduped plan availability", async () => {
    const tools = buildCoachTools(createDeps(), 1);

    const raw = await tools.run("lookup_gym_equipment", { gym_id: 7 });
    const parsed = JSON.parse(raw);

    expect(parsed.gym).toEqual({ id: 7, name: "LED Gym", equipment: ["leg_press"] });
    expect(parsed.unrestricted).toBe(false);
    expect(parsed.plan_availability).toEqual([
      { exercise_name: "Dumbbell Incline Press", equipment: "dumbbell", available: false },
      { exercise_name: "Leg Press Machine", equipment: "leg_press", available: true },
    ]);
    expect(parsed.played_there).toEqual(["Machine Chest Fly"]);
  });

  test("no gym_id resolves to the last-used gym (Q14b default)", async () => {
    const deps = createDeps();
    const tools = buildCoachTools(deps, 1);

    const parsed = JSON.parse(await tools.run("lookup_gym_equipment", {}));

    expect(deps.gymEquipment.getGym).toHaveBeenCalledWith(undefined, 1);
    expect(parsed.gym.name).toBe("Dcondo");
  });
});
