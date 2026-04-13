import { test, expect, describe } from "bun:test";
import { normalizeWorkoutItem } from "../../../src/ai/normalizers";

describe("normalizeWorkoutItem", () => {
  test("applies defaults to empty object", () => {
    const result = normalizeWorkoutItem({});

    expect(result.exercise_name).toBe("Unknown Exercise");
    expect(result.weight).toBe(0);
    expect(result.reps).toBe(0);
    expect(result.rpe).toBe(0);
    expect(result.is_bodyweight).toBe(false);
    expect(result.is_assisted).toBe(false);
    expect(result.variant_details).toBe("");
    expect(result.notes_thai).toBe("");
    expect(result.notes_english).toBe("");
    expect(result.tags).toEqual([]);
    expect(result.muscle_group).toBe("Other");
  });

  test("preserves provided values", () => {
    const result = normalizeWorkoutItem({
      exercise_name: "Bench Press",
      weight: 80,
      reps: 10,
      rpe: 8,
      muscle_group: "Chest",
      tags: ["compound", "push"],
    });

    expect(result.exercise_name).toBe("Bench Press");
    expect(result.weight).toBe(80);
    expect(result.reps).toBe(10);
    expect(result.rpe).toBe(8);
    expect(result.muscle_group).toBe("Chest");
    expect(result.tags).toEqual(["compound", "push"]);
  });

  test("handles string to number conversion", () => {
    const result = normalizeWorkoutItem({
      exercise_name: "Squat",
      weight: "100",
      reps: "5",
    });

    expect(result.weight).toBe(100);
    expect(result.reps).toBe(5);
  });

  test("handles boolean conversion", () => {
    const result = normalizeWorkoutItem({
      exercise_name: "Pull-Up",
      is_bodyweight: true,
      is_assisted: "true",
    });

    expect(result.is_bodyweight).toBe(true);
    expect(result.is_assisted).toBe(true);
  });
});
