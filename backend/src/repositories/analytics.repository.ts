import { desc, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { restDays, workouts } from "../schema";

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
    async getHeatmap(): Promise<HeatmapDay[]> {
      const workoutRows = await dbInstance
        .select({
          date: sql<string>`DATE(${workouts.created_at})`.as("date"),
          count: sql<number>`COUNT(*)::int`.as("count"),
        })
        .from(workouts)
        .where(gte(workouts.created_at, sql`now() - interval '365 days'`))
        .groupBy(sql`DATE(${workouts.created_at})`);

      const restRows = await dbInstance
        .select()
        .from(restDays)
        .where(gte(restDays.created_at, sql`now() - interval '365 days'`));

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

    async getVolume(daysBack = 7): Promise<VolumeData[]> {
      const rows = await dbInstance
        .select({
          muscle_group: workouts.muscle_group,
          sets: sql<number>`COUNT(*)::int`.as("sets"),
        })
        .from(workouts)
        .where(
          gte(workouts.created_at, sql`now() - interval '${sql.raw(String(daysBack))} days'`),
        )
        .groupBy(workouts.muscle_group)
        .orderBy(desc(sql`COUNT(*)`));

      return rows.map((row) => ({
        muscle_group: String(row.muscle_group),
        sets: Number(row.sets),
      }));
    },

    async getVolumeTrend(daysBack = 14): Promise<VolumeTrendData[]> {
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
        .where(gte(workouts.created_at, sql`now() - interval '${twoN} days'`))
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
