import type { HeatmapDay } from "@/lib/api";

/** A heatmap day is "active" when it has logged sets or is an explicit rest day. */
function isActive(d: HeatmapDay | undefined): boolean {
    return !!d && ((d.count ?? 0) > 0 || !!d.isRestDay);
}

function todayStr(): string {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    return t.toISOString().slice(0, 10);
}

/** Current streak: consecutive active days walking back from today. */
export function currentStreak(days: HeatmapDay[]): number {
    const map = new Map(days.map((d) => [d.date, d]));
    const cursor = new Date(todayStr() + "T12:00:00");
    let streak = 0;
    while (isActive(map.get(cursor.toISOString().slice(0, 10)))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

export interface RecentDay {
    date: string;
    isRestDay: boolean;
    sets: number;
}

/** Most recent active days (workouts or rest days), newest first. */
export function recentActivity(days: HeatmapDay[], limit: number): RecentDay[] {
    return days
        .filter((d) => isActive(d) && d.date <= todayStr())
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, limit)
        .map((d) => ({ date: d.date, isRestDay: !!d.isRestDay, sets: d.count ?? 0 }));
}

/** Time-of-day greeting (no name — the app has no user name). */
export function timeGreeting(now = new Date()): string {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
}
