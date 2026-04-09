import { api } from "../api-client";

export interface HistoryDate {
    date: string;
    hasWorkout: boolean;
    hasRestDay: boolean;
    hasNutrition: boolean;
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
}

export const historyApi = {
    getDates: () =>
        api.get<HistoryDate[]>("/history/dates"),
};
