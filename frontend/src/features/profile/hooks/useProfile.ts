import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { profileApi, bodyweightApi, type BodyweightRecord } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { ProfileData } from "@/types";
import { formatDate } from "@/lib/date-utils";

const DEFAULT_PROFILE: ProfileData = {
  weight_kg: 0,
  height_cm: 0,
  tdee: 0,
  calories_intake: 0,
  protein_target: 0,
  carbs_target: 0,
  fat_target: 0,
  water_target_glasses: 10,
};

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
  isDirty: boolean;
  updateField: (field: keyof ProfileData, value: number) => void;
  saveProfile: () => Promise<boolean>;
  bmi: number;
  bmiLabel: string;
}

function profileEquals(a: ProfileData, b: ProfileData): boolean {
  return (
    a.weight_kg === b.weight_kg &&
    a.height_cm === b.height_cm &&
    a.tdee === b.tdee &&
    a.calories_intake === b.calories_intake &&
    a.protein_target === b.protein_target &&
    a.carbs_target === b.carbs_target &&
    a.fat_target === b.fat_target &&
    a.water_target_glasses === b.water_target_glasses
  );
}

function normalizeProfile(data: ProfileData | null | undefined): ProfileData {
  if (!data) return DEFAULT_PROFILE;
  return {
    weight_kg: data.weight_kg,
    height_cm: data.height_cm,
    tdee: data.tdee,
    calories_intake: data.calories_intake,
    protein_target: data.protein_target,
    carbs_target: data.carbs_target,
    fat_target: data.fat_target,
    water_target_glasses: data.water_target_glasses,
  };
}

export function useProfile(): UseProfileReturn {
  const queryClient = useQueryClient();
  const [draftProfile, setDraftProfile] = useState<Partial<ProfileData>>({});
  const [bodyweightDate, setBodyweightDate] = useState(getLocalDateString);
  const [selectedRange, setSelectedRange] = useState("180");
  const [saved, setSaved] = useState(false);
  const [syncedBwDate, setSyncedBwDate] = useState(getLocalDateString);

  // Fetch profile data
  const { data: profileData, isLoading: isLoadingProfile } = useQuery({
    queryKey: queryKeys.profile.all,
    queryFn: async () => {
      const res = await profileApi.get();
      if (res.success && res.data) return res.data;
      return null;
    },
  });

  const serverProfile = useMemo(() => normalizeProfile(profileData), [profileData]);
  const profile = useMemo(
    () => ({ ...serverProfile, ...draftProfile }),
    [serverProfile, draftProfile],
  );

  // Fetch bodyweight history
  const { data: bodyweightsData, isLoading: isLoadingBw } = useQuery({
    queryKey: queryKeys.bodyweight.list(selectedRange),
    queryFn: async () => {
      const res = await bodyweightApi.list(selectedRange);
      if (res.success && res.data) {
        return res.data.map((r: BodyweightRecord) => {
          return {
            date: formatDate(r.created_at),
            weight: r.weight_kg,
          };
        });
      }
      return [];
    },
  });

  const bodyweights = bodyweightsData ?? [];

  // Pass data directly to avoid stale closure captures
  const saveMutation = useMutation({
    mutationFn: async (data: ProfileData & { bodyweight_date: string }) => {
      const res = await profileApi.update(data);
      if (res.success) return true;
      throw new Error("Failed to save profile");
    },
    onSuccess: (_saved, data) => {
      const { bodyweight_date: bodyweightDateFromSave, ...savedProfile } = data;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setDraftProfile({});
      setSyncedBwDate(bodyweightDateFromSave);
      queryClient.setQueryData<ProfileData | undefined>(
        queryKeys.profile.all,
        (current) => ({ ...current, ...savedProfile }),
      );
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
      await saveRef.current({ ...profile, bodyweight_date: bodyweightDate });
      return true;
    } catch {
      return false;
    }
  }, [profile, bodyweightDate]);

  const updateField = useCallback((field: keyof ProfileData, value: number) => {
    setDraftProfile((prev) => {
      const next = { ...prev };
      if (value === serverProfile[field]) delete next[field];
      else next[field] = value;
      return next;
    });
  }, [serverProfile]);

  // Dirty detection: check if current state differs from last synced
  const isDirty = useMemo(
    () =>
      !profileEquals(profile, serverProfile) || bodyweightDate !== syncedBwDate,
    [profile, serverProfile, bodyweightDate, syncedBwDate],
  );

  const bmi = useMemo(
    () =>
      profile.height_cm > 0 && profile.weight_kg > 0
        ? Math.round(
            (profile.weight_kg / (profile.height_cm / 100) ** 2) * 10,
          ) / 10
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
    isDirty,
    updateField,
    saveProfile,
    bmi,
    bmiLabel,
  };
}
