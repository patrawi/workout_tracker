import { api } from "../api-client";

export interface RestDayData {
    date: string;
    walked_10k: boolean;
    did_liss: boolean;
    did_stretch: boolean;
    notes: string;
}

export const restDaysApi = {
    create: (data: RestDayData) =>
        api.post<{ success: boolean }>("/rest-days", data),
};
