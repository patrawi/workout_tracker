import { test, expect, describe } from "bun:test";
import {
  withWorkoutDefaults,
  defaultNumber,
  defaultString,
  defaultBoolean,
  defaultArray,
} from "../../../src/lib/defaults";

describe("withWorkoutDefaults", () => {
  test("applies all defaults to empty object", () => {
    const result = withWorkoutDefaults({});

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
    const result = withWorkoutDefaults({
      exercise_name: "Bench Press",
      weight: 80,
      reps: 10,
      muscle_group: "Chest",
      tags: ["compound"],
    });

    expect(result.exercise_name).toBe("Bench Press");
    expect(result.weight).toBe(80);
    expect(result.reps).toBe(10);
    expect(result.muscle_group).toBe("Chest");
    expect(result.tags).toEqual(["compound"]);
    // Unprovided values get defaults
    expect(result.rpe).toBe(0);
    expect(result.is_bodyweight).toBe(false);
  });

  test("uses empty string for exercise_name when falsy", () => {
    const result = withWorkoutDefaults({ exercise_name: "" });
    expect(result.exercise_name).toBe("Unknown Exercise");
  });
});

describe("generic default helpers", () => {
  test("defaultNumber returns value or 0", () => {
    expect(defaultNumber(42)).toBe(42);
    expect(defaultNumber(undefined)).toBe(0);
    expect(defaultNumber(null)).toBe(0);
  });

  test("defaultString returns value or empty string", () => {
    expect(defaultString("hello")).toBe("hello");
    expect(defaultString(undefined)).toBe("");
    expect(defaultString(null)).toBe("");
  });

  test("defaultBoolean returns value or false", () => {
    expect(defaultBoolean(true)).toBe(true);
    expect(defaultBoolean(false)).toBe(false);
    expect(defaultBoolean(undefined)).toBe(false);
  });

  test("defaultArray returns value or empty array", () => {
    expect(defaultArray([1, 2, 3])).toEqual([1, 2, 3]);
    expect(defaultArray(undefined)).toEqual([]);
    expect(defaultArray(null)).toEqual([]);
  });
});
