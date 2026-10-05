import { test, expect, describe } from "bun:test";
import {
  LOGGED_NAME_ALIASES,
  UNMAPPED_LOGGED_NAMES,
  aliasForLoggedName,
} from "../../../src/exercises/logged-name-mapping";
import { MANUAL_PROVIDER, REPDB_PROVIDER } from "../../../src/exercises/repdb-import";

// The distinct workouts.exercise_name spellings observed in the owner's DB on
// 2026-10-05 (with log counts, for provenance). The backfill script resolves
// each of these onto a canonical exercise and writes an alias row per name.
const OBSERVED_LOGGED_NAMES = [
  "Dumbbell Incline Press", // 55
  "Dip", // 36
  "Shoulder Press Machine", // 36
  "Dumbbell Lateral Raise", // 35
  "Tricep Extension Machine", // 30
  "Dumbbell Goblet Squat", // 18
  "Assisted Pull Up", // 17
  "Dumbbell Bicep Curl", // 16
  "One Arm Dumbbell Row", // 16
  "Lat Pulldown Machine", // 15
  "Leg Curl Machine", // 15
  "Leg Extension Machine", // 15
  "Pectoral Fly Machine", // 15
  "Machine Reverse Fly", // 15
  "Elbow Pectoral Fly Machine", // 15
  "Leg Press Machine", // 15
  "Vertical Leg Raise", // 12
  "Dumbbell Hammer Curl", // 12
  "Hip Abduction Machine", // 12
  "Romanian Deadlift", // 9
  "Dumbbell Overhead Tricep Extension", // 9
  "Abs Crunch Machine", // 6
  "Dumbbell Romanian Deadlift", // 6
  "Elbow Pectoral fly machine", // 3 (case variant)
  "Leg Raise", // 3
  "Elbow Fly Pectoral Machine", // 3 (variant)
  "Bench Press", // 2
  "Lateral Raise", // 1
] as const;

describe("LOGGED_NAME_ALIASES", () => {
  test("covers every observed logged name except the deliberately unmapped ones", () => {
    const aliases = new Set(LOGGED_NAME_ALIASES.map((a) => a.alias));
    const missing = OBSERVED_LOGGED_NAMES.filter((name) => !aliases.has(name));
    expect(missing).toEqual([]);
  });

  test("has no duplicate aliases", () => {
    const aliases = LOGGED_NAME_ALIASES.map((a) => a.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  test("every row points at a repdb or manual code", () => {
    for (const row of LOGGED_NAME_ALIASES) {
      expect([REPDB_PROVIDER, MANUAL_PROVIDER]).toContain(row.provider);
      expect(row.provider_exercise_code.trim()).not.toBe("");
    }
  });
});

describe("aliasForLoggedName", () => {
  test("resolves exact logged names to their canonical codes", () => {
    expect(aliasForLoggedName("Dumbbell Incline Press")).toEqual({
      alias: "Dumbbell Incline Press",
      provider: REPDB_PROVIDER,
      provider_exercise_code: "incline-db-press",
    });
    expect(aliasForLoggedName("Machine Reverse Fly")).toEqual({
      alias: "Machine Reverse Fly",
      provider: MANUAL_PROVIDER,
      provider_exercise_code: "machine-reverse-fly",
    });
    expect(aliasForLoggedName("Dumbbell Goblet Squat")).toEqual({
      alias: "Dumbbell Goblet Squat",
      provider: MANUAL_PROVIDER,
      provider_exercise_code: "dumbbell-goblet-squat",
    });
  });

  test("resolves every case spelling of the pectoral fly machine onto pec-deck", () => {
    for (const spelling of ["Elbow Pectoral Fly Machine", "Elbow Pectoral fly machine", "Elbow Fly Pectoral Machine"]) {
      expect(aliasForLoggedName(spelling)?.provider_exercise_code).toBe("pec-deck");
    }
  });

  test("is case-insensitive so future spelling drift still resolves", () => {
    expect(aliasForLoggedName("dumbbell incline press")?.provider_exercise_code).toBe(
      "incline-db-press",
    );
  });

  test("returns undefined for names with no confident mapping", () => {
    expect(aliasForLoggedName("Test Item")).toBeUndefined();
    expect(aliasForLoggedName("Some Brand New Exercise")).toBeUndefined();
  });
});

describe("UNMAPPED_LOGGED_NAMES", () => {
  test("documents the names the backfill intentionally leaves alone", () => {
    expect(UNMAPPED_LOGGED_NAMES).toContain("Test Item");
  });
});
