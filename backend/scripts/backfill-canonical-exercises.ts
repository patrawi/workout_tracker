/**
 * One-time backfill: anchor the owner's already-logged workouts onto the
 * Canonical Exercise Catalog (ADR 0027) using the hand-authored mapping in
 * src/exercises/logged-name-mapping.ts, and seed exercise_aliases with the
 * same names. Idempotent — safe to re-run (alias inserts no-op on conflict;
 * workout updates rewrite the same anchor).
 *
 * Run the importer first (scripts/import-repdb.ts) so the codes resolve.
 *
 * Usage (from backend/):
 *   bun run scripts/backfill-canonical-exercises.ts
 */
import "dotenv/config";
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { createExerciseCatalogRepository } from "../src/repositories/exercise-catalog.repository";
import {
  LOGGED_NAME_ALIASES,
  UNMAPPED_LOGGED_NAMES,
} from "../src/exercises/logged-name-mapping";

const db = createDatabaseClient(config.databaseUrl);
const repo = createExerciseCatalogRepository(db);

const pairs = LOGGED_NAME_ALIASES.map((a) => ({ provider: a.provider, code: a.provider_exercise_code }));
const ids = await repo.findIdsByProviderCodes(pairs);

const missing = pairs.filter((p) => !ids.has(`${p.provider}:${p.code}`));
if (missing.length > 0) {
  console.error(
    `⚠️  ${missing.length} mapped codes not found in canonical_exercises ` +
      `(run scripts/import-repdb.ts first): ` +
      missing.map((m) => `${m.provider}:${m.code}`).join(", "),
  );
}

const resolvable = LOGGED_NAME_ALIASES.filter((a) =>
  ids.has(`${a.provider}:${a.provider_exercise_code}`),
);

const aliasRows = resolvable.map((a) => ({
  alias: a.alias,
  canonical_exercise_id: ids.get(`${a.provider}:${a.provider_exercise_code}`)!,
}));
await repo.upsertAliasBatch(aliasRows);
console.log(`Seeded ${aliasRows.length} exercise_aliases rows.`);

const results = await repo.backfillWorkoutNames(
  resolvable.map((a) => ({
    name: a.alias,
    canonical_exercise_id: ids.get(`${a.provider}:${a.provider_exercise_code}`)!,
  })),
);
const totalAnchored = results.reduce((sum, r) => sum + r.updated, 0);
for (const r of results) {
  console.log(`  ${r.name} → ${r.updated} workout row(s)`);
}
console.log(`✅ Anchored ${totalAnchored} workout rows across ${results.length} names.`);

const unanchored = await repo.listUnanchoredNames();
console.log(
  `Remaining unanchored names (the alias queue for the gap flow): ` +
    (unanchored.length > 0
      ? unanchored.map((u) => `${u.name} ×${u.count}`).join(", ")
      : "none"),
);
if (UNMAPPED_LOGGED_NAMES.length > 0) {
  console.log(`Deliberately unmapped: ${UNMAPPED_LOGGED_NAMES.join(", ")}`);
}
process.exit(0);
