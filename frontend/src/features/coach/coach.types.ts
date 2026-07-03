export type CoachRole = "user" | "coach";

export interface CoachMessage {
  role: CoachRole;
  text: string;
  reasoning?: string;
  proposal?: PlanProposal;
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

export interface PlanProposal {
  day_type: PlanDayType;
  exercises: PlanExercise[];
}

export interface PlanRow extends PlanExercise {
  id: number;
  day_type: string;
  updated_at: string | null;
}

export type CoachPlanGrouped = Record<PlanDayType, PlanRow[]>;

export type CoachStreamEvent =
  | { type: "reasoning" | "content"; text: string }
  | { type: "plan_proposal"; proposal: PlanProposal };

export interface CoachKnowledgeRow {
  id: number;
  title: string;
  body: string;
  position: number;
  updated_at: string | null;
}
