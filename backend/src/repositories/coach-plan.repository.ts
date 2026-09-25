import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { coachPlan } from "../schema";
import type { ExerciseRole, ProgressionLadder } from "../constants";

// Legacy default: the pre-multi-user global plan belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export interface CoachPlanRow {
    id: number;
    user_id: number;
    day_type: string;
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
    updated_at: string | null;
}

// A plan row without the server-managed fields — used when replacing a day's plan.
export type CoachPlanInput = Omit<CoachPlanRow, "id" | "day_type" | "user_id" | "updated_at">;

export function createCoachPlanRepository(dbInstance: PostgresJsDatabase) {
    return {
        async getAll(userId: number = DEFAULT_USER_ID): Promise<CoachPlanRow[]> {
            return dbInstance
                .select()
                .from(coachPlan)
                .where(eq(coachPlan.user_id, userId))
                .orderBy(asc(coachPlan.day_type), asc(coachPlan.position));
        },

        async getByDayType(dayType: string, userId: number = DEFAULT_USER_ID): Promise<CoachPlanRow[]> {
            return dbInstance
                .select()
                .from(coachPlan)
                .where(and(eq(coachPlan.user_id, userId), eq(coachPlan.day_type, dayType)))
                .orderBy(asc(coachPlan.position));
        },

        // Replace the whole plan for one user's day-type atomically (delete + insert).
        async replaceDayType(
            dayType: string,
            rows: CoachPlanInput[],
            userId: number = DEFAULT_USER_ID
        ): Promise<CoachPlanRow[]> {
            return dbInstance.transaction(async (tx) => {
                await tx
                    .delete(coachPlan)
                    .where(and(eq(coachPlan.user_id, userId), eq(coachPlan.day_type, dayType)));
                if (rows.length === 0) return [];
                return tx
                    .insert(coachPlan)
                    .values(rows.map((r) => ({ ...r, day_type: dayType, user_id: userId })))
                    .returning();
            });
        },
    };
}
