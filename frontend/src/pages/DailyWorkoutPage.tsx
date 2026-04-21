import { useCallback, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import RecentLogs from "@/components/RecentLogs";
import EditModal from "@/components/EditModal";
import { workoutsApi, nutritionApi, profileApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatFullDate } from "@/lib/date-utils";
import type { WorkoutRow } from "../types";

interface MacroTargets {
    protein_target: number;
    carbs_target: number;
    fat_target: number;
}

export default function DailyWorkoutPage() {
    const { date } = useParams<{ date: string }>();
    const queryClient = useQueryClient();
    const [editingWorkout, setEditingWorkout] = useState<WorkoutRow | null>(null);

    const { data, isLoading, error } = useQuery({
        queryKey: queryKeys.workouts.byDate(date ?? ""),
        queryFn: async () => {
            if (!date) throw new Error("No date provided");

            const [workoutsRes, nutritionRes, profileRes] = await Promise.all([
                workoutsApi.getByDate(date),
                nutritionApi.getByDate(date),
                profileApi.get(),
            ]);

            const workouts = workoutsRes.success && workoutsRes.data ? workoutsRes.data : [];
            const nutritionItems = nutritionRes.success && nutritionRes.data ? nutritionRes.data : [];
            const targets: MacroTargets = profileRes.success && profileRes.data
                ? {
                    protein_target: profileRes.data.protein_target,
                    carbs_target: profileRes.data.carbs_target,
                    fat_target: profileRes.data.fat_target,
                }
                : { protein_target: 0, carbs_target: 0, fat_target: 0 };

            if (!workoutsRes.success) {
                throw new Error(workoutsRes.error || "Failed to fetch workouts for this date");
            }
            if (!nutritionRes.success) {
                console.warn("Failed to fetch nutrition for this date:", nutritionRes.error);
            }
            if (!profileRes.success) {
                console.warn("Failed to fetch profile for this date:", profileRes.error);
            }

            return { workouts, nutritionItems, targets };
        },
        enabled: !!date,
    });

    const workouts = data?.workouts ?? [];
    const nutritionItems = useMemo(() => data?.nutritionItems ?? [], [data?.nutritionItems]);
    const targets = data?.targets ?? { protein_target: 0, carbs_target: 0, fat_target: 0 };

    const displayDate = date ? formatFullDate(date) : "Unknown Date";

    const handleEditSave = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.workouts.byDate(date ?? "") });
        setEditingWorkout(null);
    }, [queryClient, date]);

    const deleteMutation = useMutation({
        mutationFn: async (workoutId: number) => {
            const res = await workoutsApi.delete(workoutId);
            if (res.success) return true;
            throw new Error(res.error || "Failed to delete workout");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workouts.byDate(date ?? "") });
        },
    });

    const handleDelete = useCallback(
        async (workoutId: number) => {
            try {
                await deleteMutation.mutateAsync(workoutId);
            } catch {
                // Error already handled by mutation onError or silently swallowed
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [deleteMutation.isPending],
    );

    // Nutrition summary — single pass, memoized
    const nutritionSummary = useMemo(() => {
        let protein = 0;
        let carbs = 0;
        let fat = 0;
        let calories = 0;
        for (const i of nutritionItems) {
            protein += i.protein;
            carbs += i.carbs;
            fat += i.fat;
            calories += i.calories;
        }
        return { protein, carbs, fat, calories };
    }, [nutritionItems]);

    if (isLoading) {
        return (
            <div className="pt-8 animate-pulse space-y-8 max-w-4xl mx-auto px-4 sm:px-6">
                <div className="h-8 w-48 bg-white/10 rounded" />
                <div className="space-y-4">
                    <div className="h-32 bg-white/5 rounded-2xl border border-white/10" />
                    <div className="h-48 bg-white/5 rounded-2xl border border-white/10" />
                </div>
            </div>
        );
    }

    if (error) {
        return <div className="pt-8 text-center text-red-400">{error.message}</div>;
    }

    return (
        <div className="pt-6 pb-24 animate-fade-in max-w-4xl mx-auto px-4 sm:px-6">
            <Link
                to="/history"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-[var(--muted-foreground)] hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-300 mb-10 group backdrop-blur-md shadow-sm"
            >
                <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform duration-300" />
                Return to History
            </Link>

            <div className="mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
                {/* Glowing Icon */}
                <div className="relative inline-flex group shrink-0">
                    <div className="absolute inset-0 bg-[var(--chart-2)] blur-xl opacity-20 transition-opacity duration-500 rounded-full" />
                    <div className="relative p-3.5 rounded-2xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 shadow-lg backdrop-blur-md">
                        <CalendarDays className="w-8 h-8 text-[var(--chart-2)]" />
                    </div>
                </div>

                <div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-2 text-gradient">
                        {displayDate}
                    </h1>
                    <p className="text-lg text-[var(--muted-foreground)] flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-[var(--chart-2)] animate-pulse" />
                        {workouts.length} sets logged
                        {nutritionItems.length > 0 && ` • ${nutritionItems.length} food items`}
                    </p>
                </div>
            </div>

            {/* Workout Log */}
            {workouts.length > 0 && (
                <RecentLogs
                    workouts={workouts}
                    isLoading={false}
                    onEdit={setEditingWorkout}
                    onDelete={handleDelete}
                />
            )}

            {/* Nutrition Summary Card */}
            {nutritionItems.length > 0 && (
                <div className="mt-8">
                    <div className="glass-card p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                🍽️ Nutrition Summary
                            </h2>
                            <Link
                                to={`/nutrition${date ? `?date=${date}` : ''}`}
                                className="text-xs text-[var(--chart-1)] hover:underline transition-colors"
                            >
                                View full log →
                            </Link>
                        </div>

                        {/* Macro Bars */}
                        <div className="space-y-4">
                            <MacroBar
                                label="Protein"
                                current={nutritionSummary.protein}
                                target={targets.protein_target}
                                color="oklch(0.72 0.19 160)"
                                bgColor="oklch(0.72 0.19 160 / 0.1)"
                            />
                            <MacroBar
                                label="Carbohydrates"
                                current={nutritionSummary.carbs}
                                target={targets.carbs_target}
                                color="oklch(0.65 0.22 55)"
                                bgColor="oklch(0.65 0.22 55 / 0.1)"
                            />
                            <MacroBar
                                label="Fat"
                                current={nutritionSummary.fat}
                                target={targets.fat_target}
                                color="oklch(0.65 0.2 330)"
                                bgColor="oklch(0.65 0.2 330 / 0.1)"
                            />
                        </div>

                        {/* Total Calories */}
                        <div className="rounded-lg bg-surface-100/30 border border-surface-300/10 px-4 py-3 flex items-center justify-between">
                            <span className="text-xs text-surface-400 font-medium tracking-wide uppercase">Total Calories</span>
                            <span className="text-lg font-bold text-white tabular-nums">
                                {nutritionSummary.calories.toFixed(0)} <span className="text-xs text-surface-400 font-normal">kcal</span>
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty states */}
            {workouts.length === 0 && nutritionItems.length === 0 && (
                <div className="glass-card p-12 text-center">
                    <p className="text-4xl mb-3">📭</p>
                    <p className="text-surface-400">No activity logged for this date.</p>
                </div>
            )}

            {editingWorkout && (
                <EditModal
                    workout={editingWorkout}
                    onSave={handleEditSave}
                    onCancel={() => setEditingWorkout(null)}
                />
            )}
        </div>
    );
}

// ——— Compact Macro Progress Bar ———

function MacroBar({
    label,
    current,
    target,
    color,
    bgColor,
}: {
    label: string;
    current: number;
    target: number;
    color: string;
    bgColor: string;
}) {
    const percentage = target > 0 ? (current / target) * 100 : 0;
    const clampedWidth = Math.min(percentage, 100);
    const ratio = target > 0 ? current / target : 0;
    const statusColor =
        ratio >= 0.9 && ratio <= 1.1
            ? "text-emerald-400"
            : ratio >= 0.75 && ratio <= 1.25
              ? "text-amber-400"
              : "text-red-400";

    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-surface-400 uppercase tracking-wider">
                    {label}
                </span>
                <span className={`text-sm font-semibold tabular-nums ${target > 0 ? statusColor : "text-surface-400"}`}>
                    {current.toFixed(1)}
                    {target > 0 && (
                        <span className="text-surface-400 font-normal">
                            {" "}/ {target}g
                        </span>
                    )}
                </span>
            </div>
            <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: bgColor }}
            >
                <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                        width: `${clampedWidth}%`,
                        background: color,
                        boxShadow: `0 0 10px ${color}40`,
                    }}
                />
            </div>
            {target > 0 && (
                <div className="text-right mt-0.5">
                    <span className="text-[10px] text-surface-400 tabular-nums">
                        {percentage.toFixed(0)}%
                    </span>
                </div>
            )}
        </div>
    );
}
