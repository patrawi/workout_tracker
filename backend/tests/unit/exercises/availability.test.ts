import { test, expect, describe } from "bun:test";
import { isExerciseAvailable } from "../../../src/exercises/availability";

describe("isExerciseAvailable", () => {
  test("a gym with NO profile is unrestricted — everything available", () => {
    expect(
      isExerciseAvailable({ equipment: null }, { equipment: "dumbbell" }, false),
    ).toBe(true);
    expect(
      isExerciseAvailable({ equipment: null }, { equipment: "leg_press" }, false),
    ).toBe(true);
  });

  test("bodyweight/no-equipment exercises are available everywhere", () => {
    expect(
      isExerciseAvailable({ equipment: [] }, { equipment: null }, false),
    ).toBe(true);
  });

  test("played-there evidence makes an exercise available without a tick", () => {
    expect(
      isExerciseAvailable({ equipment: ["dumbbell"] }, { equipment: "pec_deck" }, true),
    ).toBe(true);
  });

  test("a ticked equipment type covers its exercises", () => {
    expect(
      isExerciseAvailable({ equipment: ["dumbbell", "cable"] }, { equipment: "cable" }, false),
    ).toBe(true);
  });

  test("an unticked machine's exercises are NOT available", () => {
    expect(
      isExerciseAvailable({ equipment: ["dumbbell"] }, { equipment: "leg_press" }, false),
    ).toBe(false);
  });

  test("an empty profile blocks every equipment-dependent exercise", () => {
    expect(
      isExerciseAvailable({ equipment: [] }, { equipment: "leg_press" }, false),
    ).toBe(false);
  });
});
