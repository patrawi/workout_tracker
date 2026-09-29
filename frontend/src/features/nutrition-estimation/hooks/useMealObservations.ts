import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mealObservationApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
    CalculateObservationOutcome,
    CreateMealObservationInput,
    CreateOutcome,
    InterpretOutcome,
} from "@/types";

interface UseMealObservationsReturn {
    // Actions (throw on failure so callers can render the error)
    interpret: (
        menuName: string,
        beforeImageBase64?: string,
        afterImageBase64?: string,
    ) => Promise<InterpretOutcome>;
    create: (input: CreateMealObservationInput) => Promise<CreateOutcome>;
    confirm: (id: number) => Promise<CalculateObservationOutcome>;

    // Loading states
    isInterpreting: boolean;
    isCreating: boolean;
    isConfirming: boolean;
}

/**
 * Meal Observation actions for the Nutrition Estimation flow (ADR 0026 — saves
 * never block, so there is no pending queue anymore). Mutations throw on
 * failure — the modal catches and renders the message itself. Confirm
 * dual-writes central values into nutrition_logs server-side, so it
 * invalidates the nutrition queries (daily totals change).
 */
export function useMealObservations(): UseMealObservationsReturn {
    const queryClient = useQueryClient();

    const interpretMutation = useMutation({
        mutationFn: async ({
            menuName,
            beforeImageBase64,
            afterImageBase64,
        }: {
            menuName: string;
            beforeImageBase64?: string;
            afterImageBase64?: string;
        }) => {
            const res = await mealObservationApi.interpret(menuName, beforeImageBase64, afterImageBase64);
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Failed to analyze the photo");
        },
    });

    const createMutation = useMutation({
        mutationFn: async (input: CreateMealObservationInput) => {
            const res = await mealObservationApi.create(input);
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Failed to save the meal");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.mealObservations.all });
        },
    });

    const confirmMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await mealObservationApi.confirm(id);
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Failed to confirm the meal");
        },
        onSuccess: () => {
            // Confirm dual-writes central values into nutrition_logs — daily totals change.
            queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.mealObservations.all });
        },
    });

    // Use refs to hold stable references to mutation methods
    const interpretRef = useRef(interpretMutation.mutateAsync);
    const createRef = useRef(createMutation.mutateAsync);
    const confirmRef = useRef(confirmMutation.mutateAsync);

    // Keep refs updated via effects (not during render)
    useEffect(() => {
        interpretRef.current = interpretMutation.mutateAsync;
        createRef.current = createMutation.mutateAsync;
        confirmRef.current = confirmMutation.mutateAsync;
    }, [
        interpretMutation.mutateAsync,
        createMutation.mutateAsync,
        confirmMutation.mutateAsync,
    ]);

    const interpret = useCallback(
        async (menuName: string, beforeImageBase64?: string, afterImageBase64?: string) =>
            interpretRef.current({ menuName, beforeImageBase64, afterImageBase64 }),
        [],
    );

    const create = useCallback(
        async (input: CreateMealObservationInput) => createRef.current(input),
        [],
    );

    const confirm = useCallback(async (id: number) => confirmRef.current(id), []);

    return {
        interpret,
        create,
        confirm,
        isInterpreting: interpretMutation.isPending,
        isCreating: createMutation.isPending,
        isConfirming: confirmMutation.isPending,
    };
}
