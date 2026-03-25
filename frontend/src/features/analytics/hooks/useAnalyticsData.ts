import { useState, useEffect, useCallback, useMemo } from "react";
import { analyticsApi, profileApi } from "@/lib/api";
import type { WorkoutRow } from "@/types";
import {
    computeKPIs,
    buildStrengthData,
    buildVolumeData,
    buildEffortData,
} from "../analytics.utils";

interface UseAnalyticsDataReturn {
    exercises: string[];
    selectedExercise: string;
    setSelectedExercise: (ex: string) => void;
    selectedRange: string;
    setSelectedRange: (range: string) => void;
    workouts: WorkoutRow[];
    notes: WorkoutRow[];
    profileWeight: number;
    isLoading: boolean;
    kpis: ReturnType<typeof computeKPIs>;
    strengthData: ReturnType<typeof buildStrengthData>;
    volumeData: ReturnType<typeof buildVolumeData>;
    effortData: ReturnType<typeof buildEffortData>;
    hasData: boolean;
    hasExercises: boolean;
}

export function useAnalyticsData(): UseAnalyticsDataReturn {
    const [exercises, setExercises] = useState<string[]>([]);
    const [selectedExercise, setSelectedExercise] = useState("");
    const [selectedRange, setSelectedRange] = useState("0");
    const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
    const [notes, setNotes] = useState<WorkoutRow[]>([]);
    const [profileWeight, setProfileWeight] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch exercise list + profile on mount
    useEffect(() => {
        (async () => {
            try {
                const [exRes, profileRes] = await Promise.all([
                    analyticsApi.getExercises(),
                    profileApi.get(),
                ]);

                if (exRes.success && exRes.data && exRes.data.length > 0) {
                    setExercises(exRes.data);
                    setSelectedExercise(exRes.data[0]);
                }
                if (profileRes.success && profileRes.data) {
                    setProfileWeight(profileRes.data.weight_kg);
                }
            } catch {
                /* no-op */
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    // Fetch analytics data when exercise or range changes
    const fetchAnalytics = useCallback(async () => {
        if (!selectedExercise) return;
        setIsLoading(true);

        try {
            const [analyticsRes, notesRes] = await Promise.all([
                analyticsApi.getExerciseData(selectedExercise, selectedRange),
                analyticsApi.getNotes(selectedExercise),
            ]);

            if (analyticsRes.success && analyticsRes.data) {
                setWorkouts(analyticsRes.data);
            }
            if (notesRes.success && notesRes.data) {
                setNotes(notesRes.data);
            }
        } catch {
            /* no-op */
        } finally {
            setIsLoading(false);
        }
    }, [selectedExercise, selectedRange]);

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    // Computed chart data
    const kpis = useMemo(
        () => computeKPIs(workouts, profileWeight),
        [workouts, profileWeight]
    );
    const strengthData = useMemo(
        () => buildStrengthData(workouts, profileWeight),
        [workouts, profileWeight]
    );
    const volumeData = useMemo(
        () => buildVolumeData(workouts, profileWeight),
        [workouts, profileWeight]
    );
    const effortData = useMemo(
        () => buildEffortData(workouts, profileWeight),
        [workouts, profileWeight]
    );

    return {
        exercises,
        selectedExercise,
        setSelectedExercise,
        selectedRange,
        setSelectedRange,
        workouts,
        notes,
        profileWeight,
        isLoading,
        kpis,
        strengthData,
        volumeData,
        effortData,
        hasData: workouts.length > 0,
        hasExercises: exercises.length > 0,
    };
}
