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

  test("score ties order ThaiFCD before BaoWio (vendor trust tie-break)", async () => {
    // Both rows share the exact name → both score 1.0, margin 0 → ambiguous;
    // the tie-break decides which one the picker shows first.
    const repo = makeRepo([
      row({ id: 1, provider: "baowio", nameTh: "ข้าวเหนียว", per100: { protein: 2, carbs: 21.1, fat: 0.2, alcohol: 0, calories: 97 } }),
      row({ id: 2, provider: "thaifcd", nameTh: "ข้าวเหนียว", per100: { protein: 4.54, carbs: 52.99, fat: 0.21, alcohol: 0, calories: 232 } }),
    ]);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("ข้าวเหนียว");
    expect(outcome.tier).toBe("ambiguous");
    if (outcome.tier === "ambiguous") {
      expect(outcome.candidates[0]!.provider).toBe("thaifcd");
      expect(outcome.candidates[0]!.id).toBe(2);
    }
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

describe("matchReference — vector provider handicap (vendor trust)", () => {
  test("BaoWio edging a ThaiFCD row does not auto-select — goes to the picker", async () => {
    // Live-measured case: "ข้าวเหนียวสุก" embeds 0.879 to BaoWio's bare
    // "ข้าวเหนียว" vs 0.796 to ThaiFCD's "ข้าวเหนียว, นึ่ง".
    const hits = [
      { ...row({ id: 1, provider: "baowio", nameTh: "ข้าวเหนียว" }), similarity: 0.8792 },
      { ...row({ id: 2, provider: "thaifcd", nameTh: "ข้าวเหนียว, นึ่ง" }), similarity: 0.7956 },
    ];
    const repo = makeRepo(hits, mock(async () => hits));
    const matcher = createReferenceMatcher(repo, { embed: async () => [1] });
    const outcome = await matcher.matchReference("ข้าวเหนียวสุก");
    expect(outcome.tier).toBe("ambiguous");
    if (outcome.tier === "ambiguous") {
      expect(outcome.candidates[0]!.provider).toBe("baowio"); // sim order preserved
    }
  });

  test("ThaiFCD clear of the runner-up still auto-selects through the handicap", async () => {
    const hits = [
      { ...row({ id: 2, provider: "thaifcd", nameTh: "ข้าวเหนียว, นึ่ง" }), similarity: 0.9 },
      { ...row({ id: 1, provider: "baowio", nameTh: "ข้าวเหนียว" }), similarity: 0.88 },
    ];
    const repo = makeRepo(hits, mock(async () => hits));
    const matcher = createReferenceMatcher(repo, { embed: async () => [1] });
    const outcome = await matcher.matchReference("ข้าวเหนียวสุก");
    expect(outcome.tier).toBe("auto");
    if (outcome.tier === "auto") expect(outcome.reference.provider).toBe("thaifcd");
  });

  test("BaoWio never auto-selects even with a clear vector lead (unit-suspect rows go to the picker)", async () => {
    // Behavior change (ข้าวเหนียวหมูย่าง incident fix): BaoWio's bare
    // ingredient names embed closest to queries, but its rows mix unit
    // conventions — a clear vector lead now stays ambiguous.
    const hits = [
      { ...row({ id: 1, provider: "baowio", nameTh: "กุ้ง" }), similarity: 0.95 },
      { ...row({ id: 2, provider: "thaifcd", nameTh: "กุ้งเผา" }), similarity: 0.8 },
    ];
    const repo = makeRepo(hits, mock(async () => hits));
    const matcher = createReferenceMatcher(repo, { embed: async () => [1] });
    const outcome = await matcher.matchReference("กุ้งสุก");
    expect(outcome.tier).toBe("ambiguous");
    if (outcome.tier === "ambiguous") {
      expect(outcome.candidates[0]!.provider).toBe("baowio"); // sim order preserved
    }
  });

  test("BaoWio never auto-selects on the lexical tier either", async () => {
    const repo = makeRepo([
      row({ id: 1, provider: "baowio", nameTh: "กะปิ", per100: { protein: 10, carbs: 360, fat: 2, alcohol: 0, calories: 1480 } }),
      row({ id: 2, provider: "thaifcd", nameTh: "กุ้งสด" }),
    ]);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("กะปิ");
    expect(outcome.tier).toBe("ambiguous");
    if (outcome.tier === "ambiguous") {
      expect(outcome.candidates[0]!.provider).toBe("baowio");
    }
  });

  test("auto-pick outside the kind's calorie band is demoted to ambiguous (F3 sanity net)", async () => {
    // "ข้าวเม่า" (raw glutinous flakes, 364 kcal/100g) would lexically
    // auto-select at 1.0 — outside the rice band [40, 320] it must not.
    const repo = makeRepo([
      row({ id: 1279, nameTh: "ข้าวเม่า", nameEn: "Rice, glutinous, flakes", per100: { protein: 7.2, carbs: 79.5, fat: 1.2, alcohol: 0, calories: 364 } }),
    ]);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("ข้าวเม่า", { kind: "rice" });
    expect(outcome.tier).toBe("ambiguous");
  });

  test("kind band check is skipped when no kind hint is given", async () => {
    const repo = makeRepo([
      row({ id: 1279, nameTh: "ข้าวเม่า", nameEn: "Rice, glutinous, flakes", per100: { protein: 7.2, carbs: 79.5, fat: 1.2, alcohol: 0, calories: 364 } }),
    ]);
    const matcher = createReferenceMatcher(repo);
    const outcome = await matcher.matchReference("ข้าวเม่า");
    expect(outcome.tier).toBe("auto");
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

// Regression guard for the ข้าวเหนียวหมูย่าง incident (2026-10): cooked-dish
// component names must never auto-select a raw/processed-grain row, and cooked
// rows must outrank raw rows wherever the matcher surfaces a ranking.
// Row shapes mirror the live catalog (#3288 baowio 97, #1280 thaifcd raw 354,
// #1281 thaifcd steamed 232, #1279 thaifcd flakes 364 kcal/100g).
describe("matchReference — preparation-state awareness (raw vs cooked)", () => {
  const liveStickyRicePool = [
    row({ id: 3288, provider: "baowio", nameTh: "ข้าวเหนียว", per100: { protein: 2.4, carbs: 21.1, fat: 0.2, alcohol: 0, calories: 97 } }),
    row({ id: 1280, nameTh: "ข้าวเหนียว, ดิบ", nameEn: "Rice, glutinous, polished, raw", per100: { protein: 7.4, carbs: 77.6, fat: 0.6, alcohol: 0, calories: 354 } }),
    row({ id: 1281, nameTh: "ข้าวเหนียว, นึ่ง", nameEn: "Rice, glutinous, polished, steamed", per100: { protein: 4.3, carbs: 51.1, fat: 0.4, alcohol: 0, calories: 232 } }),
    row({ id: 1279, nameTh: "ข้าวเม่า, ข้าวเหนียวขาว", nameEn: "Rice, glutinous, flakes", per100: { protein: 7.2, carbs: 79.5, fat: 1.2, alcohol: 0, calories: 364 } }),
  ];

  function expectCookedRow(ref: ReferenceRow) {
    // cooked = the steamed sticky-rice row; raw-ingredient rows are the bug
    expect([1280, 1279]).not.toContain(ref.id);
  }

  test("component 'ข้าวเหนียว' (cooked in any real meal) does not auto-select a raw-grain row (lexical-only)", async () => {
    const matcher = createReferenceMatcher(makeRepo(liveStickyRicePool));
    const outcome = await matcher.matchReference("ข้าวเหนียว");
    if (outcome.tier === "auto") expectCookedRow(outcome.reference);
    if (outcome.tier === "ambiguous") {
      expect(outcome.candidates[0]!.id).not.toBe(1280);
      expect(outcome.candidates[0]!.id).not.toBe(1279);
    }
  });

  test("component 'ข้าวเหนียวขาว' does not auto-select the ข้าวเม่า (flakes) row", async () => {
    const matcher = createReferenceMatcher(makeRepo(liveStickyRicePool));
    const outcome = await matcher.matchReference("ข้าวเหนียวขาว");
    if (outcome.tier === "auto") expectCookedRow(outcome.reference);
    if (outcome.tier === "ambiguous") {
      expect(outcome.candidates[0]!.id).not.toBe(1279);
    }
  });

  test("'ข้าวเหนียวสุก' reaches the steamed row instead of gap (lexical-only)", async () => {
    const matcher = createReferenceMatcher(makeRepo(liveStickyRicePool.slice(0, 3)));
    const outcome = await matcher.matchReference("ข้าวเหนียวสุก");
    expect(outcome.tier).not.toBe("gap");
    if (outcome.tier === "auto") {
      expect(outcome.reference.id).toBe(1281);
    } else if (outcome.tier === "ambiguous") {
      expect(outcome.candidates.map((c) => c.id)).toContain(1281);
    }
  });
});
