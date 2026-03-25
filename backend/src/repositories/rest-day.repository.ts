import { eq } from "drizzle-orm";
import { db } from "../db/client";
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

export async function upsertRestDay(data: RestDayInput): Promise<RestDayRow> {
  const [row] = await db
    .insert(restDays)
    .values({
      date: data.date,
      walked_10k: data.walked_10k ?? false,
      did_liss: data.did_liss ?? false,
      did_stretch: data.did_stretch ?? false,
      notes: data.notes ?? "",
    })
    .onConflictDoUpdate({
      target: restDays.date,
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
}

export async function deleteRestDay(date: string): Promise<boolean> {
  const deleted = await db
    .delete(restDays)
    .where(eq(restDays.date, date))
    .returning({ id: restDays.id });

  return deleted.length > 0;
}
