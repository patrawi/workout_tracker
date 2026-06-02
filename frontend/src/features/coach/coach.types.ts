export type CoachRole = "user" | "coach";

export interface CoachMessage {
  role: CoachRole;
  text: string;
}

export type PlanDayType = "Push" | "Pull" | "Legs";
export const PLAN_DAY_TYPES: PlanDayType[] = ["Push", "Pull", "Legs"];

// The editable fields of a plan exercise (what gets saved).
export interface PlanExercise {
  position: number;
  exercise_name: string;
  is_bodyweight: boolean;
  target_weight: number | null;
  sets: number;
  rep_low: number;
  rep_high: number;
  rpe_low: number;
  rpe_high: number;
  notes: string;
}

export interface PlanRow extends PlanExercise {
  id: number;
  day_type: string;
  updated_at: string | null;
}

export interface ProposedExercise extends PlanExercise {
  change: "increase" | "hold" | "decrease";
  rationale: string;
}

export interface PlanProposal {
  day_type: PlanDayType;
  based_on_date: string | null;
  exercises: ProposedExercise[];
}

export type CoachPlanGrouped = Record<PlanDayType, PlanRow[]>;
