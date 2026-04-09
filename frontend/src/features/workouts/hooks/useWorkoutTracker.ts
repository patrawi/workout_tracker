import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workoutsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { WorkoutRow, WorkoutData } from "@/types";

interface UseWorkoutTrackerReturn {
    workouts: WorkoutRow[];
    isLoading: boolean;
    isParsing: boolean;
    isConfirming: boolean;
    error: string | null;
    parseWorkout: (rawText: string) => Promise<WorkoutData[] | null>;
    confirmWorkout: (
        rawText: string,
        items: WorkoutData[],
        createdAt: string
    ) => Promise<boolean>;
    deleteWorkout: (id: number) => Promise<boolean>;
    addWorkout: (workout: {
        exercise_name: string;
        weight?: number;
        reps?: number;
        rpe?: number;
        is_bodyweight?: boolean;
        is_assisted?: boolean;
        muscle_group?: string;
        created_at?: string;
        session_id?: number;
    }) => Promise<boolean>;
    refreshWorkouts: () => Promise<void>;
    clearError: () => void;
}

export function useWorkoutTracker(): UseWorkoutTrackerReturn {
    const queryClient = useQueryClient();
    const [error, setError] = useState<string | null>(null);

    const { data: workouts = [], isLoading } = useQuery({
        queryKey: queryKeys.workouts.list(),
        queryFn: async () => {
            const res = await workoutsApi.list();
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Failed to fetch workouts.");
        },
    });

    const parseMutation = useMutation({
        mutationFn: async (rawText: string) => {
            const res = await workoutsApi.parse(rawText);
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "AI processing failed.");
        },
        onError: (err: Error) => setError(err.message),
    });

    const confirmMutation = useMutation({
        mutationFn: async ({ rawText, items, createdAt }: { rawText: string; items: WorkoutData[]; createdAt: string }) => {
            const res = await workoutsApi.create(rawText, items, createdAt);
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Failed to save workouts.");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workouts.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.heatmap.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
        },
        onError: (err: Error) => setError(err.message),
    });

    const deleteMutation = useMutation({
        mutationFn: async (workoutId: number) => {
            const res = await workoutsApi.delete(workoutId);
            if (res.success) return true;
            throw new Error(res.error ?? "Failed to delete workout.");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workouts.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.heatmap.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
        },
        onError: (err: Error) => setError(err.message),
    });

    const addMutation = useMutation({
        mutationFn: async (workout: {
            exercise_name: string;
            weight?: number;
            reps?: number;
            rpe?: number;
            is_bodyweight?: boolean;
            is_assisted?: boolean;
            muscle_group?: string;
            created_at?: string;
            session_id?: number;
        }) => {
            const res = await workoutsApi.add(workout);
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Failed to add workout.");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workouts.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.heatmap.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
        },
        onError: (err: Error) => setError(err.message),
    });

    const parseWorkout = useCallback(async (rawText: string): Promise<WorkoutData[] | null> => {
        setError(null);
        try {
            return await parseMutation.mutateAsync(rawText);
        } catch {
            return null;
        }
    }, [parseMutation]);

    const confirmWorkout = useCallback(async (rawText: string, items: WorkoutData[], createdAt: string): Promise<boolean> => {
        setError(null);
        try {
            await confirmMutation.mutateAsync({ rawText, items, createdAt });
            return true;
        } catch {
            return false;
        }
    }, [confirmMutation]);

    const deleteWorkout = useCallback(async (workoutId: number): Promise<boolean> => {
        try {
            await deleteMutation.mutateAsync(workoutId);
            return true;
        } catch {
            return false;
        }
    }, [deleteMutation]);

    const addWorkout = useCallback(async (workout: {
        exercise_name: string;
        weight?: number;
        reps?: number;
        rpe?: number;
        is_bodyweight?: boolean;
        is_assisted?: boolean;
        muscle_group?: string;
        created_at?: string;
        session_id?: number;
    }): Promise<boolean> => {
        setError(null);
        try {
            await addMutation.mutateAsync(workout);
            return true;
        } catch {
            return false;
        }
    }, [addMutation]);

    const refreshWorkouts = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.workouts.list() });
    }, [queryClient]);

    const clearError = useCallback(() => setError(null), []);

    return {
        workouts,
        isLoading,
        isParsing: parseMutation.isPending,
        isConfirming: confirmMutation.isPending,
        error,
        parseWorkout,
        confirmWorkout,
        deleteWorkout,
        addWorkout,
        refreshWorkouts,
        clearError,
    };
}

/**
 * Handle updating a workout in local state after edit
 */
export function useWorkoutEditor() {
    const queryClient = useQueryClient();

    const invalidateWorkouts = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.workouts.all });
    }, [queryClient]);

    return { invalidateWorkouts };
}
