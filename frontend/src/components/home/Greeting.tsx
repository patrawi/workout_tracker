import { useQuery } from "@tanstack/react-query";
import { heatmapApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { currentStreak, timeGreeting } from "@/lib/home-utils";
import { formatFullDate, getLocalDateStr } from "@/lib/date-utils";

export default function Greeting() {
    const { data: heatmapData = [] } = useQuery({
        queryKey: queryKeys.heatmap.all,
        queryFn: async () => {
            const res = await heatmapApi.get();
            return res.success && res.data ? res.data : [];
        },
    });

    const streak = currentStreak(heatmapData);
    const dateLabel = formatFullDate(getLocalDateStr());

    return (
        <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--foreground)]">
                    {timeGreeting()}, Patrawi <span aria-hidden="true">👋</span>
                </h1>
                <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
                    {dateLabel}
                    {streak > 0 ? " · keep the streak alive." : " · log your first session."}
                </p>
            </div>

            {streak > 0 && (
                <div
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full"
                    style={{ border: "1px solid rgba(255,160,40,.32)", background: "rgba(255,150,30,.10)" }}
                >
                    <span className="text-lg" style={{ filter: "drop-shadow(0 0 8px rgba(255,140,40,.55))" }} aria-hidden="true">
                        🔥
                    </span>
                    <span className="text-sm font-extrabold tabular-nums" style={{ color: "#ffb454" }}>
                        {streak}
                    </span>
                    <span className="text-xs font-semibold text-[var(--muted-foreground)]">day streak</span>
                </div>
            )}
        </div>
    );
}
