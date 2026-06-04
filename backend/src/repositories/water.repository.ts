import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mapWaterLogRow } from "../db/mappers";
import type { WaterLogRow } from "../db/mappers";
import { waterLogs } from "../schema";

export function createWaterRepository(dbInstance: PostgresJsDatabase) {
  return {
    async getByDate(date: string): Promise<WaterLogRow> {
      const [row] = await dbInstance
        .select()
        .from(waterLogs)
        .where(eq(waterLogs.date, date));

      return row ? mapWaterLogRow(row) : { date, glasses: 0 };
    },

    async set(date: string, glasses: number): Promise<WaterLogRow> {
      const [row] = await dbInstance
        .insert(waterLogs)
        .values({ date, glasses })
        .onConflictDoUpdate({
          target: waterLogs.date,
          set: { glasses },
        })
        .returning();

      return row ? mapWaterLogRow(row) : { date, glasses };
    },
  };
}
