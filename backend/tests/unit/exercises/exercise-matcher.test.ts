import { test, expect, describe } from "bun:test";
import {
  createExerciseMatcher,
  tokenizeExerciseName,
  VECTOR_AUTO_THRESHOLD,
  VECTOR_AMBIGUOUS_THRESHOLD,
  type CanonicalExerciseRow,
  type ExerciseMatcherRepo,
} from "../../../src/exercises/exercise-matcher";

function exercise(overrides: Partial<CanonicalExerciseRow>): CanonicalExerciseRow {
  return {
    id: 1,
    provider: "repdb",
    provider_exercise_code: "test-exercise",
    version: "3",
    name_en: "Test Exercise",
    equipment: "dumbbell",
    body_part: "chest",
    primary_muscles: [],
    secondary_muscles: [],
    mechanic: "compound",
    is_unilateral: false,
    is_bodyweight: false,
    ...overrides,
  };
}

function createRepo(exercises: CanonicalExerciseRow[], aliases: Array<{ alias: string; exercise: CanonicalExerciseRow }> = []): ExerciseMatcherRepo {
  return {
    async listAliasEntries() {
      return aliases;
    },
    async listExercises() {
      return exercises;
    },
  };
}

const LAT = exercise({
  id: 10,
  provider_exercise_code: "lateral-raise",
  name_en: "Dumbbell Lateral Raise",
  equipment: "dumbbell",
  body_part: "shoulders",
  mechanic: "isolation",
});
const CABLE_LAT = exercise({
  id: 11,
  provider_exercise_code: "cable-lateral-raise",
  name_en: "Cable Lateral Raise",
  equipment: "cable",
  body_part: "shoulders",
  mechanic: "isolation",
});
const CURL = exercise({
  id: 12,
  provider_exercise_code: "bicep-curl",
  name_en: "Dumbbell Bicep Curl",
  equipment: "dumbbell",
  body_part: "upper_arms",
  mechanic: "isolation",
});

describe("tier 1 — alias exact", () => {
  test("an alias hit auto-selects with score 1, skipping lexical scoring", async () => {
    const repo = createRepo([LAT, CURL], [{ alias: "shoulder fly thing", exercise: LAT }]);
    const matcher = createExerciseMatcher(repo);

    const outcome = await matcher.match("  Shoulder Fly Thing  ");

    expect(outcome).toEqual({ tier: "auto", exercise: LAT, score: 1 });
  });

  test("alias lookup is case-insensitive", async () => {
    const repo = createRepo([LAT], [{ alias: "Dumbbell Lateral Raise", exercise: LAT }]);
    const matcher = createExerciseMatcher(repo);

    const outcome = await matcher.match("dumbbell lateral raise");

    expect(outcome).toEqual({ tier: "auto", exercise: LAT, score: 1 });
  });

  test("an empty name is a gap without touching the repo", async () => {
    const repo = createRepo([LAT]);
    const matcher = createExerciseMatcher(repo);

    expect(await matcher.match("   ")).toEqual({ tier: "gap" });
  });
});

describe("tier 2 — lexical token overlap", () => {
  test("a clear exact-ish name wins the auto tier", async () => {
    const repo = createRepo([LAT, CURL]);
    const matcher = createExerciseMatcher(repo);

    const outcome = await matcher.match("Dumbbell Lateral Raise");

    expect(outcome).toEqual({ tier: "auto", exercise: LAT, score: 1 });
  });

  test("a partial name with a unique full-coverage hit auto-selects", async () => {
    const repo = createRepo([LAT, CURL]);
    const matcher = createExerciseMatcher(repo);

    const outcome = await matcher.match("lateral raise");

    expect(outcome).toEqual({ tier: "auto", exercise: LAT, score: 1 });
  });

  test("two equal-coverage candidates below the margin are ambiguous", async () => {
    // "raise" covers both lateral raises equally → tie, no margin.
    const repo = createRepo([LAT, CABLE_LAT, CURL]);
    const matcher = createExerciseMatcher(repo);

    const outcome = await matcher.match("lateral raise");

    expect(outcome.tier).toBe("ambiguous");
    if (outcome.tier === "ambiguous") {
      expect(outcome.candidates.map((c) => c.provider_exercise_code).sort()).toEqual([
        "cable-lateral-raise",
        "lateral-raise",
      ]);
    }
  });

  test("a name that barely overlaps anything is a gap (no vector embedder configured)", async () => {
    const repo = createRepo([LAT, CURL]);
    const matcher = createExerciseMatcher(repo);

    expect(await matcher.match("zzz qqq")).toEqual({ tier: "gap" });
  });
});

describe("tier 3 — pgvector fallback", () => {
  function createVectorRepo(
    hits: Array<CanonicalExerciseRow & { similarity: number }>,
    recorded: number[][] = [],
  ): ExerciseMatcherRepo {
    return {
      async listAliasEntries() {
        return [];
      },
      async listExercises() {
        return [LAT, CURL];
      },
      async searchByEmbedding(embedding: number[]) {
        recorded.push(embedding);
        return hits;
      },
    };
  }

  const embed = async (_text: string): Promise<number[]> => [0.1, 0.2];

  test("a strong unique vector hit auto-selects on its own scale", async () => {
    const strong = { ...CURL, similarity: VECTOR_AUTO_THRESHOLD };
    const repo = createVectorRepo([strong, { ...LAT, similarity: 0.5 }]);
    const matcher = createExerciseMatcher(repo, { embed });

    const outcome = await matcher.match("biceps isolation thing");

    expect(outcome).toEqual({ tier: "auto", exercise: CURL, score: VECTOR_AUTO_THRESHOLD });
  });

  test("vector hits past the ambiguous bar but below auto+margin are ambiguous", async () => {
    const repo = createVectorRepo([
      { ...CURL, similarity: 0.8 },
      { ...LAT, similarity: 0.78 },
    ]);
    const matcher = createExerciseMatcher(repo, { embed });

    const outcome = await matcher.match("arm thing");

    expect(outcome.tier).toBe("ambiguous");
    if (outcome.tier === "ambiguous") {
      expect(outcome.candidates).toHaveLength(2);
      expect(outcome.candidates[0]!.score).toBe(0.8);
    }
  });

  test("a vector best below the ambiguous bar falls through to gap", async () => {
    const repo = createVectorRepo([{ ...CURL, similarity: VECTOR_AMBIGUOUS_THRESHOLD - 0.01 }]);
    const matcher = createExerciseMatcher(repo, { embed });

    expect(await matcher.match("unrelated noise")).toEqual({ tier: "gap" });
  });

  test("no embedder configured → lexical miss is a straight gap (no vector attempt)", async () => {
    const repo = createVectorRepo([{ ...CURL, similarity: 0.99 }]);
    const matcher = createExerciseMatcher(repo);

    expect(await matcher.match("biceps isolation thing")).toEqual({ tier: "gap" });
  });

  test("vector margin too small at auto level → ambiguous, not auto", async () => {
    const repo = createVectorRepo([
      { ...CURL, similarity: 0.9 },
      { ...LAT, similarity: 0.89 },
    ]);
    const matcher = createExerciseMatcher(repo, { embed });

    const outcome = await matcher.match("arm thing");

    expect(outcome.tier).toBe("ambiguous");
  });
});

describe("tokenizeExerciseName", () => {
  test("splits on whitespace/punctuation and lowercases latin tokens", () => {
    expect(tokenizeExerciseName("Dumbbell Lateral Raise")).toEqual([
      "dumbbell",
      "lateral",
      "raise",
    ]);
    expect(tokenizeExerciseName("Captain's Chair Leg Raise")).toEqual([
      // The apostrophe splits into a stray "s" token (shared nutrition
      // tokenizer behavior) — harmless for coverage since both sides carry it.
      "captain",
      "s",
      "chair",
      "leg",
      "raise",
    ]);
  });
});
