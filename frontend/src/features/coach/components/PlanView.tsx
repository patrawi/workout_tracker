import { useQuery } from "@tanstack/react-query";
import { coachApi } from "@/lib/api/coach";
import { PLAN_DAY_TYPES, type PlanDayType, type PlanRow } from "../coach.types";

const PLAN_KEY = ["coach", "plan"] as const;

function formatWeight(r: PlanRow): string {
  if (r.is_bodyweight) return "BW";
  return r.target_weight != null ? `${r.target_weight}kg` : "—";
}

function formatUpdated(rows: PlanRow[]): string | null {
  const stamps = rows.map((r) => r.updated_at).filter((d): d is string => !!d);
  if (!stamps.length) return null;
  const latest = stamps.reduce((a, b) => (a > b ? a : b));
  const d = new Date(latest);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function DayCard({ day, rows }: { day: PlanDayType; rows: PlanRow[] }) {
  const updated = formatUpdated(rows);
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="font-bold text-[var(--foreground)]">{day} Day</span>
        {updated && (
          <span className="text-[12px] text-[var(--muted-foreground)]">อัปเดต {updated}</span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-[var(--muted-foreground)]">ยังไม่มีแพลน — ขอให้โค้ชวางแผนให้ในแชท</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="text-[var(--muted-foreground)]">
                <th className="text-left font-semibold px-4 py-2">Exercise</th>
                <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">Weight</th>
                <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">Sets × Reps</th>
                <th className="text-left font-semibold px-2 py-2 pr-4 whitespace-nowrap">RPE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 text-[var(--foreground)]">{r.exercise_name}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatWeight(r)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{r.sets} × {r.rep_low}{r.rep_high !== r.rep_low ? `–${r.rep_high}` : ""}</td>
                  <td className="px-2 py-2 pr-4 whitespace-nowrap">{r.rpe_low}{r.rpe_high !== r.rpe_low ? `–${r.rpe_high}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PlanView() {
  const { data, isLoading, isError } = useQuery({
    queryKey: PLAN_KEY,
    queryFn: async () => {
      const res = await coachApi.getPlan();
      if (res.success && res.data) return res.data;
      throw new Error(res.error || "Failed to load plan");
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-2 grid gap-4">
      {isLoading && <p className="text-[var(--muted-foreground)] text-sm">Loading plan…</p>}
      {isError && <p className="text-[oklch(0.72_0.14_25)] text-sm">Couldn’t load the plan.</p>}

      {data &&
        PLAN_DAY_TYPES.map((day) => (
          <DayCard key={day} day={day} rows={data[day] ?? []} />
        ))}
    </div>
  );
}
