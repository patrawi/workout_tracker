import { useState, useEffect, useCallback } from "react";
import { profileApi, bodyweightApi, type BodyweightRecord } from "@/lib/api";
import type { ProfileData } from "@/types";
import { formatDate } from "@/lib/date-utils";

interface UseProfileReturn {
    profile: ProfileData;
    bodyweights: { date: string; weight: number }[];
    selectedRange: string;
    setSelectedRange: (range: string) => void;
    isLoading: boolean;
    isSaving: boolean;
    saved: boolean;
    updateField: (field: keyof ProfileData, value: number) => void;
    saveProfile: () => Promise<boolean>;
    bmi: number;
    bmiLabel: string;
}

export function useProfile(): UseProfileReturn {
    const [profile, setProfile] = useState<ProfileData>({
        weight_kg: 0,
        height_cm: 0,
        tdee: 0,
        calories_intake: 0,
    });
    const [bodyweights, setBodyweights] = useState<{ date: string; weight: number }[]>([]);
    const [selectedRange, setSelectedRange] = useState("180");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [profileRes, bwRes] = await Promise.all([
                profileApi.get(),
                bodyweightApi.list(selectedRange),
            ]);

            if (profileRes.success && profileRes.data) {
                setProfile({
                    weight_kg: profileRes.data.weight_kg,
                    height_cm: profileRes.data.height_cm,
                    tdee: profileRes.data.tdee,
                    calories_intake: profileRes.data.calories_intake,
                });
            }

            if (bwRes.success && bwRes.data) {
                setBodyweights(
                    bwRes.data.map((r: BodyweightRecord) => ({
                        date: formatDate(r.date),
                        weight: r.weight_kg,
                    }))
                );
            }
        } catch {
            /* no-op */
        } finally {
            setIsLoading(false);
        }
    }, [selectedRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Re-fetch when saved changes (to refresh bodyweight chart)
    useEffect(() => {
        if (saved) {
            fetchData();
        }
    }, [saved, fetchData]);

    const saveProfile = useCallback(async () => {
        setIsSaving(true);
        setSaved(false);
        try {
            const res = await profileApi.update(profile);
            if (res.success) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
                return true;
            }
            return false;
        } catch {
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [profile]);

    const updateField = useCallback((field: keyof ProfileData, value: number) => {
        setProfile((prev) => ({ ...prev, [field]: value }));
    }, []);

    // BMI calculation
    const bmi =
        profile.height_cm > 0 && profile.weight_kg > 0
            ? Math.round(
                (profile.weight_kg / (profile.height_cm / 100) ** 2) * 10
            ) / 10
            : 0;

    const bmiLabel =
        bmi === 0
            ? ""
            : bmi < 18.5
                ? "Underweight"
                : bmi < 25
                    ? "Normal"
                    : bmi < 30
                        ? "Overweight"
                        : "Obese";

    return {
        profile,
        bodyweights,
        selectedRange,
        setSelectedRange,
        isLoading,
        isSaving,
        saved,
        updateField,
        saveProfile,
        bmi,
        bmiLabel,
    };
}
