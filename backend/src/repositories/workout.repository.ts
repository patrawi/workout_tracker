import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { withWorkoutDefaults, defaultString } from "../lib/defaults";
import { mapWorkoutRow } from "../db/mappers";
import { DEFAULT_GYM_PROFILE, DEFAULT_SESSION_TYPE } from "../constants";
import type { SessionType } from "../constants";
import { sessions, workouts } from "../schema";
import type { WorkoutData, WorkoutRow, SessionActivityData } from "../types";

// One set's row inside an exercise-history session (spec §4 overload assessment).
export interface ExerciseContextSet {
  weight: number;
  reps: number;
  rpe: number;
  pain: boolean;
  notes_thai: string;
  notes_english: string;
}

export interface ExerciseSessionContext {
  session_id: number;
  created_at: string;
  session_type: SessionType;
  gym_profile: string;
  sets: ExerciseContextSet[];
}

export interface SessionExercise {
  exercise_name: string;
  weight: number;
  reps: number;
  rpe: number;
  is_bodyweight: boolean;
  muscle_group: string;
}

export interface SessionWithWorkouts {
  session_id: number;
  created_at: string | null;
  session_type: SessionType;
  gym_profile: string;
  workouts: SessionExercise[];
}

export interface WorkoutUpdateData {
  exercise_name?: string;
  weight?: number;
  reps?: number;
  rpe?: number;
  is_bodyweight?: boolean;
  is_assisted?: boolean;
  pain?: boolean;
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

function mapWorkoutRowWithSession(
  row: typeof workouts.$inferSelect,
  session: { session_type: SessionType; gym_profile: string },
): WorkoutRow {
  return {
    ...mapWorkoutRow(row),
    session_type: session.session_type,
    gym_profile: session.gym_profile || DEFAULT_GYM_PROFILE,
  };
}

// ─── Factory Pattern ─────────────────────────────────────────────────────────

export function createWorkoutRepository(dbInstance: PostgresJsDatabase) {
  async function hydrateSessions(
    sess: { id: number; created_at: string | null; session_type: SessionType; gym_profile: string }[],
  ): Promise<SessionWithWorkouts[]> {
    if (sess.length === 0) return [];

    const ids = sess.map((s) => s.id);
    const rows = await dbInstance
      .select()
      .from(workouts)
      .where(inArray(workouts.session_id, ids))
      .orderBy(asc(workouts.session_id), asc(workouts.id));

    const grouped = new Map<number, SessionExercise[]>();
    for (const r of rows) {
      const list = grouped.get(r.session_id) ?? [];
      list.push({
        exercise_name: r.exercise_name,
        weight: r.weight ?? 0,
        reps: r.reps ?? 0,
        rpe: r.rpe ?? 0,
        is_bodyweight: r.is_bodyweight ?? false,
        muscle_group: r.muscle_group,
      });
      grouped.set(r.session_id, list);
    }

    return sess.map((s) => ({
      session_id: s.id,
      created_at: s.created_at,
      session_type: s.session_type,
      gym_profile: s.gym_profile,
      workouts: grouped.get(s.id) ?? [],
    }));
  }

  return {
    async getRecent(limit = 50): Promise<WorkoutRow[]> {
      const rows = await dbInstance
        .select({
          workout: workouts,
          session_type: sessions.session_type,
          gym_profile: sessions.gym_profile,
        })
        .from(workouts)
        .innerJoin(sessions, eq(workouts.session_id, sessions.id))
        .orderBy(desc(workouts.created_at), desc(workouts.id))
        .limit(limit);

      return rows.map((row) =>
        mapWorkoutRowWithSession(row.workout, {
          session_type: row.session_type,
          gym_profile: row.gym_profile,
        }),
      );
    },

    async getByDate(date: string): Promise<WorkoutRow[]> {
      const rows = await dbInstance
        .select({
          workout: workouts,
          session_type: sessions.session_type,
          gym_profile: sessions.gym_profile,
        })
        .from(workouts)
        .innerJoin(sessions, eq(workouts.session_id, sessions.id))
        .where(eq(sql`DATE(${workouts.created_at})`, date))
        .orderBy(asc(workouts.id));

      return rows.map((row) =>
        mapWorkoutRowWithSession(row.workout, {
          session_type: row.session_type,
          gym_profile: row.gym_profile,
        }),
      );
    },

    async getDates(): Promise<string[]> {
      const result = await dbInstance.execute(sql`
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
    },

    async create(item: WorkoutData, createdAt: string, existingSessionId?: number): Promise<WorkoutRow> {
      return dbInstance.transaction(async (tx) => {
        let sessionId: number;

        if (existingSessionId !== undefined) {
          sessionId = existingSessionId;
        } else {
          const [session] = await tx
            .insert(sessions)
            .values({ raw_input: "[manual entry]", created_at: createdAt, gym_profile: DEFAULT_GYM_PROFILE })
            .returning({ id: sessions.id });

          if (!session) {
            throw new Error("Failed to insert session row");
          }
          sessionId = session.id;
        }

        const defaulted = withWorkoutDefaults(item as unknown as Record<string, unknown>);

        const [inserted] = await tx
          .insert(workouts)
          .values({
            session_id: sessionId,
            exercise_name: defaulted.exercise_name,
            weight: defaulted.weight,
            reps: defaulted.reps,
            rpe: defaulted.rpe,
            is_bodyweight: defaulted.is_bodyweight,
            is_assisted: defaulted.is_assisted,
            pain: defaulted.pain,
            variant_details: defaulted.variant_details,
            notes_thai: defaulted.notes_thai,
            notes_english: defaulted.notes_english,
            tags: defaulted.tags,
            muscle_group: defaulted.muscle_group,
            created_at: createdAt,
          })
          .returning();

        if (!inserted) {
          throw new Error("Failed to insert workout row");
        }

        return mapWorkoutRow(inserted);
      });
    },

    async update(id: number, data: WorkoutUpdateData): Promise<WorkoutRow | null> {
      const updateObj: Record<string, unknown> = {};

      if (data.exercise_name !== undefined)
        updateObj.exercise_name = data.exercise_name;
      if (data.weight !== undefined) updateObj.weight = data.weight;
      if (data.reps !== undefined) updateObj.reps = data.reps;
      if (data.rpe !== undefined) updateObj.rpe = data.rpe;
      if (data.is_bodyweight !== undefined)
        updateObj.is_bodyweight = data.is_bodyweight;
      if (data.is_assisted !== undefined) updateObj.is_assisted = data.is_assisted;
      if (data.pain !== undefined) updateObj.pain = data.pain;
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

      const [updated] = await dbInstance
        .update(workouts)
        .set(updateObj)
        .where(eq(workouts.id, id))
        .returning();

      return updated ? mapWorkoutRow(updated) : null;
    },

    async delete(id: number): Promise<boolean> {
      const deleted = await dbInstance
        .delete(workouts)
        .where(eq(workouts.id, id))
        .returning({ id: workouts.id });

      return deleted.length > 0;
    },

    async createBatch(rawInput: string, items: WorkoutData[], createdAt: string, activity?: SessionActivityData): Promise<WorkoutRow[]> {
      return dbInstance.transaction(async (tx) => {
        const [session] = await tx
          .insert(sessions)
          .values({
            raw_input: rawInput,
            created_at: createdAt,
            walked_10k: activity?.walked_10k ?? false,
            did_liss: activity?.did_liss ?? false,
            did_stretch: activity?.did_stretch ?? false,
            notes: activity?.notes ?? "",
            session_type: activity?.session_type ?? DEFAULT_SESSION_TYPE,
            gym_profile: activity?.gym_profile || DEFAULT_GYM_PROFILE,
          })
          .returning({ id: sessions.id });

        if (!session) {
          throw new Error("Failed to insert session row");
        }

        const newRows: WorkoutRow[] = [];

        for (const item of items) {
          const defaulted = withWorkoutDefaults(item as unknown as Record<string, unknown>);

          const [inserted] = await tx
            .insert(workouts)
            .values({
              session_id: session.id,
              exercise_name: defaulted.exercise_name,
              weight: defaulted.weight,
              reps: defaulted.reps,
              rpe: defaulted.rpe,
              is_bodyweight: defaulted.is_bodyweight,
              is_assisted: defaulted.is_assisted,
              pain: defaulted.pain,
              variant_details: defaulted.variant_details,
              notes_thai: defaulted.notes_thai,
              notes_english: defaulted.notes_english,
              tags: defaulted.tags,
              muscle_group: defaulted.muscle_group,
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
    },

    async getDistinctExercises(): Promise<string[]> {
      const rows = await dbInstance
        .selectDistinct({ exercise_name: workouts.exercise_name })
        .from(workouts)
        .orderBy(workouts.exercise_name);

      return rows.map((row) => row.exercise_name);
    },

    async getByExercise(exercise: string, daysBack = 0): Promise<WorkoutRow[]> {
      const conditions = [eq(workouts.exercise_name, exercise)];

      if (daysBack > 0) {
        conditions.push(daysBackCondition(daysBack));
      }

      const rows = await dbInstance
        .select()
        .from(workouts)
        .where(and(...conditions))
        .orderBy(workouts.created_at);

      return rows.map(mapWorkoutRow);
    },

    // Recent sessions, each with its workout rows — used to derive day-type and
    // pull the latest actual sets for a given Push/Pull/Legs session.
    async getRecentSessionsWithWorkouts(limit = 30): Promise<SessionWithWorkouts[]> {
      const sess = await dbInstance
        .select({
          id: sessions.id,
          created_at: sessions.created_at,
          session_type: sessions.session_type,
          gym_profile: sessions.gym_profile,
        })
        .from(sessions)
        .orderBy(desc(sessions.created_at), desc(sessions.id))
        .limit(limit);

      return hydrateSessions(sess);
    },

    async getSessionWithWorkouts(sessionId: number): Promise<SessionWithWorkouts | null> {
      const sess = await dbInstance
        .select({
          id: sessions.id,
          created_at: sessions.created_at,
          session_type: sessions.session_type,
          gym_profile: sessions.gym_profile,
        })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      return (await hydrateSessions(sess))[0] ?? null;
    },

    async getSessionsBefore(sessionId: number, scanLimit = 80): Promise<SessionWithWorkouts[]> {
      const [boundary] = await dbInstance
        .select({ id: sessions.id, created_at: sessions.created_at })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      if (!boundary) return [];

      const sess = await dbInstance
        .select({
          id: sessions.id,
          created_at: sessions.created_at,
          session_type: sessions.session_type,
          gym_profile: sessions.gym_profile,
        })
        .from(sessions)
        .where(sql`(${sessions.created_at}, ${sessions.id}) < (${boundary.created_at}, ${boundary.id})`)
        .orderBy(desc(sessions.created_at), desc(sessions.id))
        .limit(scanLimit);

      return hydrateSessions(sess);
    },

    // Progressive overload (spec §4): one exercise's sets grouped by session with
    // session-level context (session_type, gym_profile). Most-recent session first.
    async getExerciseSetsWithContext(
      exercise: string,
      sessionLimit = 12,
      asOfSessionId?: number,
    ): Promise<ExerciseSessionContext[]> {
      const conditions = [eq(workouts.exercise_name, exercise)];

      if (asOfSessionId !== undefined) {
        const [boundary] = await dbInstance
          .select({ id: sessions.id, created_at: sessions.created_at })
          .from(sessions)
          .where(eq(sessions.id, asOfSessionId))
          .limit(1);

        if (!boundary) return [];
        conditions.push(sql`(${sessions.created_at}, ${sessions.id}) <= (${boundary.created_at}, ${boundary.id})`);
      }

      const rows = await dbInstance
        .select({
          session_id: workouts.session_id,
          created_at: sessions.created_at,
          session_type: sessions.session_type,
          gym_profile: sessions.gym_profile,
          weight: workouts.weight,
          reps: workouts.reps,
          rpe: workouts.rpe,
          pain: workouts.pain,
          notes_thai: workouts.notes_thai,
          notes_english: workouts.notes_english,
          id: workouts.id,
        })
        .from(workouts)
        .innerJoin(sessions, eq(workouts.session_id, sessions.id))
        .where(and(...conditions))
        .orderBy(desc(sessions.created_at), desc(sessions.id), asc(workouts.id));

      // Group into sessions, preserving most-recent-first order, then cap.
      const order: number[] = [];
      const grouped = new Map<number, ExerciseSessionContext>();
      for (const r of rows) {
        let g = grouped.get(r.session_id);
        if (!g) {
          g = {
            session_id: r.session_id,
            created_at: defaultString(r.created_at),
            session_type: r.session_type,
            gym_profile: r.gym_profile,
            sets: [],
          };
          grouped.set(r.session_id, g);
          order.push(r.session_id);
        }
        g.sets.push({
          weight: r.weight ?? 0,
          reps: r.reps ?? 0,
          rpe: r.rpe ?? 0,
          pain: r.pain ?? false,
          notes_thai: r.notes_thai ?? "",
          notes_english: r.notes_english ?? "",
        });
      }

      return order.slice(0, sessionLimit).map((id) => grouped.get(id)!);
    },

    async getRecentNotes(exercise: string, limit = 5): Promise<WorkoutRow[]> {
      const rows = await dbInstance
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
    },
  };
}
