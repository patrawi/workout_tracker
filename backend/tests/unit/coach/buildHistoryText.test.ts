import { test, expect } from "bun:test";
import { buildHistoryText } from "../../../src/services/coach.service";

const today = "2026-06-04";

type TestWorkout = { exercise_name: string; weight: number; reps: number; rpe: number; is_bodyweight: boolean; muscle_group?: string };

function s(created_at: string | null, workouts: TestWorkout[]) {
  return {
    session_id: 1,
    created_at,
    workouts: workouts.map((w) => ({ muscle_group: "Legs", ...w })),
  };
}

function planRow(overrides: Partial<{ position: number; exercise_name: string; is_bodyweight: boolean; target_weight: number | null; sets: number; rep_low: number; rep_high: number; rpe_low: number; rpe_high: number; notes: string; id: number; day_type: string; updated_at: string | null }> = {}) {
  return {
    id: 1,
    day_type: "Legs",
    position: 1,
    exercise_name: "Squat",
    is_bodyweight: false,
    target_weight: 100,
    sets: 3,
    rep_low: 8,
    rep_high: 10,
    rpe_low: 7,
    rpe_high: 8,
    notes: "",
    updated_at: null,
    ...overrides,
  };
}

test("3 sessions present → 3 lines newest-first", () => {
  const sessions = [
    s("2026-06-01", [{ exercise_name: "Squat", weight: 100, reps: 10, rpe: 7, is_bodyweight: false }]),
    s("2026-05-28", [{ exercise_name: "Squat", weight: 100, reps: 9, rpe: 8, is_bodyweight: false }]),
    s("2026-05-21", [{ exercise_name: "Squat", weight: 95, reps: 10, rpe: 7, is_bodyweight: false }]),
  ];
  const result = buildHistoryText(sessions, [planRow({ exercise_name: "Squat", target_weight: 100 })], today);
  expect(result).toContain("3d ago: 100kg x10@7");
  expect(result).toContain("7d ago: 100kg x9@8");
  expect(result).toContain("14d ago: 95kg x10@7");
});

test("exercise missing in some sessions → only present lines shown", () => {
  const sessions = [
    s("2026-06-01", [{ exercise_name: "Squat", weight: 100, reps: 10, rpe: 7, is_bodyweight: false }]),
    s("2026-05-28", [{ exercise_name: "Leg Press", weight: 120, reps: 10, rpe: 7, is_bodyweight: false }]),
    s("2026-05-21", [{ exercise_name: "Squat", weight: 95, reps: 10, rpe: 7, is_bodyweight: false }]),
  ];
  const result = buildHistoryText(sessions, [planRow({ exercise_name: "Squat", target_weight: 100 })], today);
  expect(result).toContain("3d ago: 100kg x10@7");
  expect(result).toContain("14d ago: 95kg x10@7");
  // Should NOT contain the Leg Press line
  expect(result).not.toContain("120kg");
});

test("exercise in no session → (no recent data)", () => {
  const sessions = [
    s("2026-06-01", [{ exercise_name: "Leg Press", weight: 120, reps: 10, rpe: 7, is_bodyweight: false }]),
  ];
  const result = buildHistoryText(sessions, [planRow({ exercise_name: "Squat", target_weight: 100 })], today);
  expect(result).toContain("(no recent data)");
});

test("bodyweight exercise → BW not kg", () => {
  const sessions = [
    s("2026-06-01", [{ exercise_name: "Pull Up", weight: 0, reps: 8, rpe: 8, is_bodyweight: true }]),
  ];
  const result = buildHistoryText(
    sessions,
    [planRow({ exercise_name: "Pull Up", is_bodyweight: true, target_weight: null })],
    today,
  );
  expect(result).toContain("BW x8@8");
  expect(result).not.toContain("kg");
});

test("daysAgo: same date → today", () => {
  const sessions = [
    s("2026-06-04", [{ exercise_name: "Squat", weight: 100, reps: 10, rpe: 7, is_bodyweight: false }]),
  ];
  const result = buildHistoryText(sessions, [planRow({ exercise_name: "Squat", target_weight: 100 })], today);
  expect(result).toContain("today: 100kg x10@7");
});

test("null created_at → empty string without line prefix", () => {
  const sessions = [
    s(null, [{ exercise_name: "Squat", weight: 100, reps: 10, rpe: 7, is_bodyweight: false }]),
  ];
  const result = buildHistoryText(sessions, [planRow({ exercise_name: "Squat", target_weight: 100 })], today);
  expect(result).toContain("100kg x10@7");
});

test("multiple exercises in plan → each gets its own block", () => {
  const sessions = [
    s("2026-06-01", [
      { exercise_name: "Squat", weight: 100, reps: 10, rpe: 7, is_bodyweight: false },
      { exercise_name: "Leg Curl", weight: 45, reps: 12, rpe: 7, is_bodyweight: false },
    ]),
  ];
  const result = buildHistoryText(
    sessions,
    [
      planRow({ exercise_name: "Squat", target_weight: 100 }),
      planRow({ position: 2, exercise_name: "Leg Curl", target_weight: 45 }),
    ],
    today,
  );
  expect(result).toContain("Squat — target 100kg:");
  expect(result).toContain("Leg Curl — target 45kg:");
});
