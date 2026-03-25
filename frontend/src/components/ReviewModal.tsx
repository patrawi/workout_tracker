import { useState, useCallback } from "react";
import type { WorkoutData } from "../types";

interface ReviewModalProps {
    items: WorkoutData[];
    rawText: string;
    workoutDate: string;
    onConfirm: (rawText: string, items: WorkoutData[], createdAt: string) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
}

export default function ReviewModal({
    items: initialItems,
    rawText,
    workoutDate,
    onConfirm,
    onCancel,
    isSubmitting,
}: ReviewModalProps) {
    const [items, setItems] = useState<WorkoutData[]>(initialItems);

    const updateItem = useCallback(
        (index: number, field: keyof WorkoutData, value: string | number | boolean) => {
            setItems((prev) => {
                const copy = [...prev];
                copy[index] = { ...copy[index], [field]: value };
                return copy;
            });
        },
        []
    );

    const removeItem = useCallback((index: number) => {
        setItems((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleConfirm = useCallback(() => {
        if (items.length === 0 || isSubmitting) return;
        // Convert local datetime-local value to UTC ISO string for storage
        const utcDate = new Date(workoutDate).toISOString().replace("T", " ").slice(0, 19);
        onConfirm(rawText, items, utcDate);
    }, [items, rawText, workoutDate, isSubmitting, onConfirm]);

    // Format the selected date for display
    const displayDate = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(workoutDate));

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Review parsed workouts"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
                onClick={onCancel}
                aria-hidden="true"
            />

            {/* Modal */}
            <div
                className="relative glass-card w-full max-w-3xl max-h-[85vh] flex flex-col animate-slide-up"
                style={{ overscrollBehavior: "contain" }}
            >
                {/* Header */}
                <div className="p-6 pb-4 border-b border-surface-300/30">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                Review AI Output
                            </h2>
                            <p className="text-sm text-surface-400 mt-1">
                                {items.length} {items.length === 1 ? "set" : "sets"} parsed —
                                edit anything before saving
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="text-surface-400 hover:text-white transition-colors text-xl px-2 py-1 rounded-lg hover:bg-surface-200/50"
                            aria-label="Close review modal"
                        >
                            ✕
                        </button>
                    </div>
                    <p className="text-xs text-surface-400">
                        📅 {displayDate}
                    </p>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {items.map((item, i) => (
                        <div
                            key={i}
                            className="rounded-xl bg-surface-100/50 border border-surface-300/20 p-4 hover:border-surface-300/40 transition-colors"
                        >
                            {/* Row 1: Exercise name + remove */}
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-xs font-medium text-surface-400 bg-surface-200/50 rounded-full px-2.5 py-0.5 whitespace-nowrap">
                                    #{i + 1}
                                </span>
                                <input
                                    type="text"
                                    value={item.exercise_name}
                                    onChange={(e) =>
                                        updateItem(i, "exercise_name", e.target.value)
                                    }
                                    className="glass-input flex-1 px-3 py-1.5 text-sm text-white font-medium"
                                    aria-label={`Exercise name for set ${i + 1}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => removeItem(i)}
                                    className="text-xs text-red-400/60 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
                                    aria-label={`Remove set ${i + 1}`}
                                >
                                    Remove
                                </button>
                            </div>

                            {/* Row 2: Stats */}
                            <div className="grid grid-cols-3 gap-3 mb-3">
                                <div>
                                    <label className="text-xs text-surface-400 block mb-1">
                                        {item.is_bodyweight ? "Weight (BW)" : "Weight (kg)"}
                                    </label>
                                    <input
                                        type="number"
                                        value={item.weight}
                                        onChange={(e) =>
                                            updateItem(i, "weight", Number(e.target.value))
                                        }
                                        className="glass-input w-full px-3 py-1.5 text-sm text-white font-variant-numeric tabular-nums"
                                        step="0.5"
                                        min="0"
                                        disabled={item.is_bodyweight && item.weight === 0}
                                        placeholder={item.is_bodyweight ? "Body weight" : "0"}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-surface-400 block mb-1">
                                        Reps
                                    </label>
                                    <input
                                        type="number"
                                        value={item.reps}
                                        onChange={(e) =>
                                            updateItem(i, "reps", Number(e.target.value))
                                        }
                                        className="glass-input w-full px-3 py-1.5 text-sm text-white"
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-surface-400 block mb-1">
                                        RPE
                                    </label>
                                    <input
                                        type="number"
                                        value={item.rpe}
                                        onChange={(e) =>
                                            updateItem(i, "rpe", Number(e.target.value))
                                        }
                                        className="glass-input w-full px-3 py-1.5 text-sm text-white"
                                        min="0"
                                        max="10"
                                    />
                                </div>
                            </div>

                            {/* Bodyweight toggle */}
                            <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={item.is_bodyweight}
                                    onChange={(e) =>
                                        updateItem(i, "is_bodyweight", e.target.checked)
                                    }
                                    className="w-4 h-4 rounded bg-surface-200 border-surface-300 accent-accent-400"
                                />
                                <span className="text-xs text-surface-400">
                                    🏋️ Bodyweight exercise {item.is_bodyweight ? "(uses your profile weight)" : ""}
                                </span>
                            </label>

                            {/* Row 3: Variant + Notes */}
                            {(item.variant_details || item.notes_thai || item.notes_english) ? (
                                <div className="space-y-2 pt-2 border-t border-surface-300/15">
                                    {item.variant_details ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-surface-400 whitespace-nowrap">Variant:</span>
                                            <input
                                                type="text"
                                                value={item.variant_details}
                                                onChange={(e) =>
                                                    updateItem(i, "variant_details", e.target.value)
                                                }
                                                className="glass-input flex-1 px-3 py-1 text-xs text-white"
                                            />
                                        </div>
                                    ) : null}
                                    {item.notes_thai ? (
                                        <p className="text-xs text-surface-400/70 italic">
                                            🇹🇭 {item.notes_thai}
                                        </p>
                                    ) : null}
                                    {item.notes_english ? (
                                        <p className="text-xs text-surface-400/70">
                                            🇬🇧 {item.notes_english}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}

                            {/* Tags */}
                            {item.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {item.tags.map((tag) => (
                                        <span key={tag} className="tag-pill text-[0.65rem]">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ))}

                    {items.length === 0 ? (
                        <div className="text-center py-8 text-surface-400">
                            All sets removed. Click Cancel to go back.
                        </div>
                    ) : null}
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
                        onClick={handleConfirm}
                        disabled={items.length === 0 || isSubmitting}
                        className="btn-primary text-sm flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <span
                                    className="inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full"
                                    style={{ animation: "spin 0.6s linear infinite" }}
                                    aria-hidden="true"
                                />
                                Saving…
                            </>
                        ) : (
                            <>Confirm & Save ({items.length})</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
