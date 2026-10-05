// RepDB exercise dataset → Canonical Exercise Catalog mapping (ADR 0027).
// Pure logic: JSON parsing plus the lean field selection agreed in the
// Phase 2 grill. No env/db imports so it is unit-testable in isolation; the
// CLI lives in backend/scripts/import-repdb.ts and persistence in
// backend/src/repositories/exercise-catalog.repository.ts.
//
// Source: RepDB/exercise-dataset free-tier JSON (601 exercises, schema_version
// 3 at time of writing). License: in-app use with attribution
// ("Exercise data by RepDB (repdb.co)") — no redistribution of the dataset or
// a derived one (term 3), which is why the importer fetches the pinned file
// at run time and nothing RepDB-derived is committed to this public repo.
// Term 5 also bars feeding their images to generative models; images are not
// imported at all.
//
// Field policy (lean): id → provider_exercise_code, name_en, equipment,
// body_part, primary/secondary_muscles, mechanic, is_unilateral,
// is_bodyweight. Dropped: descriptions, instructions, tips, tags, goals,
// difficulty, force_type, met, de/es names, images — none has a Phase 2
// consumer and a re-import can always bring them back.
// equipment = null means bodyweight/unspecified (RepDB marks every
// bodyweight row this way); it is preserved as NULL, not "bodyweight".

/** Provider id written to canonical_exercises.provider (ADR 0011 honesty). */
export const REPDB_PROVIDER = "repdb";
/** Provider id for rows the catalog authors itself (RepDB lacks or mis-tags them). */
export const MANUAL_PROVIDER = "manual";
/** Version label for manually authored rows. */
export const MANUAL_VERSION = "v1";

/** Raw shape of one RepDB exercises.json record (only the fields we read). */
export interface RepdbRecord {
  id?: string;
  name_en?: string;
  equipment?: string | null;
  body_part?: string | null;
  primary_muscles?: string[] | null;
  secondary_muscles?: string[] | null;
  mechanic?: string | null;
  is_unilateral?: boolean;
  is_bodyweight?: boolean;
  [key: string]: unknown;
}

/** One RepDB record mapped to a canonical_exercises upsert row. */
export interface RepdbExerciseRow {
  provider: string;
  provider_exercise_code: string;
  version: string;
  name_en: string | null;
  equipment: string | null;
  body_part: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  mechanic: string | null;
  is_unilateral: boolean;
  is_bodyweight: boolean;
  /** Populated only by the importer's embed pass; null by default. */
  embedding: number[] | null;
}

/** Import-run statistics reported by the script. */
export interface RepdbImportStats {
  totalRows: number;
  skippedRows: number;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function cleanMuscles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((m): m is string => typeof m === "string" && m.trim() !== "");
}

/**
 * Map one RepDB record to a catalog upsert row. Returns `skipped` for
 * records without an id (defensive — the current export has none).
 */
export function mapRepdbRecord(
  record: RepdbRecord,
  version: string,
): { row: RepdbExerciseRow | null; stats: { skipped: boolean } } {
  const code = cleanString(record.id);
  if (!code) return { row: null, stats: { skipped: true } };

  return {
    row: {
      provider: REPDB_PROVIDER,
      provider_exercise_code: code,
      version,
      name_en: cleanString(record.name_en),
      equipment: cleanString(record.equipment),
      body_part: cleanString(record.body_part),
      primary_muscles: cleanMuscles(record.primary_muscles),
      secondary_muscles: cleanMuscles(record.secondary_muscles),
      mechanic: cleanString(record.mechanic),
      is_unilateral: record.is_unilateral === true,
      is_bodyweight: record.is_bodyweight === true,
      embedding: null,
    },
    stats: { skipped: false },
  };
}

/**
 * Parse a full RepDB exercises.json payload into catalog rows. The dataset's
 * schema_version becomes the snapshot version label so a future re-import of
 * a newer export coexists with the old one (same keying rule as
 * nutrition_references). Throws on schema drift so a changed export fails
 * loudly instead of silently importing garbage.
 */
export function parseRepdbDataset(
  text: string,
  version?: string,
): { rows: RepdbExerciseRow[]; stats: RepdbImportStats } {
  const parsed = JSON.parse(text) as { schema_version?: unknown; exercises?: unknown };
  if (!Array.isArray(parsed.exercises)) {
    throw new Error("RepDB payload has no exercises array (schema drift)");
  }
  const schemaVersion = version ?? (parsed.schema_version === undefined ? undefined : String(parsed.schema_version));
  if (!schemaVersion) {
    throw new Error("RepDB payload has no schema_version (schema drift)");
  }

  const rows: RepdbExerciseRow[] = [];
  const stats: RepdbImportStats = { totalRows: 0, skippedRows: 0 };
  for (const record of parsed.exercises as RepdbRecord[]) {
    const { row, stats: flags } = mapRepdbRecord(record, schemaVersion);
    if (!row || flags.skipped) {
      stats.skippedRows++;
      continue;
    }
    rows.push(row);
    stats.totalRows++;
  }
  return { rows, stats };
}

/**
 * The text embedded for the vector matcher tier (ADR 0027): the English name
 * ONLY — no Thai alias text feeds embeddings.
 */
export function repdbEmbedText(row: { name_en: string | null }): string {
  return (row.name_en ?? "").trim();
}

/**
 * Manually authored catalog rows for logged exercises RepDB lacks or mis-tags
 * (grill decision 2026-10-05). `Machine Reverse Fly` does not exist in RepDB
 * (only dumbbell/band variants) — it rides a pec-deck-family machine.
 * `Dumbbell Goblet Squat` exists in RepDB only as a kettlebell tag, which
 * would break equipment availability for a dumbbell gym.
 */
export const MANUAL_EXERCISES: RepdbExerciseRow[] = [
  {
    provider: MANUAL_PROVIDER,
    provider_exercise_code: "machine-reverse-fly",
    version: MANUAL_VERSION,
    name_en: "Machine Reverse Fly",
    equipment: "pec_deck",
    body_part: "shoulders",
    primary_muscles: ["posterior_deltoid"],
    secondary_muscles: ["trapezius"],
    mechanic: "isolation",
    is_unilateral: false,
    is_bodyweight: false,
    embedding: null,
  },
  {
    provider: MANUAL_PROVIDER,
    provider_exercise_code: "dumbbell-goblet-squat",
    version: MANUAL_VERSION,
    name_en: "Dumbbell Goblet Squat",
    equipment: "dumbbell",
    body_part: "upper_legs",
    primary_muscles: ["gluteus_maximus", "quadriceps"],
    secondary_muscles: [],
    mechanic: "compound",
    is_unilateral: false,
    is_bodyweight: false,
    embedding: null,
  },
];
