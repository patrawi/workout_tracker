import { api } from "../api-client";

export interface BodyweightRecord {
    date: string;
    weight_kg: number;
    created_at: string;
}

export const bodyweightApi = {
    list: (days: string) =>
        api.get<BodyweightRecord[]>(`/bodyweight?days=${days}`),
};
