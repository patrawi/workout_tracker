import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Trash2, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNutrition } from "@/features/nutrition/hooks/useNutrition";
import NutritionReviewModal from "@/components/NutritionReviewModal";
import { queryKeys } from "@/lib/query-keys";
import { nutritionApi } from "@/lib/api";
import type { NutritionRow, MealType } from "@/types";

const MEAL_ORDER: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const MEAL_ICON: Record<MealType, string> = {
    Breakfast: "B",
    Lunch: "L",
    Dinner: "D",
    Snack: "S",
};

function DeltaBadge({ current, previous, unit }: { current: number; previous: number; unit: string }) {
    if (previous === 0) return null;
    const delta = current - previous;
    const pct = ((delta / previous) * 100).toFixed(0);
    const isUp = delta > 0;
    const isNeutral = Math.abs(delta) < 0.5;

    if (isNeutral) {
        return (
            <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums inline-flex items-center gap-0.5">
                <Minus className="w-3 h-3" />
                0%
            </span>
        );
    }

    return (
        <span className={`text-[10px] tabular-nums inline-flex items-center gap-0.5 ${isUp ? "text-emerald-400" : "text-red-400"}`}>
            {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {Math.abs(delta).toFixed(1)}{unit} ({pct}%)
        </span>
    );
}

function MacroProgressBar({
    label,
    current,
    target,
    color,
    bgColor,
    delta,
}: {
    label: string;
    current: number;
    target: number;
    color: string;
    bgColor: string;
    delta?: React.ReactNode;
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
                <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold tabular-nums ${target > 0 ? statusColor : "text-surface-400"}`}>
                        {current.toFixed(1)}
                        {target > 0 && (
                            <span className="text-surface-400 font-normal">
                                {" "}/ {target}g
                            </span>
                        )}
                    </span>
                    {delta}
                </div>
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

export default function NutritionPage() {
    const [searchParams] = useSearchParams();
    const initialDate = searchParams.get("date") || undefined;

    const {
        selectedDate,
        setSelectedDate,
        items,
        parsedItems,
        targets,
        summary,
        isLoading,
        isParsing,
        isConfirming,
        parseText,
        confirmItems,
        cancelReview,
        deleteItem,
        updateItem,
        deleteDay,
        error,
    } = useNutrition(initialDate);

    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Fetch yesterday's data for delta comparison
    const yesterdayString = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
    }, []);

    const { data: yesterdayItems = [] } = useQuery({
        queryKey: queryKeys.nutrition.byDate(yesterdayString),
        queryFn: async () => {
            const res = await nutritionApi.getByDate(yesterdayString);
            if (res.success && res.data) return res.data;
            return [];
        },
        staleTime: 1000 * 60 * 5,
    });

    const yesterdaySummary = useMemo(() => ({
        totalProtein: yesterdayItems.reduce((sum, item) => sum + item.protein, 0),
        totalCarbs: yesterdayItems.reduce((sum, item) => sum + item.carbs, 0),
        totalFat: yesterdayItems.reduce((sum, item) => sum + item.fat, 0),
        totalCalories: yesterdayItems.reduce((sum, item) => sum + item.calories, 0),
    }), [yesterdayItems]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [text]);

    const handleSubmit = useCallback(async () => {
        if (!text.trim() || isParsing) return;
        await parseText(text.trim());
    }, [text, isParsing, parseText]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
            }
        },
        [handleSubmit],
    );

    const handleConfirmSave = useCallback(
        async (editedItems: import("@/types").NutritionItem[]) => {
            await confirmItems(editedItems);
            setText("");
        },
        [confirmItems],
    );

    // Group saved items by meal
    const groupedItems = MEAL_ORDER.map((meal) => ({
        meal,
        items: items.filter((i) => i.meal === meal),
    })).filter((g) => g.items.length > 0);

    return (
        <div className="min-h-screen">
            {/* Background ambient glow */}
            <div
                className="fixed inset-0 pointer-events-none -z-10"
                aria-hidden="true"
                style={{
                    background:
                        "radial-gradient(ellipse 60% 40% at 50% 0%, oklch(0.25 0.15 160 / 0.12), transparent), radial-gradient(ellipse 40% 50% at 80% 20%, oklch(0.3 0.15 55 / 0.1), transparent)",
                }}
            />

            <main className="max-w-3xl mx-auto px-4 pb-16">
                {/* Header */}
                <header className="pt-10 pb-6">
                    <Link
                        to="/"
                        className="text-sm text-[var(--muted-foreground)] hover:text-white transition-colors mb-2 inline-flex items-center gap-1"
                    >
                        ← Back to Tracker
                    </Link>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gradient">
                        Nutrition Log
                    </h1>
                    <p className="text-surface-400 text-sm mt-2">
                        Paste your food notes — AI parses macros from labels and estimates the rest.
                    </p>
                </header>

                {/* Error banner */}
                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
                        {error}
                    </div>
                )}

                {/* Date picker + input */}
                <div className="animate-slide-up space-y-6">
                    {/* Input Section */}
                    <section aria-label="Nutrition input">
                        <div className="glass-card p-3 flex flex-col gap-3 focus-within:ring-2 focus-within:ring-[var(--accent-400)] transition-shadow">
                            <textarea
                                ref={textareaRef}
                                id="nutrition-input"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Paste your food log... e.g. 'Breakfast: 2 eggs, 50g cereal for 40g serving...'"
                                disabled={isParsing}
                                autoComplete="off"
                                spellCheck={false}
                                className="w-full px-3 py-2 text-base text-white placeholder:text-[var(--muted-foreground)] resize-none bg-transparent outline-none max-h-[200px] overflow-y-auto"
                                style={{ minHeight: "72px" }}
                            />

                            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                                {/* Date picker */}
                                <div className="relative group">
                                    <input
                                        id="nutrition-date-input"
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        className="bg-transparent text-xs text-[var(--muted-foreground)] hover:text-white px-2 py-1 rounded cursor-pointer transition-colors outline-none focus:ring-1 focus:ring-[var(--accent-400)]"
                                    />
                                </div>

                                {/* Submit button */}
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={!text.trim() || isParsing}
                                    className="flex items-center justify-center bg-[var(--chart-1)] hover:bg-[var(--chart-1)]/90 text-white p-2 w-8 h-8 rounded-lg outline-none transition-all disabled:opacity-50 disabled:hover:bg-[var(--chart-1)] shadow-[0_0_15px_rgba(var(--chart-1),0.4)] disabled:shadow-none"
                                    aria-label="Parse Nutrition"
                                    title="Press Enter to parse"
                                >
                                    {isParsing ? (
                                        <span
                                            className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                                            style={{ animation: "spin 0.6s linear infinite" }}
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 translate-x-[1px]">
                                            <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                        <p className="text-[11px] text-[var(--muted-foreground)] text-center mt-3">
                            Paste in Thai or English. Press <kbd className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] font-sans text-[10px]">Enter</kbd> to parse, <kbd className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] font-sans text-[10px]">Shift + Enter</kbd> for newline.
                        </p>
                    </section>

                    {/* Daily Summary */}
                    {!isLoading && (
                        <section aria-label="Daily macro summary" className="animate-slide-up">
                            <div className="glass-card p-6 space-y-5">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                        <CalendarDays className="w-4 h-4" />
                                        Daily Summary
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold text-white tabular-nums">
                                            {summary.totalCalories.toFixed(0)}
                                        </span>
                                        <span className="text-xs text-surface-400">kcal</span>
                                        <DeltaBadge current={summary.totalCalories} previous={yesterdaySummary.totalCalories} unit="" />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <MacroProgressBar
                                        label="Protein"
                                        current={summary.totalProtein}
                                        target={targets.protein_target}
                                        color="oklch(0.72 0.19 160)"
                                        bgColor="oklch(0.72 0.19 160 / 0.1)"
                                        delta={<DeltaBadge current={summary.totalProtein} previous={yesterdaySummary.totalProtein} unit="g" />}
                                    />
                                    <MacroProgressBar
                                        label="Carbohydrates"
                                        current={summary.totalCarbs}
                                        target={targets.carbs_target}
                                        color="oklch(0.65 0.22 55)"
                                        bgColor="oklch(0.65 0.22 55 / 0.1)"
                                        delta={<DeltaBadge current={summary.totalCarbs} previous={yesterdaySummary.totalCarbs} unit="g" />}
                                    />
                                    <MacroProgressBar
                                        label="Fat"
                                        current={summary.totalFat}
                                        target={targets.fat_target}
                                        color="oklch(0.65 0.2 330)"
                                        bgColor="oklch(0.65 0.2 330 / 0.1)"
                                        delta={<DeltaBadge current={summary.totalFat} previous={yesterdaySummary.totalFat} unit="g" />}
                                    />
                                </div>

                                {targets.protein_target === 0 &&
                                    targets.carbs_target === 0 &&
                                    targets.fat_target === 0 && (
                                        <div className="text-center pt-2">
                                            <Link
                                                to="/profile"
                                                className="text-xs text-[var(--chart-1)] hover:underline"
                                            >
                                                Set your macro targets in Profile →
                                            </Link>
                                        </div>
                                    )}
                            </div>
                        </section>
                    )}

                    {/* Items breakdown by meal */}
                    {isLoading ? (
                        <div className="space-y-4">
                            <div className="skeleton h-48 rounded-xl" />
                            <div className="skeleton h-32 rounded-xl" />
                        </div>
                    ) : items.length > 0 ? (
                        <section aria-label="Food items breakdown" className="animate-slide-up space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <h2 className="text-lg font-bold text-white">
                                    Food Log
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (window.confirm("Clear all nutrition entries for this date?")) {
                                            deleteDay();
                                        }
                                    }}
                                    className="text-xs text-red-400/60 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10 flex items-center gap-1"
                                >
                                    <Trash2 className="w-3 h-3" />
                                    Clear Day
                                </button>
                            </div>

                            {groupedItems.map(({ meal, items: mealItems }) => (
                                <MealGroup
                                    key={meal}
                                    meal={meal}
                                    items={mealItems}
                                    onDelete={deleteItem}
                                    onUpdate={updateItem}
                                />
                            ))}
                        </section>
                    ) : (
                        <div className="glass-card p-12 text-center animate-slide-up">
                            <p className="text-4xl mb-3 text-[var(--muted-foreground)]">🥗</p>
                            <p className="text-surface-400">
                                No food logged for this date.
                            </p>
                            <p className="text-surface-400/60 text-sm mt-1">
                                Paste your food notes above to get started.
                            </p>
                        </div>
                    )}
                </div>
            </main>

            {/* Review Modal */}
            {parsedItems && (
                <NutritionReviewModal
                    items={parsedItems}
                    onConfirm={handleConfirmSave}
                    onCancel={cancelReview}
                    isSubmitting={isConfirming}
                />
            )}
        </div>
    );
}

// ——— Meal Group Sub-component ———

function MealGroup({
    meal,
    items,
    onDelete,
    onUpdate,
}: {
    meal: string;
    items: NutritionRow[];
    onDelete: (id: number) => void;
    onUpdate: (id: number, updates: Partial<Pick<NutritionRow, "food_name" | "meal" | "protein" | "carbs" | "fat" | "calories">>) => void;
}) {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editValues, setEditValues] = useState<{
        food_name: string;
        protein: string;
        carbs: string;
        fat: string;
        calories: string;
    }>({ food_name: "", protein: "", carbs: "", fat: "", calories: "" });

    const subtotalP = items.reduce((s, i) => s + i.protein, 0);
    const subtotalC = items.reduce((s, i) => s + i.carbs, 0);
    const subtotalF = items.reduce((s, i) => s + i.fat, 0);
    const subtotalCal = items.reduce((s, i) => s + i.calories, 0);

    const startEdit = (item: NutritionRow) => {
        setEditingId(item.id);
        setEditValues({
            food_name: item.food_name,
            protein: String(item.protein),
            carbs: String(item.carbs),
            fat: String(item.fat),
            calories: String(item.calories),
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
    };

    const saveEdit = (id: number) => {
        const p = parseFloat(editValues.protein) || 0;
        const c = parseFloat(editValues.carbs) || 0;
        const f = parseFloat(editValues.fat) || 0;
        const cal = Math.round((p * 4 + c * 4 + f * 9) * 10) / 10;

        onUpdate(id, {
            food_name: editValues.food_name,
            protein: Math.round(p * 10) / 10,
            carbs: Math.round(c * 10) / 10,
            fat: Math.round(f * 10) / 10,
            calories: cal,
        });
        setEditingId(null);
    };

    const handleEditKeyDown = (e: React.KeyboardEvent, id: number) => {
        if (e.key === "Enter") {
            e.preventDefault();
            saveEdit(id);
        }
        if (e.key === "Escape") {
            cancelEdit();
        }
    };

    return (
        <div className="glass-card overflow-hidden">
            {/* Meal header */}
            <div className="px-5 py-3 border-b border-surface-300/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--muted-foreground)] bg-white/5 rounded-md w-5 h-5 flex items-center justify-center">
                        {MEAL_ICON[meal as MealType]}
                    </span>
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                        {meal}
                    </h3>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-surface-400 tabular-nums">
                    <span>P: {subtotalP.toFixed(1)}</span>
                    <span>C: {subtotalC.toFixed(1)}</span>
                    <span>F: {subtotalF.toFixed(1)}</span>
                    <span className="text-surface-300">|</span>
                    <span className="text-white/80">{subtotalCal.toFixed(0)} kcal</span>
                </div>
            </div>

            {/* Items */}
            <div className="divide-y divide-surface-300/10">
                {items.map((item) =>
                    editingId === item.id ? (
                        /* ——— Edit mode ——— */
                        <div
                            key={item.id}
                            className="px-5 py-3 bg-surface-100/40 space-y-2"
                        >
                            <input
                                type="text"
                                value={editValues.food_name}
                                onChange={(e) => setEditValues((v) => ({ ...v, food_name: e.target.value }))}
                                onKeyDown={(e) => handleEditKeyDown(e, item.id)}
                                className="glass-input w-full px-3 py-1.5 text-sm text-white"
                                autoFocus
                            />
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[10px] text-emerald-400/70 block mb-0.5">Protein</label>
                                    <input
                                        type="number"
                                        value={editValues.protein}
                                        onChange={(e) => setEditValues((v) => ({ ...v, protein: e.target.value }))}
                                        onKeyDown={(e) => handleEditKeyDown(e, item.id)}
                                        className="glass-input w-full px-2 py-1.5 text-sm text-white"
                                        step="0.1"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-amber-400/70 block mb-0.5">Carbs</label>
                                    <input
                                        type="number"
                                        value={editValues.carbs}
                                        onChange={(e) => setEditValues((v) => ({ ...v, carbs: e.target.value }))}
                                        onKeyDown={(e) => handleEditKeyDown(e, item.id)}
                                        className="glass-input w-full px-2 py-1.5 text-sm text-white"
                                        step="0.1"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-rose-400/70 block mb-0.5">Fat</label>
                                    <input
                                        type="number"
                                        value={editValues.fat}
                                        onChange={(e) => setEditValues((v) => ({ ...v, fat: e.target.value }))}
                                        onKeyDown={(e) => handleEditKeyDown(e, item.id)}
                                        className="glass-input w-full px-2 py-1.5 text-sm text-white"
                                        step="0.1"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="text-xs text-surface-400 hover:text-white px-3 py-1 rounded-lg hover:bg-surface-200/50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => saveEdit(item.id)}
                                    className="text-xs text-emerald-400 hover:text-emerald-300 px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* ——— Display mode ——— */
                        <div
                            key={item.id}
                            className="px-5 py-3 flex items-center justify-between hover:bg-surface-100/30 transition-colors group"
                        >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-sm text-white truncate">
                                    {item.food_name}
                                </span>
                            </div>

                            <div className="flex items-center gap-4 flex-shrink-0">
                                <div className="grid grid-cols-4 gap-3 text-xs tabular-nums text-right">
                                    <span className="w-12 text-[var(--muted-foreground)]">{item.protein.toFixed(1)}</span>
                                    <span className="w-12 text-[var(--muted-foreground)]">{item.carbs.toFixed(1)}</span>
                                    <span className="w-12 text-[var(--muted-foreground)]">{item.fat.toFixed(1)}</span>
                                    <span className="w-14 text-[var(--muted-foreground)]">{item.calories.toFixed(0)} kcal</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => startEdit(item)}
                                    className="text-surface-400/0 group-hover:text-surface-400/60 hover:!text-[var(--chart-1)] transition-colors text-xs px-1"
                                    aria-label={`Edit ${item.food_name}`}
                                >
                                    ✎
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onDelete(item.id)}
                                    className="text-red-400/0 group-hover:text-red-400/60 hover:!text-red-400 transition-colors text-xs px-1"
                                    aria-label={`Delete ${item.food_name}`}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ),
                )}
            </div>
        </div>
    );
}

