import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { workoutsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getLocalDateStr } from "@/lib/date-utils";
import type { WorkoutRow } from "@/types";

interface ExerciseGroup {
    name: string;
    detail: string;
    tag: string;
    sets: number;
}

function summarize(rows: WorkoutRow[]): ExerciseGroup[] {
    const byExercise = new Map<string, WorkoutRow[]>();
    for (const r of rows) {
        const list = byExercise.get(r.exercise_name);
        if (list) list.push(r);
        else byExercise.set(r.exercise_name, [r]);
    }

    return Array.from(byExercise.values()).map((sets) => {
        // Display the heaviest set as representative.
        const top = sets.reduce((a, b) => (b.weight > a.weight ? b : a), sets[0]);
        const load = top.is_bodyweight ? "Bodyweight" : `${top.weight} kg`;
        return {
            name: top.exercise_name,
            detail: `${load} · ${top.reps} reps · ${sets.length} set${sets.length !== 1 ? "s" : ""}`,
            tag: top.muscle_group || "",
            sets: sets.length,
        };
    });
}

export default function TodayCard() {
    const today = getLocalDateStr();
    const { data: rows = [] } = useQuery({
        queryKey: queryKeys.workouts.byDate(today),
        queryFn: async () => {
            const res = await workoutsApi.getByDate(today);
            return res.success && res.data ? res.data : [];
        },
    });

    const groups = useMemo(() => summarize(rows), [rows]);
    const totalSets = rows.length;
    const has = groups.length > 0;

    return (
        <section className="glass-card p-5 sm:p-6" aria-label="Today's session">
            <div className={`flex items-center justify-between ${has ? "mb-3.5" : ""}`}>
                <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: "var(--chart-1)", boxShadow: "0 0 8px var(--chart-1)" }} />
                    <h3 className="text-base font-bold text-[var(--foreground)]">Today's session</h3>
                </div>
                {has && (
                    <span className="text-xs text-[var(--muted-foreground)]">
                        {groups.length} exercise{groups.length !== 1 ? "s" : ""} · {totalSets} set{totalSets !== 1 ? "s" : ""}
                    </span>
                )}
            </div>

            {has ? (
                <div className="grid">
                    {groups.map((g, i) => (
                        <div
                            key={g.name}
                            className={`flex items-center justify-between gap-3 py-2.5 ${i ? "border-t border-[var(--border)]" : ""}`}
                        >
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-[var(--foreground)] truncate">{g.name}</div>
                                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{g.detail}</div>
                            </div>
                            {g.tag && <span className="tag-pill shrink-0 uppercase tracking-wide">{g.tag}</span>}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="py-7 text-center text-sm text-[var(--muted-foreground)]">
                    Nothing logged yet — log above, or mark a rest day.
                </div>
            )}
        </section>
    );
}
