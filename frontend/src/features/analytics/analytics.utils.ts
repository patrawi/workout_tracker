import type { WorkoutRow } from "@/types";
import { formatDate } from "@/lib/date-utils";

/**
 * Compute Estimated 1-Rep Max using Brzycki formula
 */
export function computeE1RM(weight: number, reps: number): number {
    if (reps <= 0 || weight <= 0) return 0;
    return Math.round((weight * reps * 0.0333 + weight) * 10) / 10;
}

/**
 * Get the effective weight for a set.
 * - Bodyweight exercise (weight logged = 0): use profile bodyweight.
 * - Assisted machine: logged weight is counterweight.
 *   True load = bodyweight - assistance. More assistance = lighter = easier.
 * - Normal exercise: logged weight is the actual load.
 */
export function effectiveWeight(set: WorkoutRow, profileWeight: number): number {
    if (set.is_assisted && profileWeight > 0) {
        return Number(Math.max(0, profileWeight - set.weight).toFixed(2));
    }
    if (set.is_bodyweight && set.weight === 0 && profileWeight > 0) {
        return profileWeight;
    }
    return set.weight;
}

/**
 * Group workouts by date into "sessions"
 */
export function groupBySession(
    workouts: WorkoutRow[]
): Map<string, WorkoutRow[]> {
    const sessions = new Map<string, WorkoutRow[]>();
    for (const w of workouts) {
        const dateKey = w.created_at.split("T")[0] ?? w.created_at.split(" ")[0];
        const existing = sessions.get(dateKey) ?? [];
        existing.push(w);
        sessions.set(dateKey, existing);
    }
    return sessions;
}

/**
 * Build strength data for charts (max weight per session)
 */
export function buildStrengthData(
    workouts: WorkoutRow[],
    profileWeight: number
): { date: string; maxWeight: number }[] {
    const sessions = groupBySession(workouts);
    return Array.from(sessions.entries()).map(([date, sets]) => {
        const maxWeight = Math.max(
            ...sets.map((s) => effectiveWeight(s, profileWeight))
        );
        return { date: formatDate(date), maxWeight };
    });
}

/**
 * Build volume data for charts (weight × reps per session)
 */
export function buildVolumeData(
    workouts: WorkoutRow[],
    profileWeight: number
): { date: string; volume: number }[] {
    const sessions = groupBySession(workouts);
    return Array.from(sessions.entries()).map(([date, sets]) => {
        const volume = sets.reduce(
            (sum, s) => sum + effectiveWeight(s, profileWeight) * s.reps,
            0
        );
        return { date: formatDate(date), volume: Math.round(volume) };
    });
}

/**
 * Build effort data for charts (weight + avg RPE per session)
 */
export function buildEffortData(
    workouts: WorkoutRow[],
    profileWeight: number
): { date: string; weight: number; rpe: number }[] {
    const sessions = groupBySession(workouts);
    return Array.from(sessions.entries()).map(([date, sets]) => {
        const maxWeight = Math.max(
            ...sets.map((s) => effectiveWeight(s, profileWeight))
        );
        const rpeSets = sets.filter((s) => s.rpe > 0);
        const avgRpe =
            rpeSets.length > 0
                ? Math.round(
                    (rpeSets.reduce((s, w) => s + w.rpe, 0) / rpeSets.length) * 10
                ) / 10
                : 0;
        return { date: formatDate(date), weight: maxWeight, rpe: avgRpe };
    });
}

/**
 * Compute KPI metrics from workouts
 */
export function computeKPIs(
    workouts: WorkoutRow[],
    profileWeight: number
): {
    maxWeight: number;
    e1rm: number;
    maxVolume: number;
    totalSessions: number;
} {
    if (workouts.length === 0) {
        return { maxWeight: 0, e1rm: 0, maxVolume: 0, totalSessions: 0 };
    }

    const maxWeight = Math.max(
        ...workouts.map((w) => effectiveWeight(w, profileWeight))
    );

    const bestE1RM = Math.max(
        ...workouts.map((w) =>
            computeE1RM(effectiveWeight(w, profileWeight), w.reps)
        )
    );

    const sessions = groupBySession(workouts);
    const volumes = Array.from(sessions.values()).map((sets) =>
        sets.reduce(
            (sum, s) => sum + effectiveWeight(s, profileWeight) * s.reps,
            0
        )
    );
    const maxVolume = Math.max(...volumes);

    return {
        maxWeight,
        e1rm: bestE1RM,
        maxVolume: Math.round(maxVolume),
        totalSessions: sessions.size,
    };
}
