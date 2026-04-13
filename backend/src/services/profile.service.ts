// src/services/profile.service.ts

import type { ProfileRow } from "../types";
import type { ProfileUpdateInput } from "../repositories/profile.repository";
import type { BodyweightService } from "./bodyweight.service";
import { getLocalDateString } from "../lib/date";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("profile-service");

export interface ProfileService {
  get(): Promise<ProfileRow>;
  update(data: ProfileUpdateInput, bodyweightDate?: string): Promise<ProfileRow>;
}

export function createProfileService(
  profileRepo: ReturnType<typeof import("../repositories/profile.repository").createProfileRepository>,
  bodyweightService: BodyweightService
): ProfileService {
  return {
    async get(): Promise<ProfileRow> {
      return profileRepo.get();
    },

    async update(data: ProfileUpdateInput, bodyweightDate?: string): Promise<ProfileRow> {
      const currentProfile = await profileRepo.get();
      await profileRepo.update(data);

      // Cross-domain: use BodyweightService, not repository directly
      if (data.weight_kg !== currentProfile.weight_kg) {
        const date = bodyweightDate?.trim() ? bodyweightDate : getLocalDateString();
        try {
          await bodyweightService.log(date, data.weight_kg);
          logger.info("Auto-logged bodyweight on profile update", { date, weight: data.weight_kg });
        } catch (error) {
          logger.warn("Failed to auto-log bodyweight", { error: String(error) });
          // Don't fail the profile update if bodyweight logging fails
        }
      }

      return profileRepo.get();
    },
  };
}
