import { useState, useCallback, useMemo } from "react";
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

    // 1. Group by Session, then by Exercise
    // Map structure: Map<sessionId, { date: string, exercises: Map<exerciseName, WorkoutRow[]> }>
    const orderedGroups = useMemo(() => {
        const groupedWorkouts = new Map<number, { date: string; exercises: Map<string, WorkoutRow[]> }>();

        for (const workout of workouts) {
            const sessionId = workout.session_id;
            const dateKey = (workout.created_at || "").split(" ")[0] || (workout.created_at || "").split("T")[0] || new Date().toISOString().slice(0, 10);

            let sessionGroup = groupedWorkouts.get(sessionId);
            if (!sessionGroup) {
                sessionGroup = { date: dateKey, exercises: new Map<string, WorkoutRow[]>() };
                groupedWorkouts.set(sessionId, sessionGroup);
            }

            let exerciseGroup = sessionGroup.exercises.get(workout.exercise_name);
            if (!exerciseGroup) {
                exerciseGroup = [];
                sessionGroup.exercises.set(workout.exercise_name, exerciseGroup);
            }

            exerciseGroup.push(workout);
        }

        // 2. Flatten into an ordered list of groups for rendering
        const ordered: { sessionId: number; date: string; exercise: string; sets: WorkoutRow[] }[] = [];

        // Convert Map to Array and sort by session_id descending (most recent first)
        const sortedSessions = Array.from(groupedWorkouts.entries()).sort((a, b) => b[0] - a[0]);

        for (const [sessionId, sessionData] of sortedSessions) {
            const sortedExercises = Array.from(sessionData.exercises.entries()).sort((a, b) => {
                let maxTimeA = -Infinity;
                let maxIdA = -Infinity;
                for (const w of a[1]) {
                    const t = w.created_at ? new Date(w.created_at).getTime() : 0;
                    if (t > maxTimeA) maxTimeA = t;
                    if (w.id > maxIdA) maxIdA = w.id;
                }
                let maxTimeB = -Infinity;
                let maxIdB = -Infinity;
                for (const w of b[1]) {
                    const t = w.created_at ? new Date(w.created_at).getTime() : 0;
                    if (t > maxTimeB) maxTimeB = t;
                    if (w.id > maxIdB) maxIdB = w.id;
                }
                if (maxTimeA === maxTimeB) {
                    return maxIdB - maxIdA;
                }
                return maxTimeB - maxTimeA;
            });

            for (const [exerciseName, sets] of sortedExercises) {
                // Pre-compute timestamps for sorting
                const setsWithTime = sets.map(s => ({ ...s, _ts: s.created_at ? new Date(s.created_at).getTime() : 0 }));
                const chronoSortedSets = setsWithTime.sort((a, b) => {
                    if (a._ts === b._ts) return a.id - b.id;
                    return a._ts - b._ts;
                });
                ordered.push({ sessionId, date: sessionData.date, exercise: exerciseName, sets: chronoSortedSets });
            }
        }

        return ordered;
    }, [workouts]);

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
                            key={`${group.sessionId}-${group.exercise}`}
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

