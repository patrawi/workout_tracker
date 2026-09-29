import { describe, expect, mock, test } from "bun:test";
import {
  AMBIGUOUS_SCORE_THRESHOLD,
  AUTO_MARGIN_THRESHOLD,
  AUTO_SCORE_THRESHOLD,
  createReferenceMatcher,
  scoreReference,
  tokenizeName,
  VECTOR_AMBIGUOUS_THRESHOLD,
  VECTOR_AUTO_THRESHOLD,
  VECTOR_MARGIN_THRESHOLD,
  type ReferenceMatcherRepo,
  type ReferenceRow,
} from "../../../src/nutrition-estimation/matching/matcher";

function row(overrides: Partial<ReferenceRow> & { id: number }): ReferenceRow {
  return {
    provider: "thaifcd",
    providerFoodCode: `F${overrides.id}`,
    version: "2024.1",
    nameEn: null,
    nameTh: null,
    per100: { protein: 10, carbs: 20, fat: 5, alcohol: 0, calories: 200 },
    ...overrides,
  };
}

function makeRepo(
  pool: ReferenceRow[],
  searchByEmbedding?: ReferenceMatcherRepo["searchByEmbedding"],
): ReferenceMatcherRepo {
  return {
    listReferences: mock(async () => pool),
    findByFoodCode: mock(async (code: string) =>
      pool.find(
        (r) => r.providerFoodCode.trim().toLowerCase() === code.trim().toLowerCase(),
      ) ?? null,
    ),
    ...(searchByEmbedding ? { searchByEmbedding } : {}),
  };
}

describe("tokenizeName", () => {
  test("splits on whitespace and punctuation, lowercases latin, keeps Thai whole", () => {
    expect(tokenizeName("Khao Moo Daeng (ข้าวหมูแดง)")).toEqual([
      "khao",
      "moo",
      "daeng",
      "ข้าวหมูแดง",
    ]);
  });
});

describe("scoreReference", () => {
  test("exact token overlap scores 1, partial scores fraction, none scores 0", () => {
    const ref = row({ id: 1, nameEn: "Khao Moo Daeng", nameTh: "ข้าวหมูแดง" });
    expect(scoreReference("khao moo daeng", ref)).toBe(1);
    expect(scoreReference("khao moo gaeng", ref)).toBeCloseTo(2 / 3);
    expect(scoreReference("pad kaprao", ref)).toBe(0);
  });

  test("matches against either Thai or English name", () => {
    const ref = row({ id: 1, nameEn: "Fried Rice", nameTh: "ข้าวผัด" });
    expect(scoreReference("ข้าวผัด", ref)).toBe(1);
    expect(scoreReference("fried rice", ref)).toBe(1);
  });
});

describe("matchReference — food-code lookup tier (spec §7)", () => {
  const pool = [
    row({ id: 1, providerFoodCode: "TFC-001", nameEn: "Khao Moo Daeng" }),
    row({ id: 2, providerFoodCode: "TFC-002", nameEn: "Khao Man Gai" }),
  ];

  test("menu name that is exactly a food code → auto immediately, skipping lexical scoring", async () => {
    const repo = makeRepo(pool);
    const listReferences = repo.listReferences;
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("  tfc-002  ");
    expect(outcome.tier).toBe("auto");
    if (outcome.tier === "auto") {
      expect(outcome.reference.id).toBe(2);
      expect(outcome.score).toBe(1);
    }
    // Tier-0 short-circuit: the lexical pool was never consulted.
    expect(listReferences).not.toHaveBeenCalled();
  });

  test("food-code lookup is case-insensitive", async () => {
    const repo = makeRepo(pool);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("tfc-001");
    expect(outcome.tier).toBe("auto");
    if (outcome.tier === "auto") expect(outcome.reference.id).toBe(1);
  });

  test("a name that is not a food code falls through to lexical matching", async () => {
    const repo = makeRepo(pool);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("khao man gai");
    expect(outcome.tier).toBe("auto");
    if (outcome.tier === "auto") {
      expect(outcome.reference.id).toBe(2);
      expect(outcome.score).toBeCloseTo(1);
    }
  });
});

describe("matchReference — tiers", () => {
  test("dominant match auto-selects (top ≥ 0.82 and margin ≥ 0.08)", async () => {
    const repo = makeRepo([
      row({ id: 1, nameEn: "Khao Moo Daeng" }),
      row({ id: 2, nameEn: "Khao Man Gai" }),
      row({ id: 3, nameEn: "Pad Thai" }),
    ]);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("khao moo daeng");
    expect(outcome.tier).toBe("auto");
    if (outcome.tier === "auto") {
      expect(outcome.reference.id).toBe(1);
      expect(outcome.score).toBeCloseTo(1);
    }
  });

  test("top score above threshold but margin too small → ambiguous with top 3 sorted desc", async () => {
    const repo = makeRepo([
      row({ id: 1, nameEn: "Fried Rice" }),
      row({ id: 2, nameEn: "Fried Rice Noodle Soup" }),
      row({ id: 3, nameEn: "Fried Rice Omelette" }),
      row({ id: 4, nameEn: "Green Curry" }),
    ]);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("fried rice");
    expect(outcome.tier).toBe("ambiguous");
    if (outcome.tier === "ambiguous") {
      expect(outcome.candidates).toHaveLength(3);
      const scores = outcome.candidates.map((c) => c.score);
      expect(scores[0]).toBeCloseTo(1);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]! + 1e-9);
      }
    }
  });

  test("top score below the ambiguous threshold → gap", async () => {
    const repo = makeRepo([
      row({ id: 1, nameEn: "Som Tam" }),
      row({ id: 2, nameEn: "Tom Yum Goong" }),
    ]);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("massaman beef curry");
    expect(outcome.tier).toBe("gap");
  });

  test("empty candidate pool → gap (never fabricate a reference)", async () => {
    const repo = makeRepo([]);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("khao moo daeng");
    expect(outcome.tier).toBe("gap");
  });

  test("thresholds are the provisional constants", () => {
    expect(AUTO_SCORE_THRESHOLD).toBe(0.82);
    expect(AUTO_MARGIN_THRESHOLD).toBe(0.08);
    expect(AMBIGUOUS_SCORE_THRESHOLD).toBe(0.6);
  });
});

describe("matchReference — vector fallback on its own scale (ADR 0014, rescaled 2026-09-29)", () => {
  const pool = [
    row({ id: 1, nameEn: "Moo Ping" }),
    row({ id: 2, nameEn: "Grilled Chicken" }),
  ];

  test("dominant vector hit auto-selects at similarity ≥ 0.85 with margin over the runner-up", async () => {
    const searchByEmbedding = mock(async () => [
      { ...row({ id: 2, nameEn: "Grilled Chicken" }), similarity: 0.889 },
      { ...row({ id: 1, nameEn: "Moo Ping" }), similarity: 0.843 },
    ]);
    const repo = makeRepo(pool, searchByEmbedding);
    const embed = mock(async (text: string) => [0.1, 0.2, text.length]);
    const matcher = createReferenceMatcher(repo, { embed });
    // Lexical scores 0 for both rows — the vector path decides.
    const outcome = await matcher.matchReference("ต้มยำกุ้ง");
    expect(searchByEmbedding).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith("ต้มยำกุ้ง");
    expect(outcome.tier).toBe("auto");
    if (outcome.tier === "auto") {
      expect(outcome.reference.id).toBe(2);
      expect(outcome.score).toBeCloseTo(0.889);
    }
  });

  test("vector hit between 0.70 and 0.85 → ambiguous candidate carrying its similarity", async () => {
    const searchByEmbedding = mock(async () => [
      { ...row({ id: 2, nameEn: "Grilled Chicken" }), similarity: 0.813 },
    ]);
    const repo = makeRepo(pool, searchByEmbedding);
    const matcher = createReferenceMatcher(repo, { embed: async () => [1] });
    const outcome = await matcher.matchReference("ไข่ดาว");
    expect(outcome.tier).toBe("ambiguous");
    if (outcome.tier === "ambiguous") {
      expect(outcome.candidates[0]!.id).toBe(2);
      expect(outcome.candidates[0]!.score).toBeCloseTo(0.813);
    }
  });

  test("vector best below 0.70 → falls through to the lexical conclusion (gap)", async () => {
    const searchByEmbedding = mock(async () => [
      { ...row({ id: 2, nameEn: "Grilled Chicken" }), similarity: 0.6 },
    ]);
    const repo = makeRepo(pool, searchByEmbedding);
    const matcher = createReferenceMatcher(repo, { embed: async () => [1] });
    const outcome = await matcher.matchReference("something unrelated");
    expect(outcome.tier).toBe("gap");
  });

  test("vector auto blocked when the runner-up trails by less than 0.03 → ambiguous", async () => {
    const searchByEmbedding = mock(async () => [
      { ...row({ id: 2, nameEn: "Grilled Chicken" }), similarity: 0.889 },
      { ...row({ id: 1, nameEn: "Moo Ping" }), similarity: 0.88 },
    ]);
    const repo = makeRepo(pool, searchByEmbedding);
    const matcher = createReferenceMatcher(repo, { embed: async () => [1] });
    const outcome = await matcher.matchReference("ต้มยำกุ้ง");
    expect(outcome.tier).toBe("ambiguous");
  });

  test("vector fallback NOT engaged when lexical best ≥ auto threshold", async () => {
    const searchByEmbedding = mock(async () => []);
    const repo = makeRepo(pool, searchByEmbedding);
    const matcher = createReferenceMatcher(repo, { embed: async () => [1] });
    const outcome = await matcher.matchReference("moo ping");
    expect(searchByEmbedding).not.toHaveBeenCalled();
    expect(outcome.tier).toBe("auto");
  });

  test("repo with searchByEmbedding but no embedder → lexical only", async () => {
    const searchByEmbedding = mock(async () => [
      { ...row({ id: 1, nameEn: "Moo Ping" }), similarity: 1 },
    ]);
    const repo = makeRepo(pool, searchByEmbedding);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("grilled pork");
    expect(searchByEmbedding).not.toHaveBeenCalled();
    expect(outcome.tier).toBe("gap"); // lexical best 0.5 < 0.60
  });

  test("vector thresholds are the provisional calibrated constants", () => {
    expect(VECTOR_AUTO_THRESHOLD).toBe(0.85);
    expect(VECTOR_MARGIN_THRESHOLD).toBe(0.03);
    expect(VECTOR_AMBIGUOUS_THRESHOLD).toBe(0.7);
  });
});

describe("matchReference — bilingual names", () => {
  test("Thai query matches a Thai-only reference name", async () => {
    const repo = makeRepo([
      row({ id: 1, nameTh: "ข้าวหมูแดง" }),
      row({ id: 2, nameEn: "Steamed Fish" }),
    ]);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("ข้าวหมูแดง");
    expect(outcome.tier).toBe("auto");
    if (outcome.tier === "auto") expect(outcome.reference.id).toBe(1);
  });

  test("English query matches a combined Thai+English reference", async () => {
    const repo = makeRepo([
      row({ id: 1, nameTh: "ข้าวหมูแดง", nameEn: "Red Pork with Rice" }),
      row({ id: 2, nameEn: "Noodle Soup" }),
    ]);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("red pork with rice");
    expect(outcome.tier).toBe("auto");
    if (outcome.tier === "auto") expect(outcome.reference.id).toBe(1);
  });
});
