/**
 * Known-answer calibration for the nutrition reference matcher — the
 * nutrition counterpart of calibrate-exercise-matcher.ts. Runs real queries
 * against the local catalog (and the pgvector tier when GEMINI_API_KEY is
 * set) and checks preparation-state invariants established after the
 * ข้าวเหนียวหมูย่าง incident (2026-10):
 *
 *   1. a raw-state reference (ดิบ/raw, raw-density grains) never auto-selects
 *      for a component that does not ask for raw;
 *   2. BaoWio rows never auto-select (unit-suspect — picker or kind prior);
 *   3. an auto pick stays inside its kind's plausible calorie band.
 *
 * Usage (from backend/): bun run scripts/calibrate-nutrition-matcher.ts
 */
import "dotenv/config";
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { createNutritionEstimationRepository } from "../src/repositories/nutrition-estimation.repository";
import {
  createReferenceMatcher,
  KIND_KCAL_BANDS,
  type MatchOutcome,
  type ReferenceRow,
} from "../src/nutrition-estimation/matching/matcher";
import { createEmbeddingClient } from "../src/embeddings/client";

const RAW_NAME = /ดิบ|raw/i;

function isRawRow(ref: ReferenceRow): boolean {
  return RAW_NAME.test(`${ref.nameTh ?? ""} ${ref.nameEn ?? ""}`);
}

// Real component names the VLM emits (kind as proposed per ADR 0026).
const CASES: Array<{ query: string; kind: string }> = [
  { query: "ข้าวเหนียว", kind: "rice" },
  { query: "ข้าวเหนียวสุก", kind: "rice" },
  { query: "ข้าวเหนียวดำ", kind: "rice" },
  { query: "ข้าวเหนียวขาว", kind: "rice" },
  { query: "ข้าวสวย", kind: "rice" },
  { query: "ข้าวหอมมะลิ", kind: "rice" },
  { query: "ข้าวผัด", kind: "rice" },
  { query: "หมูย่าง", kind: "main" },
  { query: "ไข่ต้ม", kind: "side" },
  { query: "แกงเขียวหวาน", kind: "main" },
];

function describeOutcome(outcome: MatchOutcome): { text: string; auto?: ReferenceRow } {
  if (outcome.tier === "auto") {
    return { text: `AUTO "${outcome.reference.nameTh ?? outcome.reference.nameEn}" [${outcome.reference.provider}] score=${outcome.score.toFixed(3)}`, auto: outcome.reference };
  }
  if (outcome.tier === "ambiguous") {
    return { text: `AMBIGUOUS ${outcome.candidates.map((c) => `"${c.nameTh ?? c.nameEn}"[${c.provider}] ${c.score.toFixed(3)}`).join(" | ")}` };
  }
  return { text: "GAP" };
}

const db = createDatabaseClient(config.databaseUrl);
const repo = createNutritionEstimationRepository(db);
const matcher = createReferenceMatcher(repo, {
  embed: config.geminiApiKey ? (t) => createEmbeddingClient(config.geminiApiKey!).embed(t) : undefined,
});

let pass = 0;
let fail = 0;
for (const { query, kind } of CASES) {
  const outcome = await matcher.matchReference(query, { kind });
  const { text, auto } = describeOutcome(outcome);
  const violations: string[] = [];
  if (auto) {
    if (isRawRow(auto)) violations.push("raw-state row auto-selected");
    if (auto.provider === "baowio") violations.push("baowio row auto-selected");
    const band = KIND_KCAL_BANDS[kind] ?? KIND_KCAL_BANDS.other!;
    if (auto.per100.calories < band[0] || auto.per100.calories > band[1]) {
      violations.push(`calories ${auto.per100.calories} outside ${kind} band [${band[0]}, ${band[1]}]`);
    }
  }
  const ok = violations.length === 0;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✅" : "❌"}  "${query}" (${kind}) → ${text}${violations.length ? ` — ${violations.join("; ")}` : ""}`);
}

// Cross-lingual recall probe (2026-10-15): gemini-embedding-001 aligns
// English queries with Thai-dominant catalog docs at ~0.62–0.77 cosine —
// the right family must surface in the top-3 even though it can never
// clear the 0.85 vector auto bar. Guards the embedding model/dimension:
// if a model switch silently breaks multilingual alignment, these go red.
const CROSS_LINGUAL_CASES: Array<{ query: string; family: RegExp }> = [
  { query: "sticky rice", family: /ข้าวเหนียว/ },
  { query: "grilled pork", family: /หมู(ย่าง|ปิ้ง|สะเต๊ะ|สามชั้น)/ },
  { query: "boiled egg", family: /ไข่(ต้ม|ลวก|ไก่อ่อน|เค็ม)/ },
  { query: "fried rice", family: /ข้าวผัด/ },
];
for (const { query, family } of CROSS_LINGUAL_CASES) {
  const hits = await repo.searchByEmbedding(
    await createEmbeddingClient(config.geminiApiKey!).embed(query),
    { k: 10 },
  );
  const rank = hits.findIndex((h) => family.test(`${h.nameTh ?? ""} ${h.nameEn ?? ""}`));
  const ok = rank !== -1 && rank < 3;
  if (ok) pass++;
  else fail++;
  const best = hits.slice(0, 3).map((h) => `"${h.nameTh ?? h.nameEn}" ${h.similarity.toFixed(3)}`).join(" | ");
  console.log(
    `${ok ? "✅" : "❌"}  (xling) "${query}" → family at ${rank === -1 ? "NONE(top10)" : `rank #${rank + 1}`} — top3: ${best}`,
  );
}

console.log(`\n${pass}/${CASES.length + CROSS_LINGUAL_CASES.length} checks passed.`);
console.log("❌ rows show which invariant broke — check state tokens in");
console.log("src/nutrition-estimation/matching/matcher.ts and the catalog row named in the output.");
process.exit(fail > 0 ? 1 : 0);
