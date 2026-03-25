import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, CalendarDays } from "lucide-react";
import RecentLogs from "@/components/RecentLogs";
import EditModal from "@/components/EditModal";
import { workoutsApi } from "@/lib/api";
import { formatFullDate } from "@/lib/date-utils";
import type { WorkoutRow } from "../types";

export default function DailyWorkoutPage() {
    const { date } = useParams<{ date: string }>();
    const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingWorkout, setEditingWorkout] = useState<WorkoutRow | null>(null);

    const fetchDailyWorkouts = useCallback(async () => {
        if (!date) return;
        setIsLoading(true);
        const res = await workoutsApi.getByDate(date);
        if (res.success && res.data) {
            setWorkouts(res.data);
        } else {
            setError(res.error || "Failed to fetch workouts for this date");
        }
        setIsLoading(false);
    }, [date]);

    useEffect(() => {
        fetchDailyWorkouts();
    }, [fetchDailyWorkouts]);

    const displayDate = date ? formatFullDate(date) : "Unknown Date";

    const handleEditSave = useCallback((updated: WorkoutRow) => {
        setWorkouts((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
        setEditingWorkout(null);
    }, []);

    const handleDelete = useCallback(async (workoutId: number) => {
        const res = await workoutsApi.delete(workoutId);
        if (res.success) {
            setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
        } else {
            setError(res.error ?? "Failed to delete workout.");
        }
    }, []);

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
        return <div className="pt-8 text-center text-red-400">{error}</div>;
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
                        {workouts.length} sets logged in this session
                    </p>
                </div>
            </div>

            <RecentLogs
                workouts={workouts}
                isLoading={false}
                onEdit={setEditingWorkout}
                onDelete={handleDelete}
            />

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
