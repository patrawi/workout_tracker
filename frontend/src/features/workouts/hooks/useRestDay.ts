import { useState, useCallback } from "react";
import { restDaysApi, type RestDayData } from "@/lib/api/rest-days";

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
    const [showForm, setShowForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const openForm = useCallback(() => setShowForm(true), []);
    const closeForm = useCallback(() => setShowForm(false), []);
    const clearError = useCallback(() => setError(null), []);

    const submitRestDay = useCallback(
        async (data: RestDayData) => {
            setIsSubmitting(true);
            setError(null);

            try {
                const res = await restDaysApi.create(data);
                if (res.success) {
                    setShowForm(false);
                    onSuccess?.();
                    return true;
                }
                setError(res.error ?? "Failed to log rest day.");
                return false;
            } catch {
                setError("Failed to log rest day. Is the backend running?");
                return false;
            } finally {
                setIsSubmitting(false);
            }
        },
        [onSuccess]
    );

    return {
        showForm,
        isSubmitting,
        error,
        openForm,
        closeForm,
        submitRestDay,
        clearError,
    };
}
