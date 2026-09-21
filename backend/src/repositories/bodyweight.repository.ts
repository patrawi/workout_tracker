import { and, asc, eq, gte, sql } from "drizzle-orm";import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mapBodyweightLogRow } from "../db/mappers";
import { bodyweightLogs } from "../schema";

export interface BodyweightLogRow {
  id: number;
  date: string;
  weight_kg: number;
  created_at: string;
}

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export function createBodyweightRepository(dbInstance: PostgresJsDatabase) {
  return {
    async insert(date: string, weight_kg: number, userId: number = DEFAULT_USER_ID): Promise<void> {
      await dbInstance
        .insert(bodyweightLogs)
        .values({ user_id: userId, date, weight_kg })
        .onConflictDoUpdate({
          target: [bodyweightLogs.user_id, bodyweightLogs.date],
          set: { weight_kg },
        });
    },

    async getAll(daysBack = 0, userId: number = DEFAULT_USER_ID): Promise<BodyweightLogRow[]> {
      const conditions = [eq(bodyweightLogs.user_id, userId)];

      if (daysBack > 0) {
        conditions.push(
          gte(
            bodyweightLogs.created_at,
            sql`now() - interval '${sql.raw(String(daysBack))} days'`,
          ),
        );
      }

      const rows = await dbInstance
        .select()
        .from(bodyweightLogs)
        .where(and(...conditions))
        .orderBy(asc(bodyweightLogs.date));
      return rows.map(mapBodyweightLogRow);
    },
  };
}
