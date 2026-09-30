// src/services/gyms.service.ts

import { ValidationError } from "../lib/errors";
import type { createGymsRepository, GymRow } from "../repositories/gyms.repository";

export type GymsRepository = ReturnType<typeof createGymsRepository>;

export interface GymResolution {
  id: number;
  /** Gym name at resolve time — the confirm route snapshots it into
   * gym_profile so the legacy display chip stays correct. */
  name: string;
}

export interface GymsService {
  list(userId: number): Promise<GymRow[]>;
  create(name: string, userId: number): Promise<GymRow>;
  /**
   * Map a session's gym reference to a gym: an owned gym id is validated,
   * a name is matched-or-created, and nothing given resolves to no gym.
   */
  resolveForSession(
    gymId: number | undefined,
    gymName: string | undefined,
    userId: number
  ): Promise<GymResolution | undefined>;
}

const MAX_GYM_NAME_LENGTH = 120;

function cleanGymName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    throw new ValidationError("Gym name cannot be empty.");
  }
  if (trimmed.length > MAX_GYM_NAME_LENGTH) {
    throw new ValidationError("Gym name is too long.");
  }
  return trimmed;
}

export function createGymsService(repo: GymsRepository): GymsService {
  return {
    async list(userId: number): Promise<GymRow[]> {
      return repo.list(userId);
    },

    async create(name: string, userId: number): Promise<GymRow> {
      return repo.findOrCreateByName(cleanGymName(name), userId);
    },

    async resolveForSession(
      gymId: number | undefined,
      gymName: string | undefined,
      userId: number
    ): Promise<GymResolution | undefined> {
      if (gymId !== undefined && gymId !== null) {
        const owned = await repo.findByIdAndUser(gymId, userId);
        if (!owned) {
          throw new ValidationError("Unknown gym for this user.");
        }
        return { id: owned.id, name: owned.name };
      }

      if (gymName && gymName.trim()) {
        const gym = await repo.findOrCreateByName(gymName, userId);
        return { id: gym.id, name: gym.name };
      }

      return undefined;
    },
  };
}
