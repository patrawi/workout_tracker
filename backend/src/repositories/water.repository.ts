import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mapWaterLogRow } from "../db/mappers";
import type { WaterLogRow } from "../db/mappers";
import { waterLogs } from "../schema";

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export function createWaterRepository(dbInstance: PostgresJsDatabase) {
  return {
    async getByDate(date: string, userId: number = DEFAULT_USER_ID): Promise<WaterLogRow> {
      const [row] = await dbInstance
        .select()
        .from(waterLogs)
        .where(and(eq(waterLogs.user_id, userId), eq(waterLogs.date, date)));

      return row ? mapWaterLogRow(row) : { date, glasses: 0 };
    },

    async set(date: string, glasses: number, userId: number = DEFAULT_USER_ID): Promise<WaterLogRow> {
      const [row] = await dbInstance
        .insert(waterLogs)
        .values({ user_id: userId, date, glasses })
        .onConflictDoUpdate({
          target: [waterLogs.user_id, waterLogs.date],
          set: { glasses },
        })
        .returning();

      return row ? mapWaterLogRow(row) : { date, glasses };
    },
  };
}
