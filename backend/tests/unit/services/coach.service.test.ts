import { test, expect, describe, mock } from "bun:test";
import { createCoachService } from "../../../src/services/coach.service";

function createDeps() {
  return {
    analyticsService: {},
    nutritionService: {},
    bodyweightService: {},
    profileService: {},
    coachPlanRepo: {
      getAll: mock(async (userId: number) => [
        {
          id: 1,
          user_id: userId,
          day_type: "Push",
          position: 1,
          exercise_name: "Bench Press",
          is_bodyweight: false,
          target_weight: 100,
          sets: 3,
          rep_low: 8,
          rep_high: 10,
          rpe_low: 8,
          rpe_high: 9,
          exercise_role: "compound",
          progression_ladder: "double_12",
          notes: "",
          updated_at: "2026-07-01",
        },
      ]),
      getByDayType: mock(async () => []),
      replaceDayType: mock(async (dayType: string, rows: any[], userId: number) =>
        rows.map((r, i) => ({ id: i + 1, ...r, day_type: dayType, user_id: userId }))
      ),
    },
    coachKnowledgeRepo: {
      list: mock(async () => []),
    },
    workoutRepo: {},
  };
}

const config = { llmProvider: "gemini", geminiApiKey: "test", deepseekApiKey: undefined } as any;

describe("coach service plan scoping", () => {
  test("getPlan reads only the requesting user's rows", async () => {
    const deps = createDeps();
    const service = createCoachService(config, deps as any);

    const plan = await service.getPlan(7);

    expect(deps.coachPlanRepo.getAll).toHaveBeenCalledWith(7);
    expect(plan.Push).toHaveLength(1);
    expect(plan.Pull).toEqual([]);
    expect(plan.Legs).toEqual([]);
  });

  test("savePlan replaces the user's day-type only", async () => {
    const deps = createDeps();
    const service = createCoachService(config, deps as any);
    const exercises = [
      {
        position: 1,
        exercise_name: "Bench Press",
        is_bodyweight: false,
        target_weight: 100,
        sets: 3,
        rep_low: 8,
        rep_high: 10,
        rpe_low: 8,
        rpe_high: 9,
        exercise_role: "compound" as const,
        progression_ladder: "double_12" as const,
        notes: "",
      },
    ];

    const rows = await service.savePlan(7, "Push", exercises);

    expect(deps.coachPlanRepo.replaceDayType).toHaveBeenCalledWith("Push", exercises, 7);
    expect(rows[0]!.user_id).toBe(7);
  });

  test("savePlan rejects unknown day-types", async () => {
    const service = createCoachService(config, createDeps() as any);

    await expect(service.savePlan(7, "Chest", [])).rejects.toThrow();
  });
});
