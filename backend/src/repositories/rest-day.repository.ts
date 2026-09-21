import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { restDays } from "../schema";

export interface RestDayInput {
  date: string;
  walked_10k?: boolean;
  did_liss?: boolean;
  did_stretch?: boolean;
  notes?: string;
}

export interface RestDayRow {
  id: number;
  date: string;
  walked_10k: boolean;
  did_liss: boolean;
  did_stretch: boolean;
  notes: string;
  created_at: string;
}

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

function mapRestDayRow(row: typeof restDays.$inferSelect): RestDayRow {
  return {
    id: row.id,
    date: row.date,
    walked_10k: row.walked_10k ?? false,
    did_liss: row.did_liss ?? false,
    did_stretch: row.did_stretch ?? false,
    notes: row.notes ?? "",
    created_at: row.created_at ?? "",
  };
}

export function createRestDayRepository(dbInstance: PostgresJsDatabase) {
  return {
    async upsert(data: RestDayInput, userId: number = DEFAULT_USER_ID): Promise<RestDayRow> {
      const [row] = await dbInstance
        .insert(restDays)
        .values({
          user_id: userId,
          date: data.date,
          walked_10k: data.walked_10k ?? false,
          did_liss: data.did_liss ?? false,
          did_stretch: data.did_stretch ?? false,
          notes: data.notes ?? "",
        })
        .onConflictDoUpdate({
          target: [restDays.user_id, restDays.date],
          set: {
            walked_10k: data.walked_10k ?? false,
            did_liss: data.did_liss ?? false,
            did_stretch: data.did_stretch ?? false,
            notes: data.notes ?? "",
          },
        })
        .returning();

      if (!row) {
        throw new Error("Failed to upsert rest day");
      }

      return mapRestDayRow(row);
    },

    async delete(date: string, userId: number = DEFAULT_USER_ID): Promise<boolean> {
      const deleted = await dbInstance
        .delete(restDays)
        .where(and(eq(restDays.user_id, userId), eq(restDays.date, date)))
        .returning({ id: restDays.id });

      return deleted.length > 0;
    },
  };
}
