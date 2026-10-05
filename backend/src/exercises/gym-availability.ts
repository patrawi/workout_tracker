// Gym availability summary for the coach's lookup_gym_equipment tool
// (ADR 0027): resolves the gym (explicit id or last-used fallback), applies
// the availability formula (ticks ∪ played-there, no profile = unrestricted),
// and assesses the saved plan's exercises. Derived substitution itself is the
// coach's job — this hands it the facts.
import { isExerciseAvailable } from "./availability";

export interface GymAvailabilityDeps {
  /** The gym for an explicit id, or the most recently used one. */
  getGym(
    gymId: number | undefined,
    userId: number,
  ): Promise<{ id: number; name: string; equipment: string[] | null } | null>;
  /** Exercises actually logged at this gym, newest first, with their
   * canonical anchor when one exists (usage evidence). */
  listPlayedExercises(
    gymId: number,
    userId: number,
    limit?: number,
  ): Promise<Array<{ exercise_name: string; canonical_exercise_id: number | null }>>;
  /** The catalog resolution for a plan name, or undefined when unmatched. */
  equipmentFor(
    name: string,
  ): Promise<{ equipment: string | null; canonical_exercise_id?: number } | undefined>;
}

export interface GymPlanAvailability {
  exercise_name: string;
  equipment: string | null;
  /** false only on a positive no (profile restricted + unticked); "unknown"
   * when the name is not in the catalog — never pretend certainty. */
  available: boolean | "unknown";
}

export interface GymAvailabilitySummary {
  gym: { id: number; name: string; equipment: string[] | null } | null;
  /** True when the gym has no Gym Profile — every exercise available. */
  unrestricted: boolean;
  equipment: string[] | null;
  played_there: string[];
  plan_availability: GymPlanAvailability[];
}

const PLAYED_LIMIT = 25;

export async function summarizeGymAvailability(
  deps: GymAvailabilityDeps,
  args: { gymId?: number; userId: number; planNames: string[] },
): Promise<GymAvailabilitySummary> {
  const gym = await deps.getGym(args.gymId, args.userId);
  if (!gym) {
    return {
      gym: null,
      unrestricted: true,
      equipment: null,
      played_there: [],
      plan_availability: [],
    };
  }

  // Played evidence matches on canonical identity first (plan name and log
  // spelling can differ — "Lat Pulldown" vs "Lat Pulldown Machine"), falling
  // back to the verbatim name for unmatched rows.
  const playedRows = await deps.listPlayedExercises(gym.id, args.userId, PLAYED_LIMIT);
  const playedIds = new Set(
    playedRows.map((r) => r.canonical_exercise_id).filter((id): id is number => id !== null),
  );
  const playedNames = new Set(playedRows.map((r) => r.exercise_name));

  const plan_availability: GymPlanAvailability[] = [];
  for (const name of args.planNames) {
    const resolved = await deps.equipmentFor(name);
    if (!resolved) {
      plan_availability.push({ exercise_name: name, equipment: null, available: "unknown" });
      continue;
    }
    const playedThere =
      (resolved.canonical_exercise_id !== undefined && playedIds.has(resolved.canonical_exercise_id)) ||
      playedNames.has(name);
    plan_availability.push({
      exercise_name: name,
      equipment: resolved.equipment,
      available: isExerciseAvailable(gym, resolved, playedThere),
    });
  }

  return {
    gym: { id: gym.id, name: gym.name, equipment: gym.equipment },
    unrestricted: gym.equipment === null,
    equipment: gym.equipment,
    played_there: playedRows.map((r) => r.exercise_name),
    plan_availability,
  };
}
