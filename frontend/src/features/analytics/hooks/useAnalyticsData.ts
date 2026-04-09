import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi, profileApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
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
    const [selectedExercise, setSelectedExercise] = useState("");
    const [selectedRange, setSelectedRange] = useState("0");

    // Fetch exercise list on mount
    const { data: exercisesData } = useQuery({
        queryKey: queryKeys.analytics.exercises(),
        queryFn: async () => {
            const res = await analyticsApi.getExercises();
            if (res.success && res.data) return res.data;
            return [];
        },
    });

    const exercises = exercisesData ?? [];

    // Auto-select first exercise when list loads
    const effectiveExercise = selectedExercise || exercises[0] || "";

    // Fetch profile weight
    const { data: profileData } = useQuery({
        queryKey: queryKeys.profile.all,
        queryFn: async () => {
            const res = await profileApi.get();
            if (res.success && res.data) return res.data;
            return null;
        },
    });

    const profileWeight = profileData?.weight_kg ?? 0;

    // Fetch analytics data when exercise or range changes
    const { data: analyticsData, isLoading: isLoadingAnalytics } = useQuery({
        queryKey: queryKeys.analytics.exerciseData(effectiveExercise, selectedRange),
        queryFn: async () => {
            const res = await analyticsApi.getExerciseData(effectiveExercise, selectedRange);
            if (res.success && res.data) return res.data;
            return [] as WorkoutRow[];
        },
        enabled: !!effectiveExercise,
        initialData: [] as WorkoutRow[],
    });

    const workouts = analyticsData;

    // Fetch notes for selected exercise
    const { data: notesData } = useQuery({
        queryKey: queryKeys.analytics.notes(effectiveExercise),
        queryFn: async () => {
            const res = await analyticsApi.getNotes(effectiveExercise);
            if (res.success && res.data) return res.data;
            return [] as WorkoutRow[];
        },
        enabled: !!effectiveExercise,
        initialData: [] as WorkoutRow[],
    });

    const notes = notesData;

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
        selectedExercise: effectiveExercise,
        setSelectedExercise,
        selectedRange,
        setSelectedRange,
        workouts,
        notes,
        profileWeight,
        isLoading: isLoadingAnalytics,
        kpis,
        strengthData,
        volumeData,
        effortData,
        hasData: workouts.length > 0,
        hasExercises: exercises.length > 0,
    };
}
