import { useState, useCallback } from "react";
import { workoutsApi, type AddWorkoutInput } from "@/lib/api";
import type { WorkoutRow } from "../types";

interface AddModalProps {
    exerciseName: string;
    defaultValues?: Partial<WorkoutRow>;
    sessionId: number;
    onSave: (newWorkout: WorkoutRow) => void;
    onCancel: () => void;
}

export default function AddModal({ exerciseName, defaultValues, sessionId, onSave, onCancel }: AddModalProps) {
    const [name, setName] = useState(exerciseName);
    const [weight, setWeight] = useState(defaultValues?.weight ?? 0);
    const [reps, setReps] = useState(defaultValues?.reps ?? 10);
    const [rpe, setRpe] = useState(defaultValues?.rpe ?? 7);
    const [isBodyweight, setIsBodyweight] = useState(defaultValues?.is_bodyweight ?? false);
    const [isAssisted, setIsAssisted] = useState(defaultValues?.is_assisted ?? false);

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = useCallback(async () => {
        if (isSaving) return;
        setIsSaving(true);
        setError(null);

        const input: AddWorkoutInput = {
            exercise_name: name,
            weight,
            reps,
            rpe,
            is_bodyweight: isBodyweight,
            is_assisted: isAssisted,
            session_id: sessionId,
        };

        const res = await workoutsApi.add(input);

        if (res.success && res.data) {
            onSave(res.data);
        } else {
            setError(res.error ?? "Failed to add workout.");
        }
        setIsSaving(false);
    }, [name, weight, reps, rpe, isBodyweight, isAssisted, sessionId, onSave, isSaving]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Add workout set"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
                onClick={onCancel}
                aria-hidden="true"
            />

            {/* Modal */}
            <div
                className="relative glass-card w-full max-w-lg max-h-[85vh] flex flex-col animate-slide-up"
                style={{ overscrollBehavior: "contain" }}
            >
                {/* Header */}
                <div className="p-6 pb-4 border-b border-surface-300/30">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                ➕ Add Set
                            </h2>
                            <p className="text-sm text-surface-400 mt-1">
                                Quickly log a similar set
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="text-surface-400 hover:text-white transition-colors text-xl px-2 py-1 rounded-lg hover:bg-surface-200/50"
                            aria-label="Close add modal"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {/* Error */}
                        {error ? (
                            <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm animate-fade-in">
                                {error}
                            </div>
                        ) : null}

                        {/* Exercise name */}
                        <div>
                            <label className="text-xs text-surface-400 block mb-1">Exercise Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="glass-input w-full px-3 py-2 text-sm text-white font-medium"
                            />
                        </div>

                        {/* Weight / Reps / RPE */}
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs text-surface-400 block mb-1">
                                    {isBodyweight ? "Weight (BW)" : isAssisted ? "Assistance (kg)" : "Weight (kg)"}
                                </label>
                                <input
                                    type="number"
                                    value={weight}
                                    onChange={(e) => setWeight(Number(e.target.value))}
                                    className="glass-input w-full px-3 py-2 text-sm text-white tabular-nums"
                                    step="0.5"
                                    min="0"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-surface-400 block mb-1">Reps</label>
                                <input
                                    type="number"
                                    value={reps}
                                    onChange={(e) => setReps(Number(e.target.value))}
                                    className="glass-input w-full px-3 py-2 text-sm text-white"
                                    min="0"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-surface-400 block mb-1">RPE</label>
                                <input
                                    type="number"
                                    value={rpe}
                                    onChange={(e) => setRpe(Number(e.target.value))}
                                    className="glass-input w-full px-3 py-2 text-sm text-white"
                                    min="0"
                                    max="10"
                                />
                            </div>
                        </div>

                        {/* Toggles row */}
                        <div className="flex flex-wrap gap-4">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={isBodyweight}
                                    onChange={(e) => {
                                        setIsBodyweight(e.target.checked);
                                        if (e.target.checked) setIsAssisted(false);
                                    }}
                                    className="w-4 h-4 rounded bg-surface-200 border-surface-300 accent-accent-400"
                                />
                                <span className="text-xs text-surface-400">Bodyweight</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={isAssisted}
                                    onChange={(e) => {
                                        setIsAssisted(e.target.checked);
                                        if (e.target.checked) setIsBodyweight(false);
                                    }}
                                    className="w-4 h-4 rounded bg-surface-200 border-surface-300 accent-accent-400"
                                />
                                <span className="text-xs text-surface-400">Assisted</span>
                            </label>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-surface-300/30">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-5 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:text-white hover:bg-surface-200/50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving || !name.trim()}
                            className="btn-primary text-sm flex items-center gap-2"
                        >
                            {isSaving ? (
                                <>
                                    <span
                        className="inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full"
                        style={{ animation: "spin 0.6s linear infinite" }}
                        aria-hidden="true"
                    />
                    Saving...
                                </>
                            ) : (
                                <>➕ Add Set</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
