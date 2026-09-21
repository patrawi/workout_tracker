// src/services/profile.service.ts

import type { ProfileRow } from "../types";
import type { ProfileUpdateInput } from "../repositories/profile.repository";
import type { BodyweightService } from "./bodyweight.service";
import { getLocalDateString } from "../lib/date";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("profile-service");

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export interface ProfileService {
  get(userId?: number): Promise<ProfileRow>;
  update(data: ProfileUpdateInput, bodyweightDate?: string, userId?: number): Promise<ProfileRow>;
}

export function createProfileService(
  profileRepo: ReturnType<typeof import("../repositories/profile.repository").createProfileRepository>,
  bodyweightService: BodyweightService
): ProfileService {
  return {
    async get(userId: number = DEFAULT_USER_ID): Promise<ProfileRow> {
      return profileRepo.get(userId);
    },

    async update(data: ProfileUpdateInput, bodyweightDate?: string, userId: number = DEFAULT_USER_ID): Promise<ProfileRow> {
      const currentProfile = await profileRepo.get(userId);
      await profileRepo.update(data, userId);

      // Cross-domain: use BodyweightService, not repository directly
      if (data.weight_kg !== currentProfile.weight_kg) {
        const date = bodyweightDate?.trim() ? bodyweightDate : getLocalDateString();
        try {
          await bodyweightService.log(date, data.weight_kg, userId);
          logger.info("Auto-logged bodyweight on profile update", { date, weight: data.weight_kg, userId });
        } catch (error) {
          logger.warn("Failed to auto-log bodyweight", { error: String(error) });
          // Don't fail the profile update if bodyweight logging fails
        }
      }

      return profileRepo.get(userId);
    },
  };
}
