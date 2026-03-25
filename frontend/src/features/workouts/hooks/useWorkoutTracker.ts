import { useState, useEffect, useCallback } from "react";
import { workoutsApi } from "@/lib/api";
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
    }) => Promise<boolean>;
    refreshWorkouts: () => Promise<void>;
    clearError: () => void;
}

export function useWorkoutTracker(): UseWorkoutTrackerReturn {
    const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isParsing, setIsParsing] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refreshWorkouts = useCallback(async () => {
        try {
            const res = await workoutsApi.list();
            if (res.success && res.data) {
                setWorkouts(res.data);
            } else {
                setError(res.error ?? "Failed to fetch workouts.");
            }
        } catch {
            setError("Cannot reach the server. Is the backend running?");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshWorkouts();
    }, [refreshWorkouts]);

    const parseWorkout = useCallback(async (rawText: string) => {
        setIsParsing(true);
        setError(null);

        try {
            const res = await workoutsApi.parse(rawText);
            if (res.success && res.data) {
                return res.data;
            }
            setError(res.error ?? "AI processing failed.");
            return null;
        } catch {
            setError("Failed to parse. Is the backend running?");
            return null;
        } finally {
            setIsParsing(false);
        }
    }, []);

    const confirmWorkout = useCallback(
        async (rawText: string, items: WorkoutData[], createdAt: string) => {
            setIsConfirming(true);
            setError(null);

            try {
                const res = await workoutsApi.create(rawText, items, createdAt);
                if (res.success && res.data) {
                    setWorkouts((prev) => [...res.data!, ...prev]);
                    return true;
                }
                setError(res.error ?? "Failed to save workouts.");
                return false;
            } catch {
                setError("Failed to save. Is the backend running?");
                return false;
            } finally {
                setIsConfirming(false);
            }
        },
        []
    );

    const deleteWorkout = useCallback(async (workoutId: number) => {
        try {
            const res = await workoutsApi.delete(workoutId);
            if (res.success) {
                setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
                return true;
            }
            setError(res.error ?? "Failed to delete workout.");
            return false;
        } catch {
            setError("Failed to delete. Is the backend running?");
            return false;
        }
    }, []);

    const addWorkout = useCallback(async (workout: {
        exercise_name: string;
        weight?: number;
        reps?: number;
        rpe?: number;
        is_bodyweight?: boolean;
        is_assisted?: boolean;
        muscle_group?: string;
        created_at?: string;
    }) => {
        setError(null);
        try {
            const res = await workoutsApi.add(workout);
            if (res.success && res.data) {
                setWorkouts((prev) => [res.data!, ...prev]);
                return true;
            }
            setError(res.error ?? "Failed to add workout.");
            return false;
        } catch {
            setError("Failed to add. Is the backend running?");
            return false;
        }
    }, []);

    const clearError = useCallback(() => setError(null), []);

    return {
        workouts,
        isLoading,
        isParsing,
        isConfirming,
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
    const updateWorkoutInState = useCallback(
        (
            _workouts: WorkoutRow[],
            setWorkouts: React.Dispatch<React.SetStateAction<WorkoutRow[]>>,
            updated: WorkoutRow
        ) => {
            setWorkouts((prev) =>
                prev.map((w) => (w.id === updated.id ? updated : w))
            );
        },
        []
    );

    return { updateWorkoutInState };
}
