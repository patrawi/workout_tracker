import { useState, useCallback, useMemo } from "react";
import type { NutritionItem } from "../types";
import DialogBase from "./DialogBase";

interface NutritionReviewModalProps {
    items: NutritionItem[];
    onConfirm: (items: NutritionItem[]) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
}

const MEAL_ORDER = ["Breakfast", "Lunch", "Dinner", "Snack"];

function computeCalories(p: number, c: number, f: number): number {
    return Math.round((p * 4 + c * 4 + f * 9) * 10) / 10;
}

export default function NutritionReviewModal({
    items: initialItems,
    onConfirm,
    onCancel,
    isSubmitting,
}: NutritionReviewModalProps) {
    const [items, setItems] = useState<NutritionItem[]>(initialItems);

    const updateItem = useCallback(
        (index: number, field: keyof NutritionItem, value: string | number | boolean) => {
            setItems((prev) => {
                const copy = [...prev];
                const updated = { ...copy[index], [field]: value };

                // Auto-recompute calories when macros change
                if (field === "protein" || field === "carbs" || field === "fat") {
                    updated.calories = computeCalories(
                        field === "protein" ? (value as number) : updated.protein,
                        field === "carbs" ? (value as number) : updated.carbs,
                        field === "fat" ? (value as number) : updated.fat,
                    );
                }

                // Editing the amount re-scales macros from the matched catalog basis,
                // so correcting "1 slice" → "38 g" updates the numbers live.
                if (field === "amount" && updated.catalog && updated.catalog.per_amount > 0) {
                    const scale = (value as number) / updated.catalog.per_amount;
                    updated.protein = Math.round(updated.catalog.protein * scale * 10) / 10;
                    updated.carbs = Math.round(updated.catalog.carbs * scale * 10) / 10;
                    updated.fat = Math.round(updated.catalog.fat * scale * 10) / 10;
                    updated.calories = computeCalories(updated.protein, updated.carbs, updated.fat);
                }

                copy[index] = updated;
                return copy;
            });
        },
        [],
    );

    const removeItem = useCallback((index: number) => {
        setItems((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleConfirm = useCallback(() => {
        if (items.length === 0 || isSubmitting) return;
        onConfirm(items);
    }, [items, isSubmitting, onConfirm]);

    // Group items by meal — memoized
    const grouped = useMemo(
        () =>
            MEAL_ORDER.map((meal) => ({
                meal,
                items: items
                    .map((item, originalIndex) => ({ item, originalIndex }))
                    .filter(({ item }) => item.meal === meal),
            })).filter((g) => g.items.length > 0),
        [items],
    );

    // Totals — single pass, memoized
    const totals = useMemo(() => {
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;
        let totalCalories = 0;
        for (const i of items) {
            totalProtein += i.protein;
            totalCarbs += i.carbs;
            totalFat += i.fat;
            totalCalories += i.calories;
        }
        return { totalProtein, totalCarbs, totalFat, totalCalories };
    }, [items]);
    const { totalProtein, totalCarbs, totalFat, totalCalories } = totals;

    const mealIcon: Record<string, string> = {
        Breakfast: "B",
        Lunch: "L",
        Dinner: "D",
        Snack: "S",
    };

    return (
        <DialogBase
            open={true}
            onClose={onCancel}
            ariaLabel="Review parsed nutrition"
        >
            {/* Modal */}
            <div className="glass-card w-full flex flex-col animate-slide-up max-h-[85vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 pb-4 border-b border-surface-300/30">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                Review Parsed Nutrition
                            </h2>
                            <p className="text-sm text-surface-400 mt-1">
                                {items.length} {items.length === 1 ? "item" : "items"} parsed —
                                edit macros before saving
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

                    {/* Quick totals bar */}
                    <div className="flex items-center gap-4 mt-3 text-xs">
                        <span className="text-emerald-400 font-medium">
                            P: {totalProtein.toFixed(1)}g
                        </span>
                        <span className="text-amber-400 font-medium">
                            C: {totalCarbs.toFixed(1)}g
                        </span>
                        <span className="text-rose-400 font-medium">
                            F: {totalFat.toFixed(1)}g
                        </span>
                        <span className="text-surface-300">|</span>
                        <span className="text-white font-semibold">
                            {totalCalories.toFixed(0)} kcal
                        </span>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {grouped.map(({ meal, items: mealItems }) => (
                        <div key={meal}>
                            {/* Meal header */}
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-xs font-bold text-[var(--muted-foreground)] bg-white/5 rounded-md w-5 h-5 flex items-center justify-center">
                                    {mealIcon[meal]}
                                </span>
                                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                                    {meal}
                                </h3>
                                <div className="flex-1 h-px bg-surface-300/20" />
                            </div>

                            <div className="space-y-2">
                                {mealItems.map(({ item, originalIndex }) => (
                                    <div
                                        key={originalIndex}
                                        className={`rounded-xl bg-surface-100/50 border p-4 hover:border-surface-300/40 transition-colors ${
                                            item.uncertain
                                                ? "border-amber-500/50"
                                                : item.unit_mismatch || item.has_missing_macros
                                                  ? "border-amber-500/30"
                                                  : "border-surface-300/20"
                                        }`}
                                    >
                                        {/* Food name + remove */}
                                        <div className="flex items-center gap-3 mb-3">
                                            {(item.uncertain || item.unit_mismatch || item.has_missing_macros) && (
                                                <span
                                                    className="text-amber-400 text-xs"
                                                    title={
                                                        item.uncertain
                                                            ? "No confident catalog match — verify"
                                                            : item.unit_mismatch
                                                              ? "Unit differs from catalog — verify amount"
                                                              : "Macros missing — verify"
                                                    }
                                                >
                                                    ⚠️
                                                </span>
                                            )}
                                            <input
                                                type="text"
                                                value={item.food_name}
                                                onChange={(e) =>
                                                    updateItem(originalIndex, "food_name", e.target.value)
                                                }
                                                className="glass-input flex-1 px-3 py-1.5 text-sm text-white font-medium"
                                                aria-label={`Food name for item ${originalIndex + 1}`}
                                            />
                                            <div className="flex items-center gap-1 whitespace-nowrap">
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={0}
                                                    step="any"
                                                    value={item.amount}
                                                    onChange={(e) =>
                                                        updateItem(originalIndex, "amount", Number(e.target.value))
                                                    }
                                                    className="glass-input w-16 px-2 py-1.5 text-xs text-white tabular-nums text-right"
                                                    aria-label={`Amount for item ${originalIndex + 1}`}
                                                />
                                                <span className="text-xs text-surface-500">{item.unit}</span>
                                            </div>
                                            <select
                                                value={item.meal}
                                                onChange={(e) =>
                                                    updateItem(originalIndex, "meal", e.target.value)
                                                }
                                                className="glass-input px-2 py-1.5 text-xs text-surface-400 bg-transparent"
                                            >
                                                {MEAL_ORDER.map((m) => (
                                                    <option key={m} value={m}>
                                                        {m}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => removeItem(originalIndex)}
                                                className="text-xs text-red-400/60 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
                                                aria-label={`Remove item ${originalIndex + 1}`}
                                            >
                                                Remove
                                            </button>
                                        </div>

                                        {/* Catalog match caption */}
                                        {item.uncertain ? (
                                            <p className="text-[11px] text-amber-400/90 mb-2">
                                                No confident catalog match
                                                {item.matched_food_name ? ` — nearest: ${item.matched_food_name}` : ""}. Verify macros.
                                            </p>
                                        ) : item.unit_mismatch && item.matched_food_name ? (
                                            <p className="text-[11px] text-amber-400/90 mb-2">
                                                ✓ From catalog: {item.matched_food_name} — logged {item.amount}{item.unit}
                                                {item.catalog ? `, catalog per ${item.catalog.per_amount}${item.catalog.per_unit}` : ""}. Verify amount.
                                            </p>
                                        ) : item.matched_food_name ? (
                                            <p className="text-[11px] text-emerald-400/80 mb-2">
                                                ✓ From catalog: {item.matched_food_name}
                                            </p>
                                        ) : null}

                                        {/* Macros grid */}
                                        <div className="grid grid-cols-4 gap-3">
                                            <div>
                                                <label className="text-xs text-emerald-400/70 block mb-1">
                                                    Protein (g)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={item.protein}
                                                    onChange={(e) =>
                                                        updateItem(originalIndex, "protein", Number(e.target.value))
                                                    }
                                                    className="glass-input w-full px-3 py-1.5 text-sm text-white font-variant-numeric tabular-nums"
                                                    step="0.1"
                                                    min="0"
                                                    inputMode="decimal"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-amber-400/70 block mb-1">
                                                    Carbs (g)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={item.carbs}
                                                    onChange={(e) =>
                                                        updateItem(originalIndex, "carbs", Number(e.target.value))
                                                    }
                                                    className="glass-input w-full px-3 py-1.5 text-sm text-white font-variant-numeric tabular-nums"
                                                    step="0.1"
                                                    min="0"
                                                    inputMode="decimal"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-rose-400/70 block mb-1">
                                                    Fat (g)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={item.fat}
                                                    onChange={(e) =>
                                                        updateItem(originalIndex, "fat", Number(e.target.value))
                                                    }
                                                    className="glass-input w-full px-3 py-1.5 text-sm text-white font-variant-numeric tabular-nums"
                                                    step="0.1"
                                                    min="0"
                                                    inputMode="decimal"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-surface-400 block mb-1">
                                                    Calories
                                                </label>
                                                <div className="glass-input w-full px-3 py-1.5 text-sm text-surface-300 font-variant-numeric tabular-nums opacity-60">
                                                    {item.calories.toFixed(0)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    {items.length === 0 && (
                        <div className="text-center py-8 text-surface-400">
                            All items removed. Click Cancel to go back.
                        </div>
                    )}
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
        </DialogBase>
    );
}
