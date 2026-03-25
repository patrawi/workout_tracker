import { api } from "../api-client";
import type { ProfileRow, ProfileData } from "@/types";

export const profileApi = {
    get: () => api.get<ProfileRow>("/profile"),

    update: (data: ProfileData) => api.put<ProfileRow>("/profile", data),
};
