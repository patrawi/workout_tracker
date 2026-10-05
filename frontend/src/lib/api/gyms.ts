import { api } from "../api-client";

/** A user's gym (PAT-56) — last_used_at drives the picker's default order.
 * equipment = the Gym Profile tick list; null = no profile (unrestricted, ADR 0027). */
export interface GymRow {
    id: number;
    name: string;
    equipment: string[] | null;
    created_at: string | null;
    last_used_at: string | null;
}

export const gymsApi = {
    list: () => api.get<GymRow[]>("/gyms"),

    create: (name: string) => api.post<GymRow>("/gyms", { name }),

    updateEquipmentProfile: (id: number, equipment: string[] | null) =>
        api.put<GymRow>(`/gyms/${id}/profile`, { equipment }),
};
