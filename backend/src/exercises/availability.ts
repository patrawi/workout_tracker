// Equipment Availability (ADR 0027, glossary): whether an exercise can
// actually be performed at a Gym. Derived ONLY — a gym without a Gym Profile
// is unrestricted (additive override), bodyweight exercises need nothing, and
// evidence of playing the exercise there beats any tick list.
export interface GymEquipmentProfile {
  /** Ticked equipment types; null = no profile (unrestricted). */
  equipment: string[] | null;
}

export interface ExerciseEquipmentNeed {
  /** RepDB equipment type; null = no equipment needed (bodyweight). */
  equipment: string | null;
}

export function isExerciseAvailable(
  gym: GymEquipmentProfile,
  exercise: ExerciseEquipmentNeed,
  playedThere: boolean,
): boolean {
  if (gym.equipment === null) return true;
  if (playedThere) return true;
  if (exercise.equipment === null) return true;
  return gym.equipment.includes(exercise.equipment);
}
