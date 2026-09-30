import { api } from "../api-client";

/** A user's gym (PAT-56) — last_used_at drives the picker's default order. */
export interface GymRow {
    id: number;
    name: string;
    created_at: string | null;
    last_used_at: string | null;
}

export const gymsApi = {
    list: () => api.get<GymRow[]>("/gyms"),

    create: (name: string) => api.post<GymRow>("/gyms", { name }),
};
