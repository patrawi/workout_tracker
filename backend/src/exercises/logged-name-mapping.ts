// Hand-authored alias seed for the owner's already-logged exercise names
// (ADR 0027: aliases come only from real usage). Each entry maps one exact
// workouts.exercise_name spelling onto a canonical exercise code so the
// one-time backfill can anchor history and seed exercise_aliases.
//
// Resolutions verified against the RepDB free-tier export on 2026-10-05;
// log counts in the test file document provenance. Case-variant spellings of
// the same exercise each get their own alias row.
import { MANUAL_PROVIDER, REPDB_PROVIDER } from "./repdb-import";

export interface LoggedNameAlias {
  alias: string;
  provider: string;
  provider_exercise_code: string;
}

/**
 * Notable calls, for the reviewer:
 * - "Leg Raise" → captains-chair-leg-raise: assumed to be the owner's
 *   shorthand for the same vertical station as "Vertical Leg Raise".
 * - "Lateral Raise" (1 log) → the dumbbell variant, matching "Dumbbell
 *   Lateral Raise" (35 logs).
 * - "Bench Press" → the barbell variant (RepDB bench-press).
 * - "Lat Pulldown Machine" → the plain cable lat-pulldown (the machine rows
 *   in RepDB are only the V-bar / behind-the-neck variants).
 * - "Leg Curl Machine" → the generic lying leg-curl row.
 */
export const LOGGED_NAME_ALIASES: ReadonlyArray<LoggedNameAlias> = [
  { alias: "Dumbbell Incline Press", provider: REPDB_PROVIDER, provider_exercise_code: "incline-db-press" },
  { alias: "Dip", provider: REPDB_PROVIDER, provider_exercise_code: "dips" },
  { alias: "Shoulder Press Machine", provider: REPDB_PROVIDER, provider_exercise_code: "machine-shoulder-press" },
  { alias: "Dumbbell Lateral Raise", provider: REPDB_PROVIDER, provider_exercise_code: "lateral-raise" },
  { alias: "Tricep Extension Machine", provider: REPDB_PROVIDER, provider_exercise_code: "machine-triceps-extension" },
  { alias: "Dumbbell Goblet Squat", provider: MANUAL_PROVIDER, provider_exercise_code: "dumbbell-goblet-squat" },
  { alias: "Assisted Pull Up", provider: REPDB_PROVIDER, provider_exercise_code: "assisted-pull-ups" },
  { alias: "Dumbbell Bicep Curl", provider: REPDB_PROVIDER, provider_exercise_code: "bicep-curl" },
  { alias: "One Arm Dumbbell Row", provider: REPDB_PROVIDER, provider_exercise_code: "single-arm-db-row" },
  { alias: "Lat Pulldown Machine", provider: REPDB_PROVIDER, provider_exercise_code: "lat-pulldown" },
  { alias: "Leg Curl Machine", provider: REPDB_PROVIDER, provider_exercise_code: "leg-curl" },
  { alias: "Leg Extension Machine", provider: REPDB_PROVIDER, provider_exercise_code: "leg-extension" },
  { alias: "Pectoral Fly Machine", provider: REPDB_PROVIDER, provider_exercise_code: "machine-chest-fly" },
  { alias: "Machine Reverse Fly", provider: MANUAL_PROVIDER, provider_exercise_code: "machine-reverse-fly" },
  { alias: "Elbow Pectoral Fly Machine", provider: REPDB_PROVIDER, provider_exercise_code: "pec-deck" },
  { alias: "Elbow Pectoral fly machine", provider: REPDB_PROVIDER, provider_exercise_code: "pec-deck" },
  { alias: "Elbow Fly Pectoral Machine", provider: REPDB_PROVIDER, provider_exercise_code: "pec-deck" },
  { alias: "Leg Press Machine", provider: REPDB_PROVIDER, provider_exercise_code: "leg-press" },
  { alias: "Vertical Leg Raise", provider: REPDB_PROVIDER, provider_exercise_code: "captains-chair-leg-raise" },
  { alias: "Leg Raise", provider: REPDB_PROVIDER, provider_exercise_code: "captains-chair-leg-raise" },
  { alias: "Dumbbell Hammer Curl", provider: REPDB_PROVIDER, provider_exercise_code: "hammer-curl" },
  { alias: "Hip Abduction Machine", provider: REPDB_PROVIDER, provider_exercise_code: "hip-abduction" },
  { alias: "Romanian Deadlift", provider: REPDB_PROVIDER, provider_exercise_code: "romanian-deadlift" },
  { alias: "Dumbbell Overhead Tricep Extension", provider: REPDB_PROVIDER, provider_exercise_code: "overhead-tricep-extension" },
  { alias: "Abs Crunch Machine", provider: REPDB_PROVIDER, provider_exercise_code: "machine-seated-crunch" },
  { alias: "Dumbbell Romanian Deadlift", provider: REPDB_PROVIDER, provider_exercise_code: "dumbbell-romanian-deadlift" },
  { alias: "Bench Press", provider: REPDB_PROVIDER, provider_exercise_code: "bench-press" },
  { alias: "Lateral Raise", provider: REPDB_PROVIDER, provider_exercise_code: "lateral-raise" },
];

/**
 * Observed logged names the backfill deliberately leaves untouched — no
 * confident canonical target (test fixture rows and similar).
 */
export const UNMAPPED_LOGGED_NAMES: ReadonlyArray<string> = ["Test Item"];

const LOOKUP = new Map(
  LOGGED_NAME_ALIASES.map((row) => [row.alias.toLowerCase(), row]),
);

/** Resolve one logged name (case-insensitively) or undefined when unmapped. */
export function aliasForLoggedName(
  name: string,
): LoggedNameAlias | undefined {
  return LOOKUP.get(name.trim().toLowerCase());
}
