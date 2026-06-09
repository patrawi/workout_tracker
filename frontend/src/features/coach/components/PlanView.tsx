import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { coachApi } from "@/lib/api/coach";
import { PLAN_DAY_TYPES, type PlanDayType, type PlanProposal, type PlanRow } from "../coach.types";
import { PlanReviewModal } from "./PlanReviewModal";

const PLAN_KEY = ["coach", "plan"] as const;

function formatWeight(r: PlanRow): string {
  if (r.is_bodyweight) return "BW";
  return r.target_weight != null ? `${r.target_weight}kg` : "—";
}

function DayCard({ day, rows, onPlanNext, planning }: {
  day: PlanDayType;
  rows: PlanRow[];
  onPlanNext: (day: PlanDayType) => void;
  planning: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="font-bold text-[var(--foreground)]">{day} Day</span>
        <button
          type="button"
          onClick={() => onPlanNext(day)}
          disabled={planning}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-bold text-[13px] cursor-pointer hover:brightness-110 disabled:opacity-50"
        >
          {planning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Plan next
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-[var(--muted-foreground)]">No plan yet — seed it or hit “Plan next”.</p>
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
  const queryClient = useQueryClient();
  const [proposal, setProposal] = useState<PlanProposal | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: PLAN_KEY,
    queryFn: async () => {
      const res = await coachApi.getPlan();
      if (res.success && res.data) return res.data;
      throw new Error(res.error || "Failed to load plan");
    },
  });

  const propose = useMutation({
    mutationFn: async (day: PlanDayType) => {
      const res = await coachApi.proposeNext(day);
      if (res.success && res.data) return res.data;
      throw new Error(res.error || "Failed to plan next session");
    },
    onSuccess: (p) => setProposal(p),
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-2 grid gap-4">
      {isLoading && <p className="text-[var(--muted-foreground)] text-sm">Loading plan…</p>}
      {isError && <p className="text-[oklch(0.72_0.14_25)] text-sm">Couldn’t load the plan.</p>}
      {propose.isError && <p className="text-[oklch(0.72_0.14_25)] text-sm">{(propose.error as Error).message}</p>}

      {data &&
        PLAN_DAY_TYPES.map((day) => (
          <DayCard
            key={day}
            day={day}
            rows={data[day] ?? []}
            onPlanNext={(d) => propose.mutate(d)}
            planning={propose.isPending && propose.variables === day}
          />
        ))}

      {proposal && (
        <PlanReviewModal
          proposal={proposal}
          onClose={() => setProposal(null)}
          onSaved={() => {
            setProposal(null);
            queryClient.invalidateQueries({ queryKey: PLAN_KEY });
          }}
        />
      )}
    </div>
  );
}
