import { api } from "../api-client";
import type { NutritionItem, NutritionRow } from "@/types";

export const nutritionApi = {
    parse: (raw_text: string) =>
        api.post<NutritionItem[]>("/nutrition/parse", { raw_text }),

    confirm: (date: string, items: NutritionItem[]) =>
        api.post<NutritionRow[]>("/nutrition/confirm", { date, items }),

    getByDate: (date: string) =>
        api.get<NutritionRow[]>(`/nutrition/date/${date}`),

    getDates: () =>
        api.get<string[]>("/nutrition/dates"),

    updateItem: (id: number, updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "calories">>) =>
        api.put<NutritionRow>(`/nutrition/${id}`, updates),

    deleteItem: (id: number) =>
        api.del<{ deleted: boolean }>(`/nutrition/${id}`),

    deleteByDate: (date: string) =>
        api.del<{ deleted: boolean }>(`/nutrition/date/${date}`),
};

