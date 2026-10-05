import { test, expect, describe, mock } from "bun:test";
import { createWorkoutService } from "../../../src/services/workout.service";
import type { CanonicalExerciseRow, ExerciseMatchOutcome } from "../../../src/exercises/exercise-matcher";

function createMockWorkoutRepo() {
  return {
    getRecent: mock(async () => []),
    getByDate: mock(async () => []),
    getDates: mock(async () => []),
    create: mock(async () => ({})),
    update: mock(async () => null),
    delete: mock(async () => false),
    createBatch: mock(async (_raw: string, items: any[], _createdAt: string, _activity: any, _userId: number, anchors: any[]) => items.map((item, i) => ({ id: i + 1, ...anchors[i] }))),
    getDistinctExercises: mock(async () => []),
    getByExercise: mock(async () => []),
    getRecentNotes: mock(async () => []),
  };
}

const ITEMS = [
  { exercise_name: "Dumbbell Incline Press", weight: 20, reps: 10, rpe: 7, is_bodyweight: false, is_assisted: false, pain: false, variant_details: "", notes_thai: "", notes_english: "", tags: [], muscle_group: "Chest" },
  { exercise_name: "Machine Reverse Fly", weight: 0, reps: 15, rpe: 6, is_bodyweight: false, is_assisted: false, pain: false, variant_details: "", notes_thai: "", notes_english: "", tags: [], muscle_group: "Shoulders" },
];

function fakeMatcher(responses: ExerciseMatchOutcome[]) {
  let call = 0;
  return {
    match: mock(async (_name: string): Promise<ExerciseMatchOutcome> => responses[call++] ?? { tier: "gap" }),
  };
}

const CANONICAL: CanonicalExerciseRow = {
  id: 42,
  provider: "repdb",
  provider_exercise_code: "incline-db-press",
  version: "3",
  name_en: "Incline Dumbbell Press",
  equipment: "dumbbell",
  body_part: "chest",
  primary_muscles: [],
  secondary_muscles: [],
  mechanic: "compound",
  is_unilateral: false,
  is_bodyweight: false,
};

describe("confirmSession canonical anchors (ADR 0027)", () => {
  test("auto matches anchor the workout row with tier auto", async () => {
    const repo = createMockWorkoutRepo();
    const matcher = fakeMatcher([{ tier: "auto", exercise: CANONICAL, score: 1 }, { tier: "gap" }]);
    const service = createWorkoutService(repo as any, {} as any, { exerciseMatcher: matcher as any });

    await service.confirmSession("text", ITEMS, "2026-10-05T10:00:00Z", undefined, 1);

    expect(repo.createBatch).toHaveBeenCalledWith(
      "text",
      ITEMS,
      "2026-10-05T10:00:00Z",
      undefined,
      1,
      [
        { canonical_exercise_id: 42, match_tier: "auto" },
        { canonical_exercise_id: null, match_tier: "gap" },
      ],
    );
  });

  test("ambiguous matches stay unanchored with tier ambiguous", async () => {
    const repo = createMockWorkoutRepo();
    const matcher = fakeMatcher([
      {
        tier: "ambiguous",
        candidates: [{ ...CANONICAL, score: 0.7 }, { ...CANONICAL, id: 43, score: 0.65 }],
      },
      { tier: "auto", exercise: CANONICAL, score: 1 },
    ]);
    const service = createWorkoutService(repo as any, {} as any, { exerciseMatcher: matcher as any });

    await service.confirmSession("text", ITEMS, "2026-10-05T10:00:00Z", undefined, 1);

    const anchors = (repo.createBatch as any).mock.calls[0][5];
    expect(anchors[0]).toEqual({ canonical_exercise_id: null, match_tier: "ambiguous" });
    expect(anchors[1]).toEqual({ canonical_exercise_id: 42, match_tier: "auto" });
  });

  test("a matcher failure NEVER blocks the save (null anchor, null tier)", async () => {
    const repo = createMockWorkoutRepo();
    const matcher = {
      match: mock(async () => {
        throw new Error("embedding API down");
      }),
    };
    const service = createWorkoutService(repo as any, {} as any, { exerciseMatcher: matcher as any });

    const rows = await service.confirmSession("text", ITEMS, "2026-10-05T10:00:00Z", undefined, 1);

    expect(rows).toHaveLength(2);
    const anchors = (repo.createBatch as any).mock.calls[0][5];
    expect(anchors).toEqual([
      { canonical_exercise_id: null, match_tier: null },
      { canonical_exercise_id: null, match_tier: null },
    ]);
  });

  test("without a matcher configured, anchors are null/null (legacy behavior)", async () => {
    const repo = createMockWorkoutRepo();
    const service = createWorkoutService(repo as any, {} as any);

    await service.confirmSession("text", ITEMS, "2026-10-05T10:00:00Z", undefined, 1);

    const anchors = (repo.createBatch as any).mock.calls[0][5];
    expect(anchors).toEqual([
      { canonical_exercise_id: null, match_tier: null },
      { canonical_exercise_id: null, match_tier: null },
    ]);
  });
});
