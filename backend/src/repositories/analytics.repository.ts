import { desc, gte, sql } from "drizzle-orm";
import db from "../db/client";
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

export async function getWorkoutHeatmap(): Promise<HeatmapDay[]> {
  const workoutRows = await db
    .select({
      date: sql<string>`DATE(${workouts.created_at})`.as("date"),
      count: sql<number>`COUNT(*)::int`.as("count"),
    })
    .from(workouts)
    .where(gte(workouts.created_at, sql`now() - interval '365 days'`))
    .groupBy(sql`DATE(${workouts.created_at})`);

  const restRows = await db
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
}

export async function getVolumeAnalytics(daysBack = 7): Promise<VolumeData[]> {
  const rows = await db
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
}
