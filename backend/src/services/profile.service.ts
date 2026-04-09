import {
  getProfile as getProfileRepository,
  updateProfile as updateProfileRepository,
} from "../repositories/profile.repository.ts";
import { insertBodyweightLog } from "../repositories/bodyweight.repository";
import { getLocalDateString } from "../lib/date";
import type { ProfileRow } from "../types";
import type { ProfileUpdateInput } from "../repositories/profile.repository.ts";

export async function getProfile(): Promise<ProfileRow> {
  return getProfileRepository();
}

export async function updateProfile(
  data: ProfileUpdateInput,
  bodyweightDate?: string,
): Promise<ProfileRow> {
  const currentProfile = await getProfileRepository();
  await updateProfileRepository(data);

  if (data.weight_kg !== currentProfile.weight_kg) {
    const date = bodyweightDate && bodyweightDate.trim() ? bodyweightDate : getLocalDateString();
    await insertBodyweightLog(date, data.weight_kg);
  }

  return getProfileRepository();
}
