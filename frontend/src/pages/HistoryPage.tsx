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
                    <div key={i} className="h-20 bg-white/5 rounded-2xl border border-white/10" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="pt-8 text-center text-red-400">
                <p>{error.message}</p>
            </div>
        );
    }

    if (dates.length === 0) {
        return (
            <div className="pt-24 text-center text-[var(--muted-foreground)] animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-white/5 mx-auto mb-6 flex items-center justify-center">
                    <Calendar className="w-8 h-8 text-[var(--muted-foreground)] opacity-50" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">No History Yet</h2>
                <p>Log a workout or meal from the Home page to get started.</p>
            </div>
        );
    }

    return (
        <div className="pt-8 pb-24 animate-fade-in max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col items-center text-center gap-4 mb-4">
                <div>
                    <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-3 text-gradient">
                        History
                    </h1>
                </div>
            </div>

            <div className="flex flex-col gap-3 relative z-0">
                {paginatedDates.map((entry: HistoryDate, index: number) => (
                    <Link key={entry.date} to={`/history/${entry.date}`}>
                        <div
                            className="relative group bg-white/[0.02] border border-white/5 hover:border-[var(--chart-2)]/30 hover:bg-white/[0.04] rounded-2xl p-4 sm:p-5 flex items-center justify-between transition-all duration-300 ease-out cursor-pointer overflow-hidden backdrop-blur-sm shadow-sm hover:shadow-[var(--chart-2)]/5 hover:-translate-y-0.5"
                            style={{ animationDelay: `${index * 0.04}s` }}
                        >
                            {/* Hover highlight overlay */}
                            <div className="absolute inset-y-0 left-0 w-1 bg-[var(--chart-2)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-l-2xl" />
                            <div className="absolute inset-0 bg-gradient-to-r from-[var(--chart-2)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                            <div className="flex items-center gap-4 sm:gap-6 relative z-10 w-full">
                                {/* Date Bubble */}
                                <div className="hidden sm:flex flex-col items-center justify-center min-w-[4rem] h-[4rem] rounded-xl bg-white/5 border border-white/10 group-hover:border-[var(--chart-2)]/30 group-hover:bg-[var(--chart-2)]/10 transition-colors duration-300">
                                    <span className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider group-hover:text-[var(--chart-2)] transition-colors">
                                        {formatHistoryDate(entry.date).split(',')[0]}
                                    </span>
                                    <span className="text-xl font-bold text-white group-hover:text-[var(--chart-2)] transition-colors">
                                        {entry.date.split('-')[2]}
                                    </span>
                                </div>

                                {/* Main Content */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg sm:text-xl font-bold text-zinc-100 group-hover:text-white transition-colors duration-300 flex items-center gap-2">
                                        <span className="sm:hidden text-[var(--chart-2)] opacity-80 shrink-0">
                                            {formatHistoryDate(entry.date).split(',')[0]}
                                        </span>
                                        {formatHistoryDate(entry.date).split(',').slice(1).join(',')}
                                    </h3>

                                    {/* Activity tags */}
                                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                        {entry.hasWorkout && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--chart-2)]/10 text-[var(--chart-2)] border border-[var(--chart-2)]/20">
                                                Workout
                                            </span>
                                        )}
                                        {entry.hasRestDay && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                Rest Day
                                            </span>
                                        )}
                                        {entry.hasNutrition && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                Nutrition
                                            </span>
                                        )}
                                    </div>

                                    {/* Macro summary for dates with nutrition */}
                                    {entry.hasNutrition && (
                                        <div className="flex items-center gap-2 mt-1.5 text-[11px] tabular-nums text-surface-400">
                                            <span className="text-emerald-400/70">P: {entry.protein.toFixed(0)}</span>
                                            <span className="text-surface-300/30">|</span>
                                            <span className="text-amber-400/70">C: {entry.carbs.toFixed(0)}</span>
                                            <span className="text-surface-300/30">|</span>
                                            <span className="text-rose-400/70">F: {entry.fat.toFixed(0)}</span>
                                            <span className="text-surface-300/30">•</span>
                                            <span className="text-white/60 font-medium">{entry.calories.toFixed(0)} kcal</span>
                                        </div>
                                    )}
                                </div>

                                {/* Action Icon */}
                                <div className="shrink-0 w-10 h-10 rounded-full bg-white/5 border border-transparent flex items-center justify-center opacity-40 group-hover:opacity-100 group-hover:bg-[var(--chart-2)]/10 group-hover:border-[var(--chart-2)]/30 group-active:scale-95 transition-all duration-300">
                                    <span className="text-zinc-400 group-hover:text-[var(--chart-2)] font-medium">→</span>
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
                        className="p-2.5 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:hover:bg-white/5 disabled:hover:border-white/10 disabled:cursor-not-allowed transition-all active:scale-95"
                        aria-label="Previous page"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 border border-white/5">
                        <span className="text-sm font-medium text-white">{currentPage}</span>
                        <span className="text-sm text-[var(--muted-foreground)]">/</span>
                        <span className="text-sm font-medium text-[var(--muted-foreground)]">{totalPages}</span>
                    </div>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2.5 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:hover:bg-white/5 disabled:hover:border-white/10 disabled:cursor-not-allowed transition-all active:scale-95"
                        aria-label="Next page"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
}
