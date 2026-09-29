import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { gyms } from "../schema";

export interface GymRow {
  id: number;
  user_id: number;
  name: string;
  created_at: string | null;
}

export function createGymsRepository(dbInstance: PostgresJsDatabase) {
  async function list(userId: number): Promise<GymRow[]> {
    return dbInstance
      .select()
      .from(gyms)
      .where(eq(gyms.user_id, userId))
      .orderBy(asc(gyms.created_at), asc(gyms.id));
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
