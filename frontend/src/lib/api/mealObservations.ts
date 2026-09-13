import { api } from "../api-client";
import type {
    ApiResponse,
    CalculateObservationOutcome,
    CreateMealObservationInput,
    CreateOutcome,
    InterpretOutcome,
    MealObservationReference,
    ObservationDetailWithExplanation,
    PendingObservation,
    ReferenceSearchItem,
} from "@/types";

/** Wire item (snake_case search hit) → shared candidate shape used by both pickers. */
function toReferenceCandidate(item: ReferenceSearchItem): MealObservationReference {
    return {
        id: item.id,
        provider: item.provider,
        providerFoodCode: item.provider_food_code,
        version: item.version,
        nameEn: item.name_en,
        nameTh: item.name_th,
        per100: {
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            alcohol: item.alcohol,
            calories: item.calories,
        },
    };
}

/**
 * Meal Observation endpoints (Nutrition Estimation V1).
 * `interpret` accepts raw base64 WITHOUT the data: prefix (server caps 8M chars);
 * `confirm`/`resolve` return the recalculated estimate + explanation, and confirm
 * dual-writes the central values into nutrition_logs server-side (ADR 0022).
 */
export const mealObservationApi = {
    interpret: (menu_name: string, before_image_base64?: string, after_image_base64?: string) =>
        api.post<InterpretOutcome>("/meal-observations/interpret", {
            menu_name,
            ...(before_image_base64 ? { before_image_base64 } : {}),
            ...(after_image_base64 ? { after_image_base64 } : {}),
        }),

    create: (input: CreateMealObservationInput) =>
        api.post<CreateOutcome>("/meal-observations", input),

    confirm: (id: number) =>
        api.post<CalculateObservationOutcome>(`/meal-observations/${id}/confirm`, {}),

    resolve: (id: number, reference_id: number) =>
        api.post<CalculateObservationOutcome>(`/meal-observations/${id}/resolve`, { reference_id }),

    listPending: () => api.get<PendingObservation[]>("/meal-observations/pending"),

    getDetail: (id: number) =>
        api.get<ObservationDetailWithExplanation>(`/meal-observations/${id}`),

    /** Search results mapped to the shared candidate shape (see ReferenceCandidateCard). */
    searchReferenceCandidates: async (
        q: string,
        limit = 10,
    ): Promise<ApiResponse<MealObservationReference[]>> => {
        const res = await api.get<{ items: ReferenceSearchItem[] }>(
            `/meal-observations/references/search?q=${encodeURIComponent(q)}&limit=${limit}`,
        );
        if (res.success && res.data) {
            return { ...res, data: res.data.items.map(toReferenceCandidate) };
        }
        return { success: res.success, error: res.error };
    },
};
