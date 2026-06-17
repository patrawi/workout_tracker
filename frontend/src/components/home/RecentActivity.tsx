import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { heatmapApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { recentActivity } from "@/lib/home-utils";
import { fromYMD } from "@/lib/date-utils";

export default function RecentActivity({ limit = 4 }: { limit?: number }) {
    const { data: heatmapData = [] } = useQuery({
        queryKey: queryKeys.heatmap.all,
        queryFn: async () => {
            const res = await heatmapApi.get();
            return res.success && res.data ? res.data : [];
        },
    });

    const rows = useMemo(() => recentActivity(heatmapData, limit), [heatmapData, limit]);

    return (
        <section className="glass-card p-5 sm:p-6" aria-label="Recent activity">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-[var(--foreground)]">Recent activity</h3>
                <Link to="/history" className="text-[13px] font-semibold text-[var(--chart-1)] hover:underline">
                    View all
                </Link>
            </div>

            {rows.length === 0 ? (
                <div className="py-7 text-center text-sm text-[var(--muted-foreground)]">No sessions yet.</div>
            ) : (
                <div className="grid gap-2">
                    {rows.map((it) => {
                        const d = fromYMD(it.date);
                        const day = d.toLocaleDateString("en-US", { weekday: "short" });
                        const num = d.getDate();
                        return (
                            <Link
                                key={it.date}
                                to={`/history/${it.date}`}
                                className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl bg-[var(--color-surface-200)] border border-[var(--border)] hover:border-[var(--chart-1)]/30 transition-colors"
                            >
                                <div className="text-center min-w-[42px]">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{day}</div>
                                    <div className="text-sm font-bold text-[var(--foreground)] mt-px tabular-nums">{num}</div>
                                </div>
                                <div className="w-px h-7 bg-[var(--border)]" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-semibold truncate ${it.isRestDay ? "text-[var(--muted-foreground)]" : "text-[var(--foreground)]"}`}>
                                            {it.isRestDay ? "Rest day" : "Workout"}
                                        </span>
                                        {it.isRestDay && <span className="text-sm" aria-hidden="true">🌙</span>}
                                    </div>
                                    <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                                        {it.isRestDay ? "Recovery" : `${it.sets} set${it.sets !== 1 ? "s" : ""} logged`}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
