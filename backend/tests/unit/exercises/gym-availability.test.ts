import { test, expect, describe, mock } from "bun:test";
import { summarizeGymAvailability, type GymAvailabilityDeps } from "../../../src/exercises/gym-availability";

function createDeps(overrides: Partial<GymAvailabilityDeps> = {}): GymAvailabilityDeps {
  return {
    getGym: mock(async (gymId?: number) =>
      gymId === undefined
        ? { id: 2, name: "Dcondo", equipment: ["dumbbell", "cable"] }
        : gymId === 1
          ? { id: 1, name: "LED Gym", equipment: ["leg_press", "leg_curl", "leg_extension"] }
          : null,
    ),
    listPlayedExercises: mock(async () => [
      { exercise_name: "Machine Chest Fly", canonical_exercise_id: 77 },
      { exercise_name: "Lat Pulldown Machine", canonical_exercise_id: 90 },
    ]),
    equipmentFor: mock(async (name: string) => {
      if (name === "Dumbbell Incline Press") return { equipment: "dumbbell", canonical_exercise_id: 42 };
      if (name === "Leg Press Machine") return { equipment: "leg_press", canonical_exercise_id: 50 };
      if (name === "Machine Chest Fly") return { equipment: "pec_deck", canonical_exercise_id: 77 };
      if (name === "Pectoral Fly Machine") return { equipment: "chest_fly_machine", canonical_exercise_id: 78 };
      if (name === "Lat Pulldown") return { equipment: "cable", canonical_exercise_id: 90 };
      if (name === "Crunches") return { equipment: null };
      return undefined;
    }),
    ...overrides,
  };
}

describe("summarizeGymAvailability (coach lookup_gym_equipment engine)", () => {
  test("assesses plan exercises against the requested gym's ticks", async () => {
    const summary = await summarizeGymAvailability(createDeps(), {
      gymId: 1,
      userId: 1,
      planNames: ["Leg Press Machine", "Dumbbell Incline Press"],
    });

    expect(summary.gym).toEqual({ id: 1, name: "LED Gym", equipment: ["leg_press", "leg_curl", "leg_extension"] });
    expect(summary.unrestricted).toBe(false);
    expect(summary.plan_availability).toEqual([
      { exercise_name: "Leg Press Machine", equipment: "leg_press", available: true },
      { exercise_name: "Dumbbell Incline Press", equipment: "dumbbell", available: false },
    ]);
  });

  test("no gymId falls back to the most recently used gym", async () => {
    const getGym = mock(async (gymId?: number) =>
      gymId === undefined ? { id: 2, name: "Dcondo", equipment: null } : null,
    );
    const summary = await summarizeGymAvailability(createDeps({ getGym }), {
      userId: 1,
      planNames: ["Dumbbell Incline Press"],
    });

    expect(summary.gym?.name).toBe("Dcondo");
    expect(summary.unrestricted).toBe(true);
    expect(summary.plan_availability[0]).toEqual({
      exercise_name: "Dumbbell Incline Press",
      equipment: "dumbbell",
      available: true,
    });
  });

  test("played-there evidence overrides a missing tick", async () => {
    const summary = await summarizeGymAvailability(createDeps(), {
      gymId: 1,
      userId: 1,
      planNames: ["Machine Chest Fly"], // pec_deck, NOT ticked at gym 1 but played there
    });

    expect(summary.played_there).toEqual(["Machine Chest Fly", "Lat Pulldown Machine"]);
    expect(summary.plan_availability[0]!.available).toBe(true);
  });

  test("played evidence matches on canonical identity, not raw spelling", async () => {
    const summary = await summarizeGymAvailability(createDeps(), {
      gymId: 1,
      userId: 1,
      planNames: [
        "Lat Pulldown", // logged as "Lat Pulldown Machine" — same canonical 90, not ticked
        "Pectoral Fly Machine", // canonical 78 — DIFFERENT from played canonical 77
      ],
    });

    // Same canonical exercise under a different spelling → played evidence holds.
    expect(summary.plan_availability[0]!.available).toBe(true);
    // A different canonical row sharing nothing with the log → no evidence.
    expect(summary.plan_availability[1]!.available).toBe(false);
  });

  test("an unmatched plan name reports available: unknown (catalog gap, never a false no)", async () => {
    const summary = await summarizeGymAvailability(createDeps(), {
      gymId: 1,
      userId: 1,
      planNames: ["Converging Machine Press"],
    });

    expect(summary.plan_availability[0]).toEqual({
      exercise_name: "Converging Machine Press",
      equipment: null,
      available: "unknown",
    });
  });

  test("no gyms at all → gym null and everything unrestricted", async () => {
    const summary = await summarizeGymAvailability(
      createDeps({ getGym: mock(async () => null) }),
      { userId: 1, planNames: ["Leg Press Machine"] },
    );

    expect(summary.gym).toBeNull();
    expect(summary.unrestricted).toBe(true);
  });
});
