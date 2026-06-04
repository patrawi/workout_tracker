import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { waterApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * Water intake for a single date. Stored as glasses (250ml each).
 * Save is explicit — the WaterCard holds a draft until the user commits.
 */
export function useWater(date: string) {
    const queryClient = useQueryClient();

    const { data: glasses = 0, isLoading } = useQuery({
        queryKey: queryKeys.water.byDate(date),
        queryFn: async () => {
            const res = await waterApi.getByDate(date);
            if (res.success && res.data) return res.data.glasses;
            return 0;
        },
    });

    const saveMutation = useMutation({
        mutationFn: async (next: number) => {
            const res = await waterApi.set(date, next);
            if (res.success && res.data) return res.data.glasses;
            throw new Error(res.error ?? "Failed to save water");
        },
        onSuccess: (saved) => {
            queryClient.setQueryData(queryKeys.water.byDate(date), saved);
        },
    });

    const saveWater = useCallback(
        (next: number) => saveMutation.mutateAsync(next),
        [saveMutation],
    );

    return { glasses, isLoading, saveWater, isSaving: saveMutation.isPending };
}
