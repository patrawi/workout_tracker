import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import db from "../db/client";
import { mapWorkoutRow } from "../db/mappers";
import { sessions, workouts } from "../schema";
import type { WorkoutData, WorkoutRow } from "../types";

export interface WorkoutUpdateData {
  exercise_name?: string;
  weight?: number;
  reps?: number;
  rpe?: number;
  is_bodyweight?: boolean;
  is_assisted?: boolean;
  variant_details?: string;
  notes_thai?: string;
  notes_english?: string;
  tags?: string[];
  muscle_group?: string;
}

function daysBackCondition(daysBack: number) {
  return gte(
    workouts.created_at,
    sql`now() - interval '${sql.raw(String(daysBack))} days'`,
  );
}

export async function getRecentWorkouts(limit = 50): Promise<WorkoutRow[]> {
  const rows = await db
    .select()
    .from(workouts)
    .orderBy(desc(workouts.created_at), desc(workouts.id))
    .limit(limit);

  return rows.map(mapWorkoutRow);
}

export async function insertWorkouts(
  rawInput: string,
  items: WorkoutData[],
  createdAt: string,
): Promise<WorkoutRow[]> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({ raw_input: rawInput, created_at: createdAt })
      .returning({ id: sessions.id });

    if (!session) {
      throw new Error("Failed to insert session row");
    }

    const newRows: WorkoutRow[] = [];

    for (const item of items) {
      const [inserted] = await tx
        .insert(workouts)
        .values({
          session_id: session.id,
          exercise_name: item.exercise_name,
          weight: item.weight ?? 0,
          reps: item.reps ?? 0,
          rpe: item.rpe ?? 0,
          is_bodyweight: item.is_bodyweight ?? false,
          is_assisted: item.is_assisted ?? false,
          variant_details: item.variant_details ?? "",
          notes_thai: item.notes_thai ?? "",
          notes_english: item.notes_english ?? "",
          tags: item.tags ?? [],
          muscle_group: item.muscle_group ?? "Other",
          created_at: createdAt,
        })
        .returning();

      if (!inserted) {
        throw new Error("Failed to insert workout row");
      }

      newRows.push(mapWorkoutRow(inserted));
    }

    return newRows;
  });
}

export async function getDistinctExercises(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ exercise_name: workouts.exercise_name })
    .from(workouts)
    .orderBy(workouts.exercise_name);

  return rows.map((row) => row.exercise_name);
}

export async function getWorkoutsByExercise(
  exercise: string,
  daysBack = 0,
): Promise<WorkoutRow[]> {
  const conditions = [eq(workouts.exercise_name, exercise)];

  if (daysBack > 0) {
    conditions.push(daysBackCondition(daysBack));
  }

  const rows = await db
    .select()
    .from(workouts)
    .where(and(...conditions))
    .orderBy(workouts.created_at);

  return rows.map(mapWorkoutRow);
}

export async function getRecentNotes(
  exercise: string,
  limit = 5,
): Promise<WorkoutRow[]> {
  const rows = await db
    .select()
    .from(workouts)
    .where(
      and(
        eq(workouts.exercise_name, exercise),
        sql`(${workouts.notes_thai} != '' OR ${workouts.notes_english} != '')`,
      ),
    )
    .orderBy(desc(workouts.created_at))
    .limit(limit);

  return rows.map(mapWorkoutRow);
}

export async function getWorkoutDates(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT DATE(created_at) as date_val
    FROM workouts
    ORDER BY date_val DESC
  `);

  return result
    .map((row) => {
      if (!row.date_val) return "";
      return String(row.date_val).split("T")[0] ?? "";
    })
    .filter(Boolean);
}

export async function getWorkoutsByDate(date: string): Promise<WorkoutRow[]> {
  const rows = await db
    .select()
    .from(workouts)
    .where(eq(sql`DATE(${workouts.created_at})`, date))
    .orderBy(asc(workouts.id));

  return rows.map(mapWorkoutRow);
}

export async function updateWorkout(
  id: number,
  data: WorkoutUpdateData,
): Promise<WorkoutRow | null> {
  const updateObj: Record<string, unknown> = {};

  if (data.exercise_name !== undefined)
    updateObj.exercise_name = data.exercise_name;
  if (data.weight !== undefined) updateObj.weight = data.weight;
  if (data.reps !== undefined) updateObj.reps = data.reps;
  if (data.rpe !== undefined) updateObj.rpe = data.rpe;
  if (data.is_bodyweight !== undefined)
    updateObj.is_bodyweight = data.is_bodyweight;
  if (data.is_assisted !== undefined) updateObj.is_assisted = data.is_assisted;
  if (data.variant_details !== undefined)
    updateObj.variant_details = data.variant_details;
  if (data.notes_thai !== undefined) updateObj.notes_thai = data.notes_thai;
  if (data.notes_english !== undefined)
    updateObj.notes_english = data.notes_english;
  if (data.tags !== undefined) updateObj.tags = data.tags;
  if (data.muscle_group !== undefined)
    updateObj.muscle_group = data.muscle_group;

  if (Object.keys(updateObj).length === 0) {
    return null;
  }

  const [updated] = await db
    .update(workouts)
    .set(updateObj)
    .where(eq(workouts.id, id))
    .returning();

  return updated ? mapWorkoutRow(updated) : null;
}

export async function deleteWorkout(id: number): Promise<boolean> {
  const deleted = await db
    .delete(workouts)
    .where(eq(workouts.id, id))
    .returning({ id: workouts.id });

  return deleted.length > 0;
}

export async function insertWorkout(
  item: WorkoutData,
  createdAt: string,
  existingSessionId?: number,
): Promise<WorkoutRow> {
  return db.transaction(async (tx) => {
    let sessionId: number;

    if (existingSessionId !== undefined) {
      // Use existing session
      sessionId = existingSessionId;
    } else {
      // Create new session
      const [session] = await tx
        .insert(sessions)
        .values({ raw_input: "[manual entry]", created_at: createdAt })
        .returning({ id: sessions.id });

      if (!session) {
        throw new Error("Failed to insert session row");
      }
      sessionId = session.id;
    }

    const [inserted] = await tx
      .insert(workouts)
      .values({
        session_id: sessionId,
        exercise_name: item.exercise_name,
        weight: item.weight ?? 0,
        reps: item.reps ?? 0,
        rpe: item.rpe ?? 0,
        is_bodyweight: item.is_bodyweight ?? false,
        is_assisted: item.is_assisted ?? false,
        variant_details: item.variant_details ?? "",
        notes_thai: item.notes_thai ?? "",
        notes_english: item.notes_english ?? "",
        tags: item.tags ?? [],
        muscle_group: item.muscle_group ?? "Other",
        created_at: createdAt,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert workout row");
    }

    return mapWorkoutRow(inserted);
  });
}
