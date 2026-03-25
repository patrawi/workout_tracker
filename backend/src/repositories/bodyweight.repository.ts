import { asc, gte, sql } from "drizzle-orm";
import db from "../db/client";
import { mapBodyweightLogRow } from "../db/mappers";
import { bodyweightLogs } from "../schema";

export interface BodyweightLogRow {
  id: number;
  date: string;
  weight_kg: number;
  created_at: string;
}

export async function insertBodyweightLog(
  date: string,
  weight_kg: number,
): Promise<void> {
  await db
    .insert(bodyweightLogs)
    .values({
      date,
      weight_kg,
    })
    .onConflictDoUpdate({
      target: bodyweightLogs.date,
      set: {
        weight_kg,
      },
    });
}

export async function getBodyweightLogs(
  daysBack = 0,
): Promise<BodyweightLogRow[]> {
  let query = db.select().from(bodyweightLogs).$dynamic();

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
}
