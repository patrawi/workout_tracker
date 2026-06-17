import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { heatmapApi, type HeatmapDay } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getLocalDateStr } from "@/lib/date-utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const FLAME = "linear-gradient(90deg,#ff7d1a 0%,#ffa024 45%,#ffc83d 100%)";
const REST_PIN = "linear-gradient(180deg, oklch(0.62 0.2 290), oklch(0.5 0.2 290))";

// Build a month grid as weeks of day-numbers (null = padding cell).
function buildWeeks(year: number, month: number): (number | null)[][] {
    const startDow = new Date(year, month, 1).getDay();
    const dim = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}

// Find horizontal runs of consecutive trained days within a week (for flame bars).
function runsForWeek(week: (number | null)[], trained: Set<number>) {
    const runs: { s: number; e: number }[] = [];
    let s: number | null = null;
    for (let c = 0; c < 7; c++) {
        const day = week[c];
        const on = day != null && trained.has(day);
        if (on && s === null) s = c;
        if (s !== null && (!on || c === 6)) {
            runs.push({ s, e: on ? c : c - 1 });
            s = null;
        }
    }
    return runs;
}

export default function StreakCalendar() {
    const { data: heatmapData = [], isLoading } = useQuery({
        queryKey: queryKeys.heatmap.all,
        queryFn: async () => {
            const res = await heatmapApi.get();
            return res.success && res.data ? res.data : [];
        },
    });

    const todayDate = getLocalDateStr();
    const [view, setView] = useState(() => {
        const [y, m] = todayDate.split("-").map(Number);
        return { y, m: m - 1 };
    });

    const dayMap = useMemo(() => {
        const map = new Map<string, HeatmapDay>();
        for (const d of heatmapData) map.set(d.date, d);
        return map;
    }, [heatmapData]);

    const { trained, rest, weeks, todayNum } = useMemo(() => {
        const trainedSet = new Set<number>();
        const restSet = new Set<number>();
        const dim = new Date(view.y, view.m + 1, 0).getDate();
        for (let d = 1; d <= dim; d++) {
            const ds = `${view.y}-${String(view.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const entry = dayMap.get(ds);
            if (!entry) continue;
            if ((entry.count ?? 0) > 0) trainedSet.add(d);
            else if (entry.isRestDay) restSet.add(d);
        }
        const [ty, tm, td] = todayDate.split("-").map(Number);
        const todayNum = ty === view.y && tm - 1 === view.m ? td : null;
        return { trained: trainedSet, rest: restSet, weeks: buildWeeks(view.y, view.m), todayNum };
    }, [view, dayMap, todayDate]);

    const shift = (n: number) =>
        setView((p) => {
            const nm = p.m + n;
            return { y: p.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
        });

    if (isLoading) {
        return <div className="glass-card p-6 animate-fade-in"><div className="skeleton h-[340px] w-full rounded-xl" /></div>;
    }

    return (
        <section className="glass-card p-5 sm:p-6 animate-fade-in" aria-label="Streak calendar">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-extrabold tracking-tight text-[var(--foreground)]">
                    {MONTHS[view.m]} {view.y}
                </h3>
                <div className="flex gap-1.5">
                    <button
                        type="button"
                        onClick={() => shift(-1)}
                        className="w-9 h-9 grid place-items-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--color-surface-200)] transition-colors"
                        aria-label="Previous month"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => shift(1)}
                        className="w-9 h-9 grid place-items-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--color-surface-200)] transition-colors"
                        aria-label="Next month"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Mini stats */}
            <div className="flex gap-3 mb-5">
                <div className="flex-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[var(--color-surface-200)] border border-[var(--border)]">
                    <span className="text-lg" style={{ filter: "drop-shadow(0 0 8px rgba(255,140,40,.5))" }} aria-hidden="true">🔥</span>
                    <div>
                        <div className="text-xl font-extrabold leading-none text-[var(--foreground)] tabular-nums">{trained.size}</div>
                        <div className="text-xs text-[var(--muted-foreground)] mt-1">days trained</div>
                    </div>
                </div>
                <div className="flex-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[var(--color-surface-200)] border border-[var(--border)]">
                    <span className="w-7 h-7 grid place-items-center rounded-lg text-sm" style={{ background: "oklch(0.45 0.15 290 / 0.25)" }} aria-hidden="true">🌙</span>
                    <div>
                        <div className="text-xl font-extrabold leading-none text-[var(--foreground)] tabular-nums">{rest.size}</div>
                        <div className="text-xs text-[var(--muted-foreground)] mt-1">rest days</div>
                    </div>
                </div>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 mb-1">
                {DOW.map((w) => (
                    <div key={w} className="text-center text-[11px] font-bold text-[var(--muted-foreground)] tracking-wide">{w}</div>
                ))}
            </div>

            {/* Weeks */}
            <div className="grid gap-0.5">
                {weeks.map((week, wi) => {
                    const runs = runsForWeek(week, trained);
                    return (
                        <div key={wi} className="relative h-12">
                            {/* Flame bars layer */}
                            <div className="absolute inset-0 grid grid-cols-7">
                                {runs.map((r, ri) => (
                                    <div
                                        key={ri}
                                        className="self-center h-[38px] mx-1 rounded-full"
                                        style={{
                                            gridColumn: `${r.s + 1} / ${r.e + 2}`,
                                            background: FLAME,
                                            boxShadow: "0 0 0 4px rgba(255,160,30,.10), 0 6px 16px rgba(255,110,0,.28)",
                                        }}
                                    />
                                ))}
                            </div>
                            {/* Numbers layer */}
                            <div className="relative grid grid-cols-7 h-12">
                                {week.map((day, ci) => {
                                    if (!day) return <div key={ci} />;
                                    const isTrained = trained.has(day);
                                    const isRest = rest.has(day);
                                    const isToday = todayNum === day;
                                    return (
                                        <div key={ci} className="grid place-items-center">
                                            <div
                                                className="w-9 h-9 grid place-items-center rounded-full text-sm font-bold tabular-nums"
                                                style={{
                                                    color: isTrained ? "#3a2207" : isRest ? "#fff" : "var(--muted-foreground)",
                                                    background: isRest ? REST_PIN : "transparent",
                                                    boxShadow: isRest
                                                        ? "0 4px 10px oklch(0.5 0.2 290 / 0.4)"
                                                        : isToday
                                                          ? "inset 0 0 0 2px var(--foreground)"
                                                          : "none",
                                                }}
                                            >
                                                {day}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 pt-3.5 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)] flex-wrap">
                <span className="inline-flex items-center gap-2">
                    <span className="w-[22px] h-[11px] rounded-full" style={{ background: "linear-gradient(90deg,#ff7d1a,#ffc83d)" }} /> Training streak
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: REST_PIN }} /> Rest day
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ boxShadow: "inset 0 0 0 2px var(--foreground)" }} /> Today
                </span>
            </div>
        </section>
    );
}
