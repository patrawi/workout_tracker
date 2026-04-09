import { useState, useCallback } from "react";
import type { WorkoutRow } from "../types";

interface AddModalProps {
    exerciseName: string;
    defaultValues?: Partial<WorkoutRow>;
    sessionId: number;
    onSave: (newWorkout: {
        weight: number;
        reps: number;
        rpe: number;
        is_bodyweight: boolean;
        is_assisted: boolean;
    }) => void;
    onCancel: () => void;
}

export default function AddModal({ exerciseName, defaultValues, onSave, onCancel }: AddModalProps) {
    const [weight, setWeight] = useState(defaultValues?.weight ?? 0);
    const [reps, setReps] = useState(defaultValues?.reps ?? 10);
    const [rpe, setRpe] = useState(defaultValues?.rpe ?? 7);
    const [isBodyweight, setIsBodyweight] = useState(defaultValues?.is_bodyweight ?? false);
    const [isAssisted, setIsAssisted] = useState(defaultValues?.is_assisted ?? false);

    const handleSave = useCallback(() => {
        onSave({
            weight,
            reps,
            rpe,
            is_bodyweight: isBodyweight,
            is_assisted: isAssisted,
        });
    }, [weight, reps, rpe, isBodyweight, isAssisted, onSave]);

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
                        {/* Exercise name */}
                        <div>
                            <label className="text-xs text-surface-400 block mb-1">Exercise Name</label>
                            <input
                                type="text"
                                value={exerciseName}
                                readOnly
                                className="glass-input w-full px-3 py-2 text-sm text-white font-medium opacity-60 cursor-not-allowed"
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
                            disabled={!exerciseName.trim()}
                            className="btn-primary text-sm flex items-center gap-2"
                        >
                            ➕ Add Set
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
