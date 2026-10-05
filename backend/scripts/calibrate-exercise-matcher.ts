/**
 * Known-answer calibration for the exercise matcher's vector tier (ADR 0027).
 * Runs real queries against the local catalog + Gemini embeddings and prints
 * each outcome with scores, so the provisional thresholds (0.85/0.03/0.7)
 * can be judged against actual similarity numbers — same exercise the
 * nutrition matcher went through on 2026-09-29.
 *
 * Usage (from backend/): bun run scripts/calibrate-exercise-matcher.ts
 */
import "dotenv/config";
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { createExerciseMatcherRepository } from "../src/repositories/exercise-catalog.repository";
import { createExerciseMatcher } from "../src/exercises/exercise-matcher";
import { createEmbeddingClient } from "../src/embeddings/client";

if (!config.geminiApiKey) {
  console.error("❌ GEMINI_API_KEY required for vector calibration");
  process.exit(1);
}

// query → expected provider_exercise_code (null = should NOT auto-match).
const KNOWN_ANSWERS: Array<{ query: string; expect: string | null }> = [
  // Tier 1 — alias hits (seeded from real logged names)
  { query: "Dumbbell Incline Press", expect: "incline-db-press" },
  { query: "elbow pectoral fly machine", expect: "pec-deck" },
  { query: "Assisted Pull Up", expect: "assisted-pull-ups" },
  // Tier 2 — lexical full-coverage names
  { query: "Machine Shoulder Press", expect: "machine-shoulder-press" },
  { query: "Romanian Deadlift", expect: "romanian-deadlift" },
  { query: "Leg Extension Machine", expect: "leg-extension" },
  { query: "One Arm Dumbbell Row", expect: "single-arm-db-row" },
  // Tier 3 — paraphrases the lexical tier cannot fully cover
  { query: "lateral raise", expect: "lateral-raise" }, // alias tier after backfill
  // Genuinely ambiguous in the catalog (dumbbell + machine + barbell variants
  // all exist) — the honest outcome is the ambiguous tier listing them.
  { query: "rear delt machine", expect: "ambiguous" },
  // RepDB's code for "Machine Chest Press" is chest-press-machine.
  { query: "chest press machine", expect: "chest-press-machine" },
  { query: "incline press with dumbbells", expect: "incline-db-press" },
  // Negative controls — must not auto-match
  { query: "running on treadmill while watching tv", expect: null },
  { query: "zzz qqq xxx", expect: null },
];

const db = createDatabaseClient(config.databaseUrl);
const repo = createExerciseMatcherRepository(db);
const embedder = createEmbeddingClient(config.geminiApiKey);
const matcher = createExerciseMatcher(repo, { embed: (t) => embedder.embed(t) });

let pass = 0;
let fail = 0;
for (const { query, expect } of KNOWN_ANSWERS) {
  const outcome = await matcher.match(query);
  const got =
    outcome.tier === "auto"
      ? outcome.exercise.provider_exercise_code
      : outcome.tier === "ambiguous"
        ? `ambiguous(${outcome.candidates.map((c) => c.provider_exercise_code).join("|")})`
        : "gap";
  const score = outcome.tier === "auto" ? outcome.score.toFixed(2) : "-";
  const ok =
    expect === "ambiguous"
      ? outcome.tier === "ambiguous"
      : outcome.tier === "auto"
        ? outcome.exercise.provider_exercise_code === expect
        : expect === null;
  if (ok) pass++;
  else fail++;
  console.log(
    `${ok ? "✅" : "❌"}  "${query}" → ${got} (score ${score})${expect !== null ? ` [expected ${expect}]` : " [expected no auto]"}`,
  );
}

console.log(`\n${pass}/${KNOWN_ANSWERS.length} known answers behaved as expected.`);
console.log("Judgement guide: ❌ rows show the similarity/score numbers to set");
console.log("VECTOR_AUTO_THRESHOLD / VECTOR_MARGIN_THRESHOLD / VECTOR_AMBIGUOUS_THRESHOLD against");
console.log("(constants in src/exercises/exercise-matcher.ts).");
process.exit(0);
