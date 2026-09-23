import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { restDays, workouts } from "../schema";

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export interface HeatmapDay {
  date: string;
  count: number;
  isRestDay: boolean;
  walked_10k: boolean;
  did_liss: boolean;
  did_stretch: boolean;
}

export interface VolumeData {
  muscle_group: string;
  sets: number;
}

// Muscle-detail drill-down (mobile s7): per-group 7-day activity, an 8-week
// volume series (week = date_trunc('week', created_at), Monday-anchored), and
// the exercises actually played in the window with their top weight.
export interface MuscleWeeklyVolume {
  week_start: string; // "YYYY-MM-DD"
  volume_load: number;
}

export interface MuscleExerciseUsage {
  name: string;
  top_weight: number;
  sets: number;
}

export interface MuscleDetail {
  muscle_group: string;
  sets_7d: number;
  exercises_7d: number;
  weekly_volume: MuscleWeeklyVolume[];
  exercises: MuscleExerciseUsage[];
}

// Spec §4.2: Volume Load = weight × reps × sets. Two adjacent equal windows
// ([0,N] vs [N,2N]) with the delta computed here (deterministic, §6.2) so the
// LLM never does the subtraction itself.
export interface VolumeTrendData {
  muscle_group: string;
  current_volume_load: number;
  previous_volume_load: number;
  current_sets: number;
  previous_sets: number;
  delta_pct: number | null; // volume-load based; null when previous window is 0
}

export function createAnalyticsRepository(dbInstance: PostgresJsDatabase) {
  return {
    async getHeatmap(userId: number = DEFAULT_USER_ID): Promise<HeatmapDay[]> {
      const workoutRows = await dbInstance
        .select({
          date: sql<string>`DATE(${workouts.created_at})`.as("date"),
          count: sql<number>`COUNT(*)::int`.as("count"),
        })
        .from(workouts)
        .where(
          and(
            eq(workouts.user_id, userId),
            gte(workouts.created_at, sql`now() - interval '365 days'`),
          ),
        )
        .groupBy(sql`DATE(${workouts.created_at})`);

      const restRows = await dbInstance
        .select()
        .from(restDays)
        .where(
          and(
            eq(restDays.user_id, userId),
            gte(restDays.created_at, sql`now() - interval '365 days'`),
          ),
        );

      const dayMap = new Map<string, HeatmapDay>();

      for (const row of workoutRows) {
        const date = String(row.date);
        dayMap.set(date, {
          date,
          count: Number(row.count),
          isRestDay: false,
          walked_10k: false,
          did_liss: false,
          did_stretch: false,
        });
      }

      for (const row of restRows) {
        const existing = dayMap.get(row.date);
        if (existing) {
          existing.isRestDay = true;
          existing.walked_10k = row.walked_10k ?? false;
          existing.did_liss = row.did_liss ?? false;
          existing.did_stretch = row.did_stretch ?? false;
          continue;
        }
        dayMap.set(row.date, {
          date: row.date,
          count: 0,
          isRestDay: true,
          walked_10k: row.walked_10k ?? false,
          did_liss: row.did_liss ?? false,
          did_stretch: row.did_stretch ?? false,
        });
      }

      return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    },

    async getVolume(daysBack = 7, userId: number = DEFAULT_USER_ID): Promise<VolumeData[]> {
      const rows = await dbInstance
        .select({
          muscle_group: workouts.muscle_group,
          sets: sql<number>`COUNT(*)::int`.as("sets"),
        })
        .from(workouts)
        .where(
          and(
            eq(workouts.user_id, userId),
            gte(workouts.created_at, sql`now() - interval '${sql.raw(String(daysBack))} days'`),
          ),
        )
        .groupBy(workouts.muscle_group)
        .orderBy(desc(sql`COUNT(*)`));

      return rows.map((row) => ({
        muscle_group: String(row.muscle_group),
        sets: Number(row.sets),
      }));
    },

    async getMuscleDetail(group: string, userId: number = DEFAULT_USER_ID): Promise<MuscleDetail> {
      const groupMatch = sql`lower(${workouts.muscle_group}) = lower(${group})`;
      const weeklyRows = await dbInstance
        .select({
          week: sql<string>`to_char(date_trunc('week', ${workouts.created_at}), 'YYYY-MM-DD')`.as("week"),
          volume: sql<number>`COALESCE(SUM(${workouts.weight} * ${workouts.reps}), 0)`.as("volume"),
        })
        .from(workouts)
        .where(
          and(
            eq(workouts.user_id, userId),
            groupMatch,
            gte(workouts.created_at, sql`now() - interval '56 days'`),
          ),
        )
        .groupBy(sql`date_trunc('week', ${workouts.created_at})`)
        .orderBy(sql`date_trunc('week', ${workouts.created_at})`);

      const exerciseRows = await dbInstance
        .select({
          name: workouts.exercise_name,
          top_weight: sql<number>`MAX(${workouts.weight})`.as("top_weight"),
          sets: sql<number>`COUNT(*)::int`.as("sets"),
        })
        .from(workouts)
        .where(
          and(
            eq(workouts.user_id, userId),
            groupMatch,
            gte(workouts.created_at, sql`now() - interval '56 days'`),
          ),
        )
        .groupBy(workouts.exercise_name)
        .orderBy(desc(sql`COUNT(*)`));

      const [recent] = await dbInstance
        .select({
          sets: sql<number>`COUNT(*)::int`.as("sets"),
          exercises: sql<number>`COUNT(DISTINCT ${workouts.exercise_name})::int`.as("exercises"),
        })
        .from(workouts)
        .where(
          and(
            eq(workouts.user_id, userId),
            groupMatch,
            gte(workouts.created_at, sql`now() - interval '7 days'`),
          ),
        );

      return {
        muscle_group: group,
        sets_7d: Number(recent?.sets ?? 0),
        exercises_7d: Number(recent?.exercises ?? 0),
        weekly_volume: weeklyRows.map((row) => ({
          week_start: String(row.week),
          volume_load: Number(row.volume),
        })),
        exercises: exerciseRows.map((row) => ({
          name: String(row.name),
          top_weight: Number(row.top_weight ?? 0),
          sets: Number(row.sets),
        })),
      };
    },

    async getVolumeTrend(daysBack = 14, userId: number = DEFAULT_USER_ID): Promise<VolumeTrendData[]> {
      const n = sql.raw(String(daysBack));
      const twoN = sql.raw(String(daysBack * 2));
      const inCurrent = sql`${workouts.created_at} >= now() - interval '${n} days'`;
      const inPrevious = sql`${workouts.created_at} >= now() - interval '${twoN} days' AND ${workouts.created_at} < now() - interval '${n} days'`;

      const rows = await dbInstance
        .select({
          muscle_group: workouts.muscle_group,
          current_volume_load: sql<number>`COALESCE(SUM(${workouts.weight} * ${workouts.reps}) FILTER (WHERE ${inCurrent}), 0)`.as(
            "current_volume_load",
          ),
          previous_volume_load: sql<number>`COALESCE(SUM(${workouts.weight} * ${workouts.reps}) FILTER (WHERE ${inPrevious}), 0)`.as(
            "previous_volume_load",
          ),
          current_sets: sql<number>`COUNT(*) FILTER (WHERE ${inCurrent})::int`.as("current_sets"),
          previous_sets: sql<number>`COUNT(*) FILTER (WHERE ${inPrevious})::int`.as("previous_sets"),
        })
        .from(workouts)
        .where(
          and(
            eq(workouts.user_id, userId),
            gte(workouts.created_at, sql`now() - interval '${twoN} days'`),
          ),
        )
        .groupBy(workouts.muscle_group)
        .orderBy(desc(sql`COALESCE(SUM(${workouts.weight} * ${workouts.reps}) FILTER (WHERE ${inCurrent}), 0)`));

      return rows.map((row) => {
        const current = Math.round(Number(row.current_volume_load));
        const previous = Math.round(Number(row.previous_volume_load));
        return {
          muscle_group: String(row.muscle_group),
          current_volume_load: current,
          previous_volume_load: previous,
          current_sets: Number(row.current_sets),
          previous_sets: Number(row.previous_sets),
          delta_pct: previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10,
        };
      });
    },
  };
}
