import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { gyms, sessions } from "../schema";

export interface GymRow {
  id: number;
  user_id: number;
  name: string;
  created_at: string | null;
  /** Latest session bound to this gym — present on list() (drives the
   * last-used default order); single-row fetches omit it. */
  last_used_at?: string | null;
}

export function createGymsRepository(dbInstance: PostgresJsDatabase) {
  async function list(userId: number): Promise<GymRow[]> {
    // Most-recently-used first: the picker's default is the top row.
    return dbInstance
      .select({
        id: gyms.id,
        user_id: gyms.user_id,
        name: gyms.name,
        created_at: gyms.created_at,
        last_used_at: sql<string | null>`max(${sessions.created_at})`,
      })
      .from(gyms)
      .leftJoin(sessions, eq(sessions.gym_id, gyms.id))
      .where(eq(gyms.user_id, userId))
      .groupBy(gyms.id)
      .orderBy(desc(sql`max(${sessions.created_at})`), asc(gyms.created_at));
  }

  async function findByIdAndUser(id: number, userId: number): Promise<GymRow | null> {
    const [row] = await dbInstance
      .select()
      .from(gyms)
      .where(and(eq(gyms.id, id), eq(gyms.user_id, userId)))
      .limit(1);
    return row ?? null;
  }

  /** Find a gym by exact name for the user, creating it on first use. */
  async function findOrCreateByName(name: string, userId: number): Promise<GymRow> {
    const trimmed = name.trim();

    const [inserted] = await dbInstance
      .insert(gyms)
      .values({ user_id: userId, name: trimmed })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted;

    const [existing] = await dbInstance
      .select()
      .from(gyms)
      .where(and(eq(gyms.user_id, userId), eq(gyms.name, trimmed)))
      .limit(1);
    if (!existing) {
      throw new Error("Gym insert conflicted but no existing row found.");
    }
    return existing;
  }

  return { list, findByIdAndUser, findOrCreateByName };
}
