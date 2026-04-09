import { eq, sql } from "drizzle-orm";
import { mapProfileRow } from "../db/mappers";
import { profile } from "../schema";
import db from "../db/client";
import type { ProfileRow } from "../types";

export interface ProfileUpdateInput {
  weight_kg: number;
  height_cm: number;
  tdee: number;
  calories_intake: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
}

export async function ensureProfileRow(): Promise<void> {
  await db.insert(profile).values({ id: 1 }).onConflictDoNothing();
}

export async function getProfile(): Promise<ProfileRow> {
  const [row] = await db.select().from(profile).where(eq(profile.id, 1));

  if (!row) {
    throw new Error("Profile row not found. Was ensureProfileRow() called?");
  }

  return mapProfileRow(row);
}

export async function updateProfile(data: ProfileUpdateInput): Promise<void> {
  await db
    .update(profile)
    .set({
      weight_kg: data.weight_kg,
      height_cm: data.height_cm,
      tdee: data.tdee,
      calories_intake: data.calories_intake,
      protein_target: data.protein_target,
      carbs_target: data.carbs_target,
      fat_target: data.fat_target,
      updated_at: sql`now()`,
    })
    .where(eq(profile.id, 1));
}
