import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { heatmapApi, type HeatmapDay } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatDateLabel } from "@/lib/date-utils";

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getIntensity(count: number): number {
    if (count === 0) return 0;
    if (count <= 3) return 1;
    if (count <= 8) return 2;
    if (count <= 15) return 3;
    return 4;
}

export default function CalendarHeatmap() {
    const { data: heatmapData = [], isLoading } = useQuery({
        queryKey: queryKeys.heatmap.all,
        queryFn: async () => {
            const res = await heatmapApi.get();
            if (res.success && res.data) return res.data;
            return [];
        },
    });
    const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

    // Build the grid: 53 weeks × 7 days, ending on today
    const { grid, monthLabels, stats } = useMemo(() => {
        const dayMap = new Map<string, HeatmapDay>();
        for (const d of heatmapData) {
            dayMap.set(d.date, d);
        }

        const today = new Date();
        today.setHours(12, 0, 0, 0);

        // Find the start: go back to fill 53 complete weeks ending on today's weekday
        // Grid: columns = weeks, rows = days of week (0=Sun, 1=Mon, ..., 6=Sat)
        const todayDow = today.getDay(); // 0=Sun
        const totalDays = 53 * 7;
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - totalDays + 1 + (6 - todayDow));
        // Adjust start to a Sunday
        startDate.setDate(startDate.getDate() - startDate.getDay());

        const weeks: { date: string; count: number; dow: number; isRestDay?: boolean; walked_10k?: boolean; did_liss?: boolean; did_stretch?: boolean; }[][] = [];
        const months: { label: string; col: number }[] = [];
        let lastMonth = -1;

        const cursor = new Date(startDate);
        cursor.setHours(12, 0, 0, 0);

        for (let week = 0; week < 53; week++) {
            const weekDays: { date: string; count: number; dow: number; isRestDay?: boolean; walked_10k?: boolean; did_liss?: boolean; did_stretch?: boolean; }[] = [];
            for (let dow = 0; dow < 7; dow++) {
                const dateStr = cursor.toISOString().slice(0, 10);
                const isFuture = cursor > today;
                const d = dayMap.get(dateStr);
                weekDays.push({
                    date: dateStr,
                    count: isFuture ? -1 : (d?.count ?? 0),
                    dow,
                    isRestDay: isFuture ? false : (d?.isRestDay ?? false),
                    walked_10k: d?.walked_10k,
                    did_liss: d?.did_liss,
                    did_stretch: d?.did_stretch,
                });

                // Track month labels
                if (dow === 0 && cursor.getMonth() !== lastMonth && !isFuture) {
                    lastMonth = cursor.getMonth();
                    months.push({ label: MONTH_NAMES[cursor.getMonth()], col: week });
                }

                cursor.setDate(cursor.getDate() + 1);
            }
            weeks.push(weekDays);
        }

        // Calculate stats
        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 0;
        let totalDaysActive = 0;

        // Walk backward from today to compute current streak
        const walkBack = new Date(today);
        walkBack.setHours(12, 0, 0, 0);
        while (true) {
            const ds = walkBack.toISOString().slice(0, 10);
            const d = dayMap.get(ds);
            const isActivityDay = (d?.count ?? 0) > 0 || d?.isRestDay;

            if (isActivityDay) {
                currentStreak++;
                walkBack.setDate(walkBack.getDate() - 1);
            } else {
                break;
            }
        }

        // Walk forward through all data for longest streak and total days
        const allDates = Array.from(dayMap.keys()).sort();
        for (const ds of allDates) {
            const dObj = dayMap.get(ds);
            const isActivityDay = (dObj?.count ?? 0) > 0 || dObj?.isRestDay;
            if (isActivityDay) {
                totalDaysActive++;
            }
        }

        // Fix longest streak calculation: need to check consecutive dates
        longestStreak = 0;
        tempStreak = 0;
        let prevDate: Date | null = null;
        for (const ds of allDates) {
            const dObj = dayMap.get(ds);
            const isActivityDay = (dObj?.count ?? 0) > 0 || dObj?.isRestDay;
            const d = new Date(ds + "T12:00:00");

            if (isActivityDay) {
                if (prevDate && (d.getTime() - prevDate.getTime()) === 86400000) {
                    tempStreak++;
                } else {
                    tempStreak = 1;
                }
                longestStreak = Math.max(longestStreak, tempStreak);
                prevDate = d;
            } else {
                tempStreak = 0;
                prevDate = null;
            }
        }

        return { grid: weeks, monthLabels: months, stats: { currentStreak, longestStreak, totalDaysActive } };
    }, [heatmapData]);

    if (isLoading) {
        return (
            <section className="glass-card p-6 mb-8 animate-fade-in" aria-label="Activity heatmap loading">
                <div className="flex items-center gap-2 mb-4">
                    <div className="skeleton h-5 w-40" />
                </div>
                <div className="skeleton h-[120px] w-full rounded-lg" />
            </section>
        );
    }

    return (
        <section className="glass-card p-5 sm:p-6 mb-8 animate-fade-in" aria-label="Workout activity heatmap">
            {/* Header with stats */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                    <span className="text-[var(--chart-1)]">🔥</span>
                    Activity
                </h2>

                <div className="flex items-center gap-4 sm:gap-6">
                    <div className="text-center">
                        <div className="text-lg font-bold text-white tabular-nums">{stats.currentStreak}</div>
                        <div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium">
                            Current streak
                        </div>
                    </div>
                    <div className="w-px h-8 bg-[var(--border)]" />
                    <div className="text-center">
                        <div className="text-lg font-bold text-white tabular-nums">{stats.longestStreak}</div>
                        <div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium">
                            Longest streak
                        </div>
                    </div>
                    <div className="w-px h-8 bg-[var(--border)]" />
                    <div className="text-center">
                        <div className="text-lg font-bold text-white tabular-nums">{stats.totalDaysActive}</div>
                        <div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium">
                            Total days
                        </div>
                    </div>
                </div>
            </div>

            {/* Heatmap Grid */}
            <div className="overflow-x-auto -mx-2 px-2 pb-2">
                <div className="inline-flex gap-[3px]" style={{ minWidth: "max-content" }}>
                    {/* Day labels column */}
                    <div className="flex flex-col gap-[3px] pr-2">
                        {/* Spacer for month labels */}
                        <div className="h-[14px]" />
                        {DAY_LABELS.map((label, i) => (
                            <div
                                key={i}
                                className="h-[13px] text-[9px] text-[var(--muted-foreground)] font-medium flex items-center justify-end pr-1"
                                style={{ width: 24 }}
                            >
                                {label}
                            </div>
                        ))}
                    </div>

                    {/* Weeks */}
                    {grid.map((week, weekIdx) => (
                        <div key={weekIdx} className="flex flex-col gap-[3px]">
                            {/* Month label */}
                            <div className="h-[14px] flex items-end">
                                {monthLabels.find((m) => m.col === weekIdx) && (
                                    <span className="text-[9px] text-[var(--muted-foreground)] font-medium leading-none">
                                        {monthLabels.find((m) => m.col === weekIdx)!.label}
                                    </span>
                                )}
                            </div>

                            {/* Day cells */}
                            {week.map((day) => {
                                const intensity = day.count < 0 ? -1 : getIntensity(day.count);
                                return (
                                    <div
                                        key={day.date}
                                        className="heatmap-cell"
                                        data-intensity={intensity}
                                        data-type={day.isRestDay ? "rest" : "workout"}
                                        onMouseEnter={(e) => {
                                            if (day.count < 0) return;
                                            const rect = e.currentTarget.getBoundingClientRect();

                                            let text = "";
                                            if (day.isRestDay) {
                                                const acts = [];
                                                if (day.walked_10k) acts.push("10K Walk ✓");
                                                if (day.did_liss) acts.push("LISS ✓");
                                                if (day.did_stretch) acts.push("Stretch ✓");
                                                const actStr = acts.length > 0 ? ` — ${acts.join(", ")}` : "";
                                                text = `Rest Day${actStr} on ${formatDateLabel(day.date)}`;
                                            } else {
                                                text = day.count === 0
                                                    ? `No activity on ${formatDateLabel(day.date)}`
                                                    : `${day.count} set${day.count !== 1 ? "s" : ""} on ${formatDateLabel(day.date)}`;
                                            }

                                            setTooltip({ text, x: rect.left + rect.width / 2, y: rect.top - 8 });
                                        }}
                                        onMouseLeave={() => setTooltip(null)}
                                        aria-label={
                                            day.count < 0
                                                ? "Future date"
                                                : day.isRestDay ? "Rest day" : `${day.count} workout sets on ${day.date}`
                                        }
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-[var(--muted-foreground)]">
                <span className="mr-1">Less</span>
                <div className="heatmap-cell" data-intensity="0" style={{ cursor: "default" }} />
                <div className="heatmap-cell" data-intensity="1" style={{ cursor: "default" }} />
                <div className="heatmap-cell" data-intensity="2" style={{ cursor: "default" }} />
                <div className="heatmap-cell" data-intensity="3" style={{ cursor: "default" }} />
                <div className="heatmap-cell" data-intensity="4" style={{ cursor: "default" }} />
                <span className="ml-1">More</span>
            </div>

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="fixed z-50 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white pointer-events-none animate-fade-in"
                    style={{
                        left: tooltip.x,
                        top: tooltip.y,
                        transform: "translate(-50%, -100%)",
                        background: "oklch(0.22 0.015 260 / 0.95)",
                        border: "1px solid oklch(0.35 0.015 260)",
                        boxShadow: "0 4px 12px oklch(0 0 0 / 0.4)",
                    }}
                >
                    {tooltip.text}
                </div>
            )}
        </section>
    );
}
