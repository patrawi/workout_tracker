/**
 * Seed the coach_plan table from the target tables in knowledge.md (the user's
 * training doc) — Pull, Push (B), Legs. This is the starting progression state
 * the coach updates each round.
 *
 * Run from the backend dir:  bun run scripts/seed-coach-plan.ts
 * Re-running replaces each day-type's rows (idempotent).
 */
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { createCoachPlanRepository } from "../src/repositories/coach-plan.repository";
import type { CoachPlanInput } from "../src/repositories/coach-plan.repository";
import type { ExerciseRole, ProgressionLadder } from "../src/constants";

// Helper to cut boilerplate. Weight ranges (e.g. 91–93) → lower bound + note.
const ex = (
  position: number,
  exercise_name: string,
  weight: number | null,
  sets: number,
  rep_low: number,
  rep_high: number,
  rpe_low: number,
  rpe_high: number,
  notes = "",
  exercise_role: ExerciseRole = "isolation",
  progression_ladder: ProgressionLadder = "double_12",
): CoachPlanInput => ({
  position,
  exercise_name,
  is_bodyweight: weight === null,
  target_weight: weight,
  sets,
  rep_low,
  rep_high,
  rpe_low,
  rpe_high,
  exercise_role,
  progression_ladder,
  notes,
});

const PULL: CoachPlanInput[] = [
  ex(1, "Pull Up / Assisted Pull Up", null, 3, 8, 8, 8, 10, "Bodyweight; switch to machine-assist if form breaks.", "compound", "double_12"),
  ex(2, "One Arm Dumbbell Row", 14, 3, 11, 12, 8, 10, "", "compound", "double_12"),
  ex(3, "Lat Pulldown Machine", 39, 3, 10, 12, 8, 10, "", "compound", "double_12"),
  ex(4, "Machine Reverse Fly", 25, 3, 12, 15, 8, 10, "", "isolation", "double_15"),
  ex(5, "Dumbbell Bicep Curl", 8, 3, 10, 12, 8, 10, "", "isolation", "double_12"),
  ex(6, "Dumbbell Hammer Curl", 8, 2, 12, 12, 8, 9, "", "isolation", "double_12"),
  ex(7, "Leg Raise", null, 3, 15, 18, 8, 10, "Bodyweight; keep lower back pinned.", "isolation", "bodyweight_high_rep"),
  ex(8, "Abs Crunch", 40, 3, 10, 10, 8, 10, "Raise the seat so the pivot is mid-torso.", "isolation", "double_12"),
];

const PUSH: CoachPlanInput[] = [
  ex(1, "Machine Incline Press / Converging", 45, 3, 8, 10, 8, 9, "", "compound", "double_12"),
  ex(2, "Shoulder Press Machine", 27, 3, 10, 12, 8, 10, "", "compound", "double_12"),
  ex(3, "Dips", null, 3, 10, 12, 8, 10, "Bodyweight; lean forward for lower chest.", "compound", "double_12"),
  ex(4, "Elbow Pectoral Fly", 27, 3, 10, 12, 8, 10, "", "isolation", "double_12"),
  ex(5, "Dumbbell Lateral Raise", 6, 3, 12, 15, 8, 10, "", "isolation", "double_15"),
  ex(6, "Tricep Extension Machine", 50, 3, 10, 12, 8, 10, "Try 54kg if the first set feels easy.", "isolation", "double_12"),
  ex(7, "DB Overhead Tricep Ext.", 10, 3, 10, 12, 8, 9, "", "isolation", "double_12"),
];

const LEGS: CoachPlanInput[] = [
  ex(1, "Dumbbell Goblet Squat", 26, 3, 8, 10, 8, 9, "24kg fallback with slow tempo if 26 unavailable.", "compound", "double_12"),
  ex(2, "Leg Press Machine", 91, 3, 8, 10, 8, 9, "Target 91–93kg.", "compound", "double_12"),
  ex(3, "Glute Trainer (Official)", 30, 3, 10, 12, 8, 9, "", "compound", "double_12"),
  ex(4, "Leg Extension Machine", 45, 3, 10, 12, 9, 10, "", "isolation", "double_12"),
  ex(5, "Hip Abduction Machine", 41, 3, 12, 12, 8, 9, "Target 41–43kg.", "isolation", "double_12"),
  ex(6, "Leg Curl Machine", 41, 3, 10, 12, 8, 9, "Target 41–43kg; control the negative.", "isolation", "double_12"),
];

const db = createDatabaseClient(config.databaseUrl);
const repo = createCoachPlanRepository(db);

await repo.replaceDayType("Pull", PULL);
await repo.replaceDayType("Push", PUSH);
await repo.replaceDayType("Legs", LEGS);

console.log("✅ Seeded coach_plan: Pull, Push, Legs");
process.exit(0);
