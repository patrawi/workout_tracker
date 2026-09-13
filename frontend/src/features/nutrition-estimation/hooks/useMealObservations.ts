import { useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mealObservationApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
    CalculateObservationOutcome,
    CreateMealObservationInput,
    CreateOutcome,
    InterpretOutcome,
    ObservationDetailWithExplanation,
    PendingObservation,
    ReferenceSearchItem,
} from "@/types";

interface UseMealObservationsReturn {
    // Pending queue (reference-pending + unconfirmed drafts)
    pending: PendingObservation[];
    isPendingLoading: boolean;

    // Actions (throw on failure so callers can render the error)
    interpret: (
        menuName: string,
        beforeImageBase64?: string,
        afterImageBase64?: string,
    ) => Promise<InterpretOutcome>;
    create: (input: CreateMealObservationInput) => Promise<CreateOutcome>;
    confirm: (id: number) => Promise<CalculateObservationOutcome>;
    resolve: (id: number, referenceId: number) => Promise<CalculateObservationOutcome>;

    // Loading states
    isInterpreting: boolean;
    isCreating: boolean;
    isConfirming: boolean;
    isResolving: boolean;
}

/**
 * Meal Observation data for the Nutrition Estimation V1 flow. Mutations throw on
 * failure — the modal/dialog catches and renders the message itself.
 * Confirm dual-writes central values into nutrition_logs server-side, so it
 * invalidates the nutrition queries (daily totals change).
 */
export function useMealObservations(): UseMealObservationsReturn {
    const queryClient = useQueryClient();

    const { data: pending = [], isLoading: isPendingLoading } = useQuery({
        queryKey: queryKeys.mealObservations.pending(),
        queryFn: async () => {
            const res = await mealObservationApi.listPending();
            if (res.success && res.data) return res.data;
            return [];
        },
    });

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
            // Created observations may land in the pending queue (reference_pending/draft).
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

    const resolveMutation = useMutation({
        mutationFn: async ({ id, referenceId }: { id: number; referenceId: number }) => {
            const res = await mealObservationApi.resolve(id, referenceId);
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Failed to resolve the reference");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.mealObservations.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.all });
        },
    });

    // Use refs to hold stable references to mutation methods
    const interpretRef = useRef(interpretMutation.mutateAsync);
    const createRef = useRef(createMutation.mutateAsync);
    const confirmRef = useRef(confirmMutation.mutateAsync);
    const resolveRef = useRef(resolveMutation.mutateAsync);

    // Keep refs updated via effects (not during render)
    useEffect(() => {
        interpretRef.current = interpretMutation.mutateAsync;
        createRef.current = createMutation.mutateAsync;
        confirmRef.current = confirmMutation.mutateAsync;
        resolveRef.current = resolveMutation.mutateAsync;
    }, [
        interpretMutation.mutateAsync,
        createMutation.mutateAsync,
        confirmMutation.mutateAsync,
        resolveMutation.mutateAsync,
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

    const resolve = useCallback(
        async (id: number, referenceId: number) => resolveRef.current({ id, referenceId }),
        [],
    );

    return {
        pending,
        isPendingLoading,
        interpret,
        create,
        confirm,
        resolve,
        isInterpreting: interpretMutation.isPending,
        isCreating: createMutation.isPending,
        isConfirming: confirmMutation.isPending,
        isResolving: resolveMutation.isPending,
    };
}

/** Full observation detail (components + latest revision + reference + explanation). */
export function useMealObservationDetail(id: number | null) {
    return useQuery({
        queryKey: queryKeys.mealObservations.detail(id ?? 0),
        queryFn: async (): Promise<ObservationDetailWithExplanation> => {
            const res = await mealObservationApi.getDetail(id as number);
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Failed to load the meal");
        },
        enabled: id !== null,
    });
}

/**
 * Reference search for the pending-meal resolution picker. `query` should be the
 * debounced, trimmed term; pass null to disable the query entirely (the server
 * 422s on a missing q, so empty input never hits the wire).
 */
export function useReferenceSearch(query: string | null) {
    return useQuery({
        queryKey: queryKeys.mealObservations.referenceSearch(query ?? ""),
        queryFn: async (): Promise<ReferenceSearchItem[]> => {
            const res = await mealObservationApi.searchReferences(query as string);
            if (res.success && res.data) return res.data.items;
            throw new Error(res.error ?? "Reference search failed");
        },
        enabled: query !== null && query.trim().length > 0,
    });
}
