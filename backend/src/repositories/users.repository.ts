// src/repositories/users.repository.ts
// Google-login user store (ticket B-001). Row id=1 is the seeded placeholder
// owner (google_sub='pending-owner'); the first real Google login claims it so
// all legacy single-user data transfers to the owner account.

import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { users } from "../schema";

export type UserRow = typeof users.$inferSelect;

/** Placeholder markers on the seeded owner row (id=1) until first Google login. */
export const PENDING_OWNER_GOOGLE_SUB = "pending-owner";
export const PENDING_OWNER_EMAIL = "owner@pending";

export interface GoogleProfileInput {
  google_sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export function createUsersRepository(dbInstance: PostgresJsDatabase) {
  return {
    async findById(id: number): Promise<UserRow | null> {
      const [row] = await dbInstance.select().from(users).where(eq(users.id, id)).limit(1);
      return row ?? null;
    },

    async findByGoogleSub(googleSub: string): Promise<UserRow | null> {
      const [row] = await dbInstance
        .select()
        .from(users)
        .where(eq(users.google_sub, googleSub))
        .limit(1);
      return row ?? null;
    },

    /** True when the seeded owner row (id=1) has not been claimed by a real Google account yet. */
    async ownerIsPending(): Promise<boolean> {
      const [row] = await dbInstance
        .select({ google_sub: users.google_sub })
        .from(users)
        .where(eq(users.id, 1))
        .limit(1);
      return row?.google_sub === PENDING_OWNER_GOOGLE_SUB;
    },

    /**
     * Claim the pending owner row (id=1) for a real Google account. Only fires
     * while google_sub is still the placeholder; returns the updated row or
     * null when the owner was already claimed.
     */
    async claimPendingOwner(profile: GoogleProfileInput): Promise<UserRow | null> {
      const [row] = await dbInstance
        .update(users)
        .set({
          google_sub: profile.google_sub,
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
          is_owner: true,
        })
        .where(eq(users.id, 1))
        .returning();

      if (!row || row.google_sub !== profile.google_sub) return null;
      return row;
    },

    async create(profile: GoogleProfileInput, isOwner = false): Promise<UserRow> {
      const [row] = await dbInstance
        .insert(users)
        .values({
          google_sub: profile.google_sub,
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
          is_owner: isOwner,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to insert user row");
      }
      return row;
    },

    /** Refresh display fields (email/name/picture) on an existing Google user. */
    async updateProfile(id: number, profile: GoogleProfileInput): Promise<void> {
      await dbInstance
        .update(users)
        .set({
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
        })
        .where(eq(users.id, id));
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
