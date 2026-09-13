import { api } from "../api-client";
import type {
    CalculateObservationOutcome,
    CreateMealObservationInput,
    CreateOutcome,
    InterpretOutcome,
    ObservationDetailWithExplanation,
    PendingObservation,
    ReferenceSearchItem,
} from "@/types";

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

    searchReferences: (q: string, limit = 10) =>
        api.get<{ items: ReferenceSearchItem[] }>(
            `/meal-observations/references/search?q=${encodeURIComponent(q)}&limit=${limit}`,
        ),
};
