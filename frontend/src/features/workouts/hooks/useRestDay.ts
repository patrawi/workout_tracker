import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { restDaysApi, type RestDayData } from "@/lib/api/rest-days";
import { queryKeys } from "@/lib/query-keys";

interface UseRestDayReturn {
    showForm: boolean;
    isSubmitting: boolean;
    error: string | null;
    openForm: () => void;
    closeForm: () => void;
    submitRestDay: (data: RestDayData) => Promise<boolean>;
    clearError: () => void;
}

export function useRestDay(onSuccess?: () => void): UseRestDayReturn {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: async (data: RestDayData) => {
            const res = await restDaysApi.create(data);
            if (res.success) return true;
            throw new Error(res.error ?? "Failed to log rest day.");
        },
        onSuccess: () => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.heatmap.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
            onSuccess?.();
        },
        onError: (err: Error) => setError(err.message),
    });

    const openForm = useCallback(() => setShowForm(true), []);
    const closeForm = useCallback(() => setShowForm(false), []);
    const clearError = useCallback(() => setError(null), []);

    const mutationRef = useRef(mutation.mutateAsync);
    useEffect(() => {
        mutationRef.current = mutation.mutateAsync;
    }, [mutation.mutateAsync]);

    const submitRestDay = useCallback(
        async (data: RestDayData): Promise<boolean> => {
            setError(null);
            try {
                await mutationRef.current(data);
                return true;
            } catch {
                return false;
            }
        },
        []
    );

    return {
        showForm,
        isSubmitting: mutation.isPending,
        error,
        openForm,
        closeForm,
        submitRestDay,
        clearError,
    };
}
