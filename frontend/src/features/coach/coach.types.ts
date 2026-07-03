export type CoachRole = "user" | "coach";

export interface CoachMessage {
  role: CoachRole;
  text: string;
  reasoning?: string;
  proposal?: PlanProposal;
  prescription?: SessionPrescription;
}

export type PlanDayType = "Push" | "Pull" | "Legs";
export const PLAN_DAY_TYPES: PlanDayType[] = ["Push", "Pull", "Legs"];
export type UpperSourceDayType = Extract<PlanDayType, "Push" | "Pull">;
export type ExerciseRole = "compound" | "isolation";
export type ProgressionLadder = "double_12" | "double_15" | "bodyweight_high_rep";

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
  exercise_role: ExerciseRole;
  progression_ladder: ProgressionLadder;
  notes: string;
}

export interface PlanProposal {
  day_type: PlanDayType;
  exercises: PlanExercise[];
}

export interface SessionPrescriptionExercise extends PlanExercise {
  source_day_type: UpperSourceDayType;
}

export interface SessionPrescription {
  kind: "upper_flex";
  title: string;
  exercises: SessionPrescriptionExercise[];
}

export interface PlanRow extends PlanExercise {
  id: number;
  day_type: string;
  updated_at: string | null;
}

export type CoachPlanGrouped = Record<PlanDayType, PlanRow[]>;

export type CoachStreamEvent =
  | { type: "reasoning" | "content"; text: string }
  | { type: "plan_proposal"; proposal: PlanProposal }
  | { type: "session_prescription"; prescription: SessionPrescription };

export interface CoachKnowledgeRow {
  id: number;
  title: string;
  body: string;
  position: number;
  updated_at: string | null;
}
