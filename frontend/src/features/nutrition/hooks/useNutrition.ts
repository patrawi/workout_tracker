import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nutritionApi, profileApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { NutritionItem, NutritionRow } from "@/types";

function getLocalDateString(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().slice(0, 10);
}

interface MacroTargets {
    protein_target: number;
    carbs_target: number;
    fat_target: number;
}

interface DailySummary {
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    totalCalories: number;
}

interface UseNutritionReturn {
    // State
    selectedDate: string;
    setSelectedDate: (date: string) => void;
    items: NutritionRow[];
    parsedItems: NutritionItem[] | null;
    loggedDates: string[];
    targets: MacroTargets;
    summary: DailySummary;

    // Loading states
    isLoading: boolean;
    isParsing: boolean;
    isConfirming: boolean;

    // Actions
    parseText: (rawText: string) => Promise<void>;
    confirmItems: (items: NutritionItem[]) => Promise<void>;
    cancelReview: () => void;
    deleteItem: (id: number) => Promise<void>;
    updateItem: (id: number, updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "calories">>) => Promise<void>;
    deleteDay: () => Promise<void>;

    // Error
    error: string | null;
}

export function useNutrition(initialDate?: string): UseNutritionReturn {
    const queryClient = useQueryClient();
    const [selectedDate, setSelectedDate] = useState(() => initialDate || getLocalDateString());
    const [parsedItems, setParsedItems] = useState<NutritionItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch items for selected date
    const { data: items = [], isLoading: isLoadingItems } = useQuery({
        queryKey: queryKeys.nutrition.byDate(selectedDate),
        queryFn: async () => {
            const res = await nutritionApi.getByDate(selectedDate);
            if (res.success && res.data) return res.data;
            return [];
        },
    });

    // Fetch logged dates
    const { data: loggedDates = [] } = useQuery({
        queryKey: queryKeys.nutrition.dates(),
        queryFn: async () => {
            const res = await nutritionApi.getDates();
            if (res.success && res.data) return res.data;
            return [];
        },
    });

    // Fetch profile for macro targets
    const { data: profileData } = useQuery({
        queryKey: queryKeys.profile.all,
        queryFn: async () => {
            const res = await profileApi.get();
            if (res.success && res.data) return res.data;
            return null;
        },
    });

    const targets: MacroTargets = profileData
        ? {
            protein_target: profileData.protein_target,
            carbs_target: profileData.carbs_target,
            fat_target: profileData.fat_target,
        }
        : { protein_target: 0, carbs_target: 0, fat_target: 0 };

    // Compute daily summary from items
    const summary: DailySummary = {
        totalProtein: items.reduce((sum, item) => sum + item.protein, 0),
        totalCarbs: items.reduce((sum, item) => sum + item.carbs, 0),
        totalFat: items.reduce((sum, item) => sum + item.fat, 0),
        totalCalories: items.reduce((sum, item) => sum + item.calories, 0),
    };

    const parseMutation = useMutation({
        mutationFn: async (rawText: string) => {
            const res = await nutritionApi.parse(rawText);
            if (res.success && res.data) return res.data;
            throw new Error(res.error || "Failed to parse nutrition text");
        },
        onSuccess: (data) => setParsedItems(data),
        onError: (err: Error) => setError(err.message),
    });

    const confirmMutation = useMutation({
        mutationFn: async (editedItems: NutritionItem[]) => {
            const res = await nutritionApi.confirm(selectedDate, editedItems);
            if (res.success) return true;
            throw new Error(res.error || "Failed to save nutrition items");
        },
        onSuccess: () => {
            setParsedItems(null);
            queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
        },
        onError: (err: Error) => setError(err.message),
    });

    const deleteItemMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await nutritionApi.deleteItem(id);
            if (res.success) return id;
            throw new Error("Failed to delete item");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.byDate(selectedDate) });
        },
        onError: (err: Error) => setError(err.message),
    });

    const updateItemMutation = useMutation({
        mutationFn: async ({ id, updates }: { id: number; updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "calories">> }) => {
            const res = await nutritionApi.updateItem(id, updates);
            if (res.success && res.data) return res.data;
            throw new Error("Failed to update item");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.byDate(selectedDate) });
        },
        onError: (err: Error) => setError(err.message),
    });

    const deleteDayMutation = useMutation({
        mutationFn: async () => {
            const res = await nutritionApi.deleteByDate(selectedDate);
            if (res.success) return true;
            throw new Error("Failed to delete day's nutrition log");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
        },
        onError: (err: Error) => setError(err.message),
    });

    // Use refs to hold stable references to mutation methods
    const parseRef = useRef(parseMutation.mutateAsync);
    const confirmRef = useRef(confirmMutation.mutateAsync);
    const deleteItemRef = useRef(deleteItemMutation.mutateAsync);
    const updateItemRef = useRef(updateItemMutation.mutateAsync);
    const deleteDayRef = useRef(deleteDayMutation.mutateAsync);

    // Keep refs updated
    parseRef.current = parseMutation.mutateAsync;
    confirmRef.current = confirmMutation.mutateAsync;
    deleteItemRef.current = deleteItemMutation.mutateAsync;
    updateItemRef.current = updateItemMutation.mutateAsync;
    deleteDayRef.current = deleteDayMutation.mutateAsync;

    const parseText = useCallback(async (rawText: string) => {
        setError(null);
        await parseRef.current(rawText).catch(() => {});
    }, []);

    const confirmItems = useCallback(async (editedItems: NutritionItem[]) => {
        setError(null);
        await confirmRef.current(editedItems).catch(() => {});
    }, []);

    const cancelReview = useCallback(() => {
        setParsedItems(null);
    }, []);

    const deleteItem = useCallback(async (id: number) => {
        await deleteItemRef.current(id).catch(() => {});
    }, []);

    const updateItem = useCallback(async (id: number, updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "calories">>) => {
        await updateItemRef.current({ id, updates }).catch(() => {});
    }, []);

    const deleteDay = useCallback(async () => {
        await deleteDayRef.current().catch(() => {});
    }, []);

    return {
        selectedDate,
        setSelectedDate,
        items,
        parsedItems,
        loggedDates,
        targets,
        summary,
        isLoading: isLoadingItems,
        isParsing: parseMutation.isPending,
        isConfirming: confirmMutation.isPending,
        parseText,
        confirmItems,
        cancelReview,
        deleteItem,
        updateItem,
        deleteDay,
        error,
    };
}
