import { test, expect, describe } from "bun:test";
import {
  REPDB_PROVIDER,
  MANUAL_PROVIDER,
  MANUAL_EXERCISES,
  mapRepdbRecord,
  parseRepdbDataset,
  repdbEmbedText,
  type RepdbExerciseRow,
} from "../../../src/exercises/repdb-import";

// Fixtures shaped exactly like RepDB exercises.json records (real values).
const MACHINE_RECORD = {
  id: "ab-wheel-rollout",
  name_en: "Ab Wheel Rollout",
  name_de: "Bauchroller",
  description_en: "A core exercise rolling a wheel forward and back.",
  category: "strength",
  force_type: "pull",
  mechanic: "compound",
  difficulty: "intermediate",
  equipment: "ab_wheel",
  body_part: "core",
  primary_muscles: ["rectus_abdominis", "transverse_abdominis"],
  secondary_muscles: ["anterior_deltoid", "latissimus_dorsi"],
  goals: ["hypertrophy", "strength"],
  tags: ["core_focus"],
  is_unilateral: false,
  is_bodyweight: false,
  met: 6.0,
  images: { flat: { start: "images/flat/x-start.webp", peak: "images/flat/x-peak.webp" } },
};

const BODYWEIGHT_RECORD = {
  id: "archer-push-ups",
  name_en: "Archer Push Ups",
  category: "strength",
  mechanic: "compound",
  equipment: null,
  body_part: "chest",
  primary_muscles: ["pectoralis_major"],
  secondary_muscles: [],
  is_unilateral: false,
  is_bodyweight: true,
};

describe("mapRepdbRecord", () => {
  test("maps a machine record onto the lean catalog row", () => {
    const { row, stats } = mapRepdbRecord(MACHINE_RECORD, "3");

    expect(stats.skipped).toBe(false);
    expect(row).toEqual({
      provider: REPDB_PROVIDER,
      provider_exercise_code: "ab-wheel-rollout",
      version: "3",
      name_en: "Ab Wheel Rollout",
      equipment: "ab_wheel",
      body_part: "core",
      primary_muscles: ["rectus_abdominis", "transverse_abdominis"],
      secondary_muscles: ["anterior_deltoid", "latissimus_dorsi"],
      mechanic: "compound",
      is_unilateral: false,
      is_bodyweight: false,
      embedding: null,
    } satisfies RepdbExerciseRow);
  });

  test("keeps equipment null for bodyweight records", () => {
    const { row, stats } = mapRepdbRecord(BODYWEIGHT_RECORD, "3");

    expect(stats.skipped).toBe(false);
    expect(row!.equipment).toBeNull();
    expect(row!.is_bodyweight).toBe(true);
  });

  test("ignores fields the catalog does not keep", () => {
    // name_de/description/goals/tags/met/images etc. must not leak into the row.
    const { row } = mapRepdbRecord(MACHINE_RECORD, "3");
    expect(Object.keys(row!)).not.toContain("name_de");
    expect(Object.keys(row!)).not.toContain("met");
    expect(Object.keys(row!)).not.toContain("images");
  });

  test("skips a record without an id", () => {
    const { row, stats } = mapRepdbRecord({ ...MACHINE_RECORD, id: "  " }, "3");

    expect(row).toBeNull();
    expect(stats.skipped).toBe(true);
  });

  test("normalizes missing optional strings to null", () => {
    const { row } = mapRepdbRecord(
      { ...BODYWEIGHT_RECORD, mechanic: undefined, body_part: undefined },
      "3",
    );

    expect(row!.mechanic).toBeNull();
    expect(row!.body_part).toBeNull();
  });
});

describe("parseRepdbDataset", () => {
  const datasetText = JSON.stringify({
    count: 2,
    schema_version: 3,
    exercises: [MACHINE_RECORD, BODYWEIGHT_RECORD],
  });

  test("parses all records with the dataset schema_version as the snapshot label", () => {
    const { rows, stats } = parseRepdbDataset(datasetText);

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.version === "3")).toBe(true);
    expect(stats.totalRows).toBe(2);
    expect(stats.skippedRows).toBe(0);
  });

  test("counts skipped records but keeps going", () => {
    const text = JSON.stringify({
      schema_version: 3,
      exercises: [MACHINE_RECORD, { ...BODYWEIGHT_RECORD, id: "" }],
    });
    const { rows, stats } = parseRepdbDataset(text);

    expect(rows).toHaveLength(1);
    expect(stats.skippedRows).toBe(1);
  });

  test("an explicit version overrides the dataset schema_version (re-import pinning)", () => {
    const { rows } = parseRepdbDataset(datasetText, "2026-10-05");

    expect(rows.every((r) => r.version === "2026-10-05")).toBe(true);
  });

  test("throws on schema drift (no exercises array)", () => {
    expect(() => parseRepdbDataset(JSON.stringify({ count: 0 }))).toThrow(/exercises/);
  });

  test("throws on schema drift (missing schema_version)", () => {
    expect(() => parseRepdbDataset(JSON.stringify({ exercises: [] }))).toThrow(/schema_version/);
  });

  test("throws on non-JSON input", () => {
    expect(() => parseRepdbDataset("not json")).toThrow();
  });
});

describe("repdbEmbedText", () => {
  test("is the English name only (no Thai, no provider noise)", () => {
    expect(repdbEmbedText({ name_en: "Ab Wheel Rollout" })).toBe("Ab Wheel Rollout");
  });

  test("falls back to empty string when the name is missing", () => {
    expect(repdbEmbedText({ name_en: null })).toBe("");
  });
});

describe("MANUAL_EXERCISES", () => {
  test("covers exactly the two logged exercises RepDB lacks or mis-tags", () => {
    const codes = MANUAL_EXERCISES.map((r) => r.provider_exercise_code).sort();
    expect(codes).toEqual(["dumbbell-goblet-squat", "machine-reverse-fly"]);
    expect(MANUAL_EXERCISES.every((r) => r.provider === MANUAL_PROVIDER)).toBe(true);
  });

  test("Machine Reverse Fly rides a pec-deck-family machine", () => {
    const row = MANUAL_EXERCISES.find((r) => r.provider_exercise_code === "machine-reverse-fly")!;
    expect(row.equipment).toBe("pec_deck");
    expect(row.primary_muscles).toContain("posterior_deltoid");
    expect(row.mechanic).toBe("isolation");
  });

  test("Dumbbell Goblet Squat is dumbbell-tagged (RepDB tags goblet squat kettlebell)", () => {
    const row = MANUAL_EXERCISES.find((r) => r.provider_exercise_code === "dumbbell-goblet-squat")!;
    expect(row.equipment).toBe("dumbbell");
    expect(row.mechanic).toBe("compound");
  });
});
