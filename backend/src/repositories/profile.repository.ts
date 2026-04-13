import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mapProfileRow } from "../db/mappers";
import { profile } from "../schema";
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

export function createProfileRepository(dbInstance: PostgresJsDatabase) {
  return {
    async ensure(): Promise<void> {
      await dbInstance.insert(profile).values({ id: 1 }).onConflictDoNothing();
    },

    async get(): Promise<ProfileRow> {
      const [row] = await dbInstance.select().from(profile).where(eq(profile.id, 1));

      if (!row) {
        throw new Error("Profile row not found. Was ensureProfileRow() called?");
      }

      return mapProfileRow(row);
    },

    async update(data: ProfileUpdateInput): Promise<void> {
      await dbInstance
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
    },
  };
}
