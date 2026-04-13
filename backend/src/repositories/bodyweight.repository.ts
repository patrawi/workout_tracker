import { asc, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mapBodyweightLogRow } from "../db/mappers";
import { bodyweightLogs } from "../schema";

export interface BodyweightLogRow {
  id: number;
  date: string;
  weight_kg: number;
  created_at: string;
}

export function createBodyweightRepository(dbInstance: PostgresJsDatabase) {
  return {
    async insert(date: string, weight_kg: number): Promise<void> {
      await dbInstance
        .insert(bodyweightLogs)
        .values({ date, weight_kg })
        .onConflictDoUpdate({
          target: bodyweightLogs.date,
          set: { weight_kg },
        });
    },

    async getAll(daysBack = 0): Promise<BodyweightLogRow[]> {
      let query = dbInstance.select().from(bodyweightLogs).$dynamic();

      if (daysBack > 0) {
        query = query.where(
          gte(
            bodyweightLogs.created_at,
            sql`now() - interval '${sql.raw(String(daysBack))} days'`,
          ),
        );
      }

      const rows = await query.orderBy(asc(bodyweightLogs.date));
      return rows.map(mapBodyweightLogRow);
    },
  };
}
