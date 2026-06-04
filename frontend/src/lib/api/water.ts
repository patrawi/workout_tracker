import { api } from "../api-client";
import type { WaterLog } from "@/types";

export const waterApi = {
    getByDate: (date: string) =>
        api.get<WaterLog>(`/water?date=${encodeURIComponent(date)}`),

    set: (date: string, glasses: number) =>
        api.post<WaterLog>("/water", { date, glasses }),
};
