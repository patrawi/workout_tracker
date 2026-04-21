import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { profileApi, bodyweightApi, type BodyweightRecord } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { ProfileData } from "@/types";
import { formatDate } from "@/lib/date-utils";

function getLocalDateString(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

interface UseProfileReturn {
  profile: ProfileData;
  bodyweightDate: string;
  setBodyweightDate: (date: string) => void;
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
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<ProfileData>({
    weight_kg: 0,
    height_cm: 0,
    tdee: 0,
    calories_intake: 0,
    protein_target: 0,
    carbs_target: 0,
    fat_target: 0,
  });
  const [bodyweightDate, setBodyweightDate] = useState(getLocalDateString);
  const [selectedRange, setSelectedRange] = useState("180");
  const [saved, setSaved] = useState(false);

  // Fetch profile data
  const { data: profileData, isLoading: isLoadingProfile } = useQuery({
    queryKey: queryKeys.profile.all,
    queryFn: async () => {
      const res = await profileApi.get();
      if (res.success && res.data) return res.data;
      return null;
    },
  });

  // Sync fetched data into local state via useEffect (not select side-effect)
  useEffect(() => {
    if (profileData) {
      setProfile({
        weight_kg: profileData.weight_kg,
        height_cm: profileData.height_cm,
        tdee: profileData.tdee,
        calories_intake: profileData.calories_intake,
        protein_target: profileData.protein_target,
        carbs_target: profileData.carbs_target,
        fat_target: profileData.fat_target,
      });
    }
  }, [profileData]);

  // Fetch bodyweight history
  const { data: bodyweightsData, isLoading: isLoadingBw } = useQuery({
    queryKey: queryKeys.bodyweight.list(selectedRange),
    queryFn: async () => {
      const res = await bodyweightApi.list(selectedRange);
      if (res.success && res.data) {
        return res.data.map((r: BodyweightRecord) => ({
          date: formatDate(r.date),
          weight: r.weight_kg,
        }));
      }
      return [];
    },
  });

  const bodyweights = bodyweightsData ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await profileApi.update({
        ...profile,
        bodyweight_date: bodyweightDate,
      });
      if (res.success) return true;
      throw new Error("Failed to save profile");
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.bodyweight.all });
    },
  });

  const saveRef = useRef(saveMutation.mutateAsync);
  useEffect(() => {
    saveRef.current = saveMutation.mutateAsync;
  }, [saveMutation.mutateAsync]);

  const saveProfile = useCallback(async (): Promise<boolean> => {
    try {
      await saveRef.current();
      return true;
    } catch {
      return false;
    }
  }, []);

  const updateField = useCallback((field: keyof ProfileData, value: number) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }, []);

  const bmi = useMemo(
    () =>
      profile.height_cm > 0 && profile.weight_kg > 0
        ? Math.round((profile.weight_kg / (profile.height_cm / 100) ** 2) * 10) / 10
        : 0,
    [profile.height_cm, profile.weight_kg],
  );

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
    bodyweightDate,
    setBodyweightDate,
    bodyweights,
    selectedRange,
    setSelectedRange,
    isLoading: isLoadingProfile || isLoadingBw,
    isSaving: saveMutation.isPending,
    saved,
    updateField,
    saveProfile,
    bmi,
    bmiLabel,
  };
}
