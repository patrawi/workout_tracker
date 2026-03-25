import { useState } from "react";
import type { WorkoutRow } from "../types";

interface GroupedWorkoutCardProps {
    dateLabel: string;
    exerciseName: string;
    sets: WorkoutRow[];
    onEdit?: (workout: WorkoutRow) => void;
    onDelete?: (workoutId: number) => void;
    onAdd?: (exerciseName: string, muscleGroup: string, createdAt: string, sessionId: number, defaultValues?: Partial<WorkoutRow>) => void;
}

function formatDate(dateStr: string) {
    const d = new Date(dateStr + "Z");
    const today = new Date();

    // Check if it's today
    if (d.toDateString() === today.toDateString()) {
        return "Today";
    }

    // Check if it's yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
        return "Yesterday";
    }

    return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
    }).format(d);
}

export default function GroupedWorkoutCard({ dateLabel, exerciseName, sets, onEdit, onDelete, onAdd }: GroupedWorkoutCardProps) {
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);

    // Sort sets by creation time (ascending) to show the progression of the session
    const sortedSets = [...sets].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const handleDeleteClick = (id: number) => {
        setConfirmingDeleteId(id);
    };

    const handleConfirmDelete = (id: number) => {
        onDelete?.(id);
        setConfirmingDeleteId(null);
    };

    const handleCancelDelete = () => {
        setConfirmingDeleteId(null);
    };

    return (
        <article className="relative overflow-hidden bg-white/[0.02] border border-white/5 rounded-2xl backdrop-blur-md shadow-sm transition-all duration-300">
            {/* Header: Date & Exercise */}
            <div className="relative px-5 py-4 border-b border-white/5 bg-gradient-to-r from-white/[0.03] to-transparent flex items-start sm:items-center justify-between gap-4">
                <div className="flex-1">
                    <h3 className="font-bold text-white text-lg tracking-tight">{exerciseName}</h3>
                    <p className="text-xs text-[var(--muted-foreground)] font-medium mt-0.5">
                        {formatDate(dateLabel)}
                    </p>
                </div>

                {/* Add Button */}
                {onAdd && (
                    <button
                        type="button"
                        onClick={() => {
                            const lastSet = sets[sets.length - 1];
                            onAdd(exerciseName, lastSet.muscle_group, lastSet.created_at, lastSet.session_id, {
                                weight: lastSet.weight,
                                reps: lastSet.reps,
                                rpe: lastSet.rpe,
                                is_bodyweight: lastSet.is_bodyweight,
                                is_assisted: lastSet.is_assisted,
                            });
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--chart-2)] hover:text-[var(--chart-1)] hover:bg-[var(--chart-2)]/20 rounded-lg transition-colors"
                        title="Add Set"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span>Add</span>
                    </button>
                )}

                {/* Aggregate Tags (show unique tags for this session's exercise) */}
                <div className="flex flex-wrap gap-1.5 justify-end items-center">
                    {Array.from(new Set(sets.flatMap(s => s.tags || []))).slice(0, 3).map(tag => (
                        <span key={tag} className="tag-pill bg-[var(--chart-2)]/10 border border-[var(--chart-2)]/20 text-[var(--chart-2)] text-[10px] px-2 py-0.5 rounded-full font-medium tracking-wide">
                            {tag}
                        </span>
                    ))}
                </div>
            </div>

            {/* Sets Compact Table */}
            <div className="p-3">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-semibold border-b border-white/5 mb-1">
                    <div className="col-span-1 text-center">Set</div>
                    <div className="col-span-3 text-right">Weight</div>
                    <div className="col-span-2 text-center">Reps</div>
                    <div className="col-span-1 text-center">RPE</div>
                    <div className="col-span-3 pl-2">Notes</div>
                    <div className="col-span-2"></div>
                </div>

                <div className="flex flex-col gap-1">
                    {sortedSets.map((set, index) => (
                        <div key={set.id} className="relative group rounded-xl hover:bg-white/[0.04] transition-all duration-300">
                            {/* Hover overlay hint */}
                            <div className="absolute inset-y-0 left-0 w-1 bg-[var(--chart-2)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-l-xl" />

                            <div className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center relative z-10">
                                <div className="col-span-1 text-center text-xs text-[var(--muted-foreground)] font-medium">
                                    {index + 1}
                                </div>
                                <div className="col-span-3 text-right whitespace-nowrap">
                                    {set.is_bodyweight && set.weight === 0 ? (
                                        <span className="text-sm font-bold text-[var(--chart-2)]">Bodyweight</span>
                                    ) : (
                                        <div className="flex items-baseline justify-end gap-0.5">
                                            <span className="text-[15px] font-bold text-white tabular-nums tracking-tight">{set.weight}</span>
                                            <span className="text-[11px] text-[var(--muted-foreground)] font-medium">kg</span>
                                            {set.is_assisted && <span className="text-[10px] text-[var(--chart-3)] ml-1 font-semibold">(ast)</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-2 text-center font-bold text-white tabular-nums text-[15px] tracking-tight">
                                    {set.reps}
                                </div>
                                <div className="col-span-1 text-center text-sm font-semibold tabular-nums text-[var(--chart-1)]">
                                    {set.rpe > 0 ? set.rpe : "-"}
                                </div>

                                <div className="col-span-3 flex items-center pl-2 overflow-hidden">
                                    <div className="text-[13px] truncate text-[var(--muted-foreground)] group-hover:text-zinc-300 pr-2 transition-colors duration-300" title={set.notes_english || set.notes_thai || set.variant_details}>
                                        {set.variant_details && <span className="text-white mr-1.5 font-medium">{set.variant_details}</span>}
                                        {set.notes_english || set.notes_thai}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="col-span-2 flex justify-end gap-1 items-center pr-1">
                                    {onEdit && (
                                        <button
                                            onClick={() => onEdit(set)}
                                            className="p-1.5 text-[var(--muted-foreground)] hover:text-white hover:bg-white/10 transition-colors rounded-lg bg-white/5 sm:bg-transparent backdrop-blur-sm"
                                            aria-label={`Edit set ${index + 1}`}
                                            title="Edit Set"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                        </button>
                                    )}
                                    {onDelete && (
                                        <button
                                            onClick={() => handleDeleteClick(set.id)}
                                            className="p-1.5 text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 transition-colors rounded-lg bg-white/5 sm:bg-transparent backdrop-blur-sm"
                                            aria-label={`Delete set ${index + 1}`}
                                            title="Delete Set"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Inline confirmation */}
                            {confirmingDeleteId === set.id && (
                                <div className="mx-3 mb-2 px-4 py-2.5 rounded-xl bg-red-950/40 border border-red-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in relative z-20 backdrop-blur-md">
                                    <span className="text-sm text-red-200/90 font-medium">
                                        Delete set {index + 1}? This cannot be undone.
                                    </span>
                                    <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                                        <button
                                            onClick={handleCancelDelete}
                                            className="text-xs px-3.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 border border-white/5 transition-colors font-medium"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => handleConfirmDelete(set.id)}
                                            className="text-xs px-3.5 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/40 hover:text-red-100 border border-red-500/30 transition-colors font-bold shadow-sm"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </article>
    );
}
