import { useState, useCallback } from "react";
import type { WorkoutRow } from "../types";
import GroupedWorkoutCard from "./GroupedWorkoutCard";
import AddModal from "./AddModal";

interface RecentLogsProps {
    workouts: WorkoutRow[];
    isLoading: boolean;
    onEdit?: (workout: WorkoutRow) => void;
    onDelete?: (workoutId: number) => void;
    onAdd?: (exerciseName: string, muscleGroup: string, createdAt: string, sessionId: number, defaultValues?: Partial<WorkoutRow>) => void;
}

function SkeletonCard() {
    return (
        <div className="glass-card p-6" aria-hidden="true">
            <div className="flex items-start justify-between mb-4">
                <div className="skeleton h-5 w-40" />
                <div className="skeleton h-3 w-20" />
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                    <div className="skeleton h-3 w-12 mb-1" />
                    <div className="skeleton h-6 w-16" />
                </div>
                <div>
                    <div className="skeleton h-3 w-10 mb-1" />
                    <div className="skeleton h-6 w-10" />
                </div>
                <div>
                    <div className="skeleton h-3 w-8 mb-1" />
                    <div className="skeleton h-6 w-10" />
                </div>
            </div>
            <div className="skeleton h-3 w-full mt-6" />
            <div className="skeleton h-3 w-full mt-2" />
            <div className="skeleton h-3 w-3/4 mt-2" />
        </div>
    );
}

function EmptyState() {
    return (
        <div className="glass-card p-12 text-center animate-fade-in border-dashed border-2 bg-transparent backdrop-blur-none">
            <div className="text-5xl mb-4" role="img" aria-label="Notepad">
                📋
            </div>
            <h3 className="text-lg font-bold tracking-tight text-white mb-2">
                No workouts logged yet
            </h3>
            <p className="text-[var(--muted-foreground)] max-w-sm mx-auto text-sm">
                Type your workout above in Thai, English, or a mix — the AI will parse it into structured data.
            </p>
        </div>
    );
}

export default function RecentLogs({ workouts, isLoading, onEdit, onDelete, onAdd }: RecentLogsProps) {
    // Add modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [addExerciseName, setAddExerciseName] = useState("");
    const [addMuscleGroup, setAddMuscleGroup] = useState("");
    const [addCreatedAt, setAddCreatedAt] = useState("");
    const [addSessionId, setAddSessionId] = useState<number | null>(null);
    const [addDefaultValues, setAddDefaultValues] = useState<Partial<WorkoutRow> | undefined>();

    const handleOpenAddModal = useCallback((exerciseName: string, muscleGroup: string, createdAt: string, sessionId: number, defaultValues?: Partial<WorkoutRow>) => {
        setAddExerciseName(exerciseName);
        setAddMuscleGroup(muscleGroup);
        setAddCreatedAt(createdAt);
        setAddSessionId(sessionId);
        setAddDefaultValues(defaultValues);
        setShowAddModal(true);
    }, []);

    const handleCloseAddModal = useCallback(() => {
        setShowAddModal(false);
        setAddExerciseName("");
        setAddMuscleGroup("");
        setAddCreatedAt("");
        setAddSessionId(null);
        setAddDefaultValues(undefined);
    }, []);

    // 1. Group by Date, then by Exercise
    // Map structure: Map<dateKey, Map<exerciseName, WorkoutRow[]>>
    const groupedWorkouts = new Map<string, Map<string, WorkoutRow[]>>();

    for (const workout of workouts) {
        // Assume created_at is "YYYY-MM-DD HH:MM:SS"
        const dateKey = workout.created_at.split(" ")[0] || workout.created_at.split("T")[0];

        let dateGroup = groupedWorkouts.get(dateKey);
        if (!dateGroup) {
            dateGroup = new Map<string, WorkoutRow[]>();
            groupedWorkouts.set(dateKey, dateGroup);
        }

        let exerciseGroup = dateGroup.get(workout.exercise_name);
        if (!exerciseGroup) {
            exerciseGroup = [];
            dateGroup.set(workout.exercise_name, exerciseGroup);
        }

        exerciseGroup.push(workout);
    }

    // 2. Flatten into an ordered list of groups for rendering
    // Sort dates descending, and within dates we can just keep insertion order or sort by first set's time descending
    const orderedGroups: { date: string; exercise: string; sets: WorkoutRow[] }[] = [];

    // Convert Map to Array and sort by date descending
    const sortedDates = Array.from(groupedWorkouts.keys()).sort((a, b) => b.localeCompare(a));

    for (const dateKey of sortedDates) {
        const dateGroup = groupedWorkouts.get(dateKey)!;

        const sortedExercises = Array.from(dateGroup.entries()).sort((a, b) => {
            const maxTimeA = Math.max(...a[1].map(w => new Date(w.created_at).getTime()));
            const maxTimeB = Math.max(...b[1].map(w => new Date(w.created_at).getTime()));
            if (maxTimeA === maxTimeB) {
                const maxIdA = Math.max(...a[1].map(w => w.id));
                const maxIdB = Math.max(...b[1].map(w => w.id));
                return maxIdB - maxIdA;
            }
            return maxTimeB - maxTimeA;
        });

        for (const [exerciseName, sets] of sortedExercises) {
            // Guarantee sets display sequentially as Set 1, Set 2
            const chronoSortedSets = [...sets].sort((a, b) => {
                const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                if (timeDiff === 0) return a.id - b.id;
                return timeDiff;
            });
            orderedGroups.push({ date: dateKey, exercise: exerciseName, sets: chronoSortedSets });
        }
    }

    return (
        <section aria-label="Recent workout logs" className="pb-10">
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <span className="text-[var(--chart-2)]">⚡</span>
                    Recent Logs
                    {workouts.length > 0 ? (
                        <span className="text-sm font-medium text-[var(--muted-foreground)] ml-1 bg-[var(--card)] px-2.5 py-0.5 rounded-full border border-[var(--border)]">
                            {workouts.length} sets
                        </span>
                    ) : null}
                </h2>
            </div>

            <div className="grid gap-6">
                {isLoading && workouts.length === 0 ? (
                    <>
                        <SkeletonCard />
                        <SkeletonCard />
                    </>
                ) : workouts.length === 0 ? (
                    <EmptyState />
                ) : (
                    orderedGroups.map((group, i) => (
                        <div
                            key={`${group.date}-${group.exercise}`}
                            className="animate-slide-up"
                            style={{ animationDelay: `${i * 40}ms` }}
                        >
                            <GroupedWorkoutCard
                                dateLabel={group.date}
                                exerciseName={group.exercise}
                                sets={group.sets}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onAdd={handleOpenAddModal}
                            />
                        </div>
                    ))
                )}
            </div>

            {/* Add Modal */}
            {showAddModal && addSessionId !== null && (
                <AddModal
                    exerciseName={addExerciseName}
                    defaultValues={addDefaultValues}
                    sessionId={addSessionId}
                    onSave={(newWorkout) => {
                        onAdd?.(
                            addExerciseName,
                            addMuscleGroup,
                            addCreatedAt,
                            addSessionId,
                            {
                                weight: newWorkout.weight,
                                reps: newWorkout.reps,
                                rpe: newWorkout.rpe,
                                is_bodyweight: newWorkout.is_bodyweight,
                                is_assisted: newWorkout.is_assisted,
                            }
                        );
                        handleCloseAddModal();
                    }}
                    onCancel={handleCloseAddModal}
                />
            )}
        </section>
    );
}

