import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { historyApi, type HistoryDate } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatHistoryDate } from "@/lib/date-utils";

const ITEMS_PER_PAGE = 10;

export default function HistoryPage() {
    const [currentPage, setCurrentPage] = useState(1);

    const { data: dates = [], isLoading, error } = useQuery({
        queryKey: queryKeys.history.dates(),
        queryFn: async () => {
            const res = await historyApi.getDates();
            if (res.success && res.data) return res.data;
            throw new Error(res.error || "Failed to fetch history dates");
        },
    });

    const totalPages = Math.ceil(dates.length / ITEMS_PER_PAGE);
    const paginatedDates = dates.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    if (isLoading) {
        return (
            <div className="animate-pulse space-y-3 pt-8 max-w-3xl mx-auto px-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-20 rounded-2xl" style={{ background: "oklch(0.18 0.012 260 / 0.5)", border: "1px solid oklch(0.28 0.015 260 / 0.4)" }} />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="pt-8 text-center" style={{ color: "oklch(0.75 0.15 25)" }}>
                <p>{error.message}</p>
            </div>
        );
    }

    if (dates.length === 0) {
        return (
            <div className="pt-24 text-center text-[var(--muted-foreground)] animate-fade-in">
                <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: "oklch(0.22 0.015 260 / 0.5)" }}>
                    <Calendar className="w-8 h-8 text-[var(--muted-foreground)] opacity-50" />
                </div>
                <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2 tracking-tight">No History Yet</h2>
                <p>Log a workout or meal from the Home page to get started.</p>
            </div>
        );
    }

    return (
        <div className="pt-8 pb-24 animate-fade-in max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col items-center text-center gap-4 mb-4">
                <div>
                    <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-3 text-[var(--foreground)]">
                        History
                    </h1>
                </div>
            </div>

            <div className="flex flex-col gap-3 relative z-0">
                {paginatedDates.map((entry: HistoryDate, index: number) => (
                    <Link key={entry.date} to={`/history/${entry.date}`}>
                        <div
                            className="relative group rounded-2xl p-4 sm:p-5 flex items-center justify-between transition-all duration-300 ease-out cursor-pointer overflow-hidden"
                            style={{
                                background: "oklch(0.18 0.012 260 / 0.4)",
                                backdropFilter: "blur(16px)",
                                WebkitBackdropFilter: "blur(16px)",
                                border: "1px solid oklch(0.28 0.015 260 / 0.4)",
                                animationDelay: `${index * 0.04}s`,
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.border = "1px solid oklch(0.7 0.18 195 / 0.3)";
                                (e.currentTarget as HTMLElement).style.background = "oklch(0.22 0.015 260 / 0.5)";
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.border = "1px solid oklch(0.28 0.015 260 / 0.4)";
                                (e.currentTarget as HTMLElement).style.background = "oklch(0.18 0.012 260 / 0.4)";
                            }}
                        >
                            <div className="flex items-center gap-4 sm:gap-6 relative z-10 w-full">
                                {/* Date Bubble */}
                                <div
                                    className="hidden sm:flex flex-col items-center justify-center min-w-[4rem] h-[4rem] rounded-xl transition-colors duration-300"
                                    style={{ background: "oklch(0.22 0.015 260)", border: "1px solid oklch(0.28 0.015 260)" }}
                                >
                                    {(() => {
                                        const parts = formatHistoryDate(entry.date).split(",");
                                        return (
                                            <>
                                                <span className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                                                    {parts[0]}
                                                </span>
                                                <span className="text-xl font-bold text-[var(--foreground)]">
                                                    {entry.date.split("-")[2]}
                                                </span>
                                            </>
                                        );
                                    })()}
                                </div>

                                {/* Main Content */}
                                <div className="flex-1 min-w-0">
                                    {(() => {
                                        const parts = formatHistoryDate(entry.date).split(",");
                                        return (
                                            <h3 className="text-lg sm:text-xl font-bold text-[var(--foreground)] transition-colors duration-300 flex items-center gap-2">
                                                <span className="sm:hidden text-[var(--chart-2)] opacity-80 shrink-0">
                                                    {parts[0]}
                                                </span>
                                                {parts.slice(1).join(",")}
                                            </h3>
                                        );
                                    })()}

                                    {/* Activity Tags */}
                                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                        {entry.hasWorkout && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "oklch(0.7 0.18 195 / 0.1)", color: "oklch(0.7 0.18 195)", border: "1px solid oklch(0.7 0.18 195 / 0.2)" }}>
                                                Workout
                                            </span>
                                        )}
                                        {entry.hasRestDay && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "oklch(0.45 0.15 280 / 0.15)", color: "oklch(0.65 0.2 290)", border: "1px solid oklch(0.45 0.15 280 / 0.25)" }}>
                                                Rest Day
                                            </span>
                                        )}
                                        {entry.hasNutrition && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "oklch(0.65 0.22 160 / 0.1)", color: "oklch(0.72 0.19 160)", border: "1px solid oklch(0.65 0.22 160 / 0.2)" }}>
                                                Nutrition
                                            </span>
                                        )}
                                    </div>

                                    {/* Macro summary for dates with nutrition */}
                                    {entry.hasNutrition && (
                                        <div className="flex items-center gap-2 mt-1.5 text-[11px] tabular-nums text-[var(--muted-foreground)]">
                                            <span style={{ color: "oklch(0.72 0.19 160 / 0.8)" }}>P: {entry.protein.toFixed(0)}</span>
                                            <span className="opacity-30">|</span>
                                            <span style={{ color: "oklch(0.65 0.22 55 / 0.8)" }}>C: {entry.carbs.toFixed(0)}</span>
                                            <span className="opacity-30">|</span>
                                            <span style={{ color: "oklch(0.65 0.2 330 / 0.8)" }}>F: {entry.fat.toFixed(0)}</span>
                                            <span className="opacity-30">•</span>
                                            <span className="text-[var(--muted-foreground)] font-medium tabular-nums">{entry.calories.toFixed(0)} kcal</span>
                                        </div>
                                    )}
                                </div>

                                {/* Action Icon */}
                                <div
                                    className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center opacity-40 group-hover:opacity-100 transition-all duration-300"
                                    style={{ background: "oklch(0.22 0.015 260)", border: "1px solid oklch(0.28 0.015 260)" }}
                                >
                                    <span className="text-[var(--muted-foreground)] font-medium">→</span>
                                </div>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="mt-12 flex items-center justify-center gap-4">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2.5 rounded-full text-[var(--foreground)] transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ background: "oklch(0.22 0.015 260)", border: "1px solid oklch(0.28 0.015 260)" }}
                        aria-label="Previous page"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-1.5 px-4 py-2 rounded-full" style={{ background: "oklch(0.22 0.015 260 / 0.5)", border: "1px solid oklch(0.28 0.015 260 / 0.5)" }}>
                        <span className="text-sm font-medium text-[var(--foreground)]">{currentPage}</span>
                        <span className="text-sm text-[var(--muted-foreground)]">/</span>
                        <span className="text-sm font-medium text-[var(--muted-foreground)]">{totalPages}</span>
                    </div>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2.5 rounded-full text-[var(--foreground)] transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ background: "oklch(0.22 0.015 260)", border: "1px solid oklch(0.28 0.015 260)" }}
                        aria-label="Next page"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
}
