import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import DialogBase from "@/components/DialogBase";
import { coachApi } from "@/lib/api/coach";
import type { PlanProposal, ProposedExercise } from "../coach.types";

const CHANGE_META = {
  increase: { Icon: ArrowUp, cls: "text-[var(--primary)] bg-[var(--primary)]/10 border-[var(--primary)]/30", label: "Increase" },
  decrease: { Icon: ArrowDown, cls: "text-[var(--chart-4)] bg-[var(--chart-4)]/10 border-[var(--chart-4)]/30", label: "Decrease" },
  hold: { Icon: Minus, cls: "text-[var(--muted-foreground)] bg-white/5 border-[var(--border)]", label: "Hold" },
} as const;

interface PlanReviewModalProps {
  proposal: PlanProposal;
  onClose: () => void;
  onSaved: () => void;
}

const numInput =
  "w-16 px-2 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]/50";

export function PlanReviewModal({ proposal, onClose, onSaved }: PlanReviewModalProps) {
  const [rows, setRows] = useState<ProposedExercise[]>(proposal.exercises);

  const update = (i: number, field: keyof ProposedExercise, value: string | number) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const save = useMutation({
    mutationFn: async () => {
      const exercises = rows.map(({ change, rationale, ...ex }) => {
        void change;
        void rationale;
        return ex;
      });
      const res = await coachApi.savePlan(proposal.day_type, exercises);
      if (res.success) return true;
      throw new Error(res.error || "Failed to save plan");
    },
    onSuccess: onSaved,
  });

  return (
    <DialogBase open onClose={onClose} ariaLabel={`Review next ${proposal.day_type} plan`} className="max-w-2xl">
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Next {proposal.day_type} session</h2>
          <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
            Proposed from your latest {proposal.day_type} session
            {proposal.based_on_date ? ` (${proposal.based_on_date.slice(0, 10)})` : " — no prior session found"}. Edit, then accept.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid gap-3">
          {rows.map((ex, i) => {
            const meta = CHANGE_META[ex.change];
            return (
              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--foreground)] text-[15px]">{ex.exercise_name}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${meta.cls}`}>
                    <meta.Icon className="w-3 h-3" /> {meta.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 text-sm text-[var(--muted-foreground)]">
                  <label className="flex items-center gap-1.5">
                    {ex.is_bodyweight ? (
                      <span className="text-[var(--foreground)]">Bodyweight</span>
                    ) : (
                      <>
                        <input
                          type="number"
                          value={ex.target_weight ?? 0}
                          onChange={(e) => update(i, "target_weight", Number(e.target.value))}
                          className={numInput}
                        />
                        kg
                      </>
                    )}
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="number" value={ex.sets} onChange={(e) => update(i, "sets", Number(e.target.value))} className={numInput} />
                    sets
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="number" value={ex.rep_low} onChange={(e) => update(i, "rep_low", Number(e.target.value))} className={numInput} />
                    –
                    <input type="number" value={ex.rep_high} onChange={(e) => update(i, "rep_high", Number(e.target.value))} className={numInput} />
                    reps
                  </label>
                  <label className="flex items-center gap-1.5">
                    RPE
                    <input type="number" value={ex.rpe_low} onChange={(e) => update(i, "rpe_low", Number(e.target.value))} className={numInput} />
                    –
                    <input type="number" value={ex.rpe_high} onChange={(e) => update(i, "rpe_high", Number(e.target.value))} className={numInput} />
                  </label>
                </div>

                {ex.rationale && (
                  <p className="mt-2.5 text-[13px] text-[var(--muted-foreground)] leading-relaxed rounded-lg bg-[var(--primary)]/5 px-3 py-2">
                    {ex.rationale}
                  </p>
                )}
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="text-[var(--muted-foreground)] text-sm">The coach returned no exercises. Try again.</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-end gap-3">
          {save.isError && <span className="text-sm text-[oklch(0.72_0.14_25)] mr-auto">{(save.error as Error).message}</span>}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[var(--border)] bg-white/5 text-[var(--foreground)] font-semibold text-sm cursor-pointer hover:brightness-110"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || rows.length === 0}
            className="px-4 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-bold text-sm cursor-pointer hover:brightness-110 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Accept & save"}
          </button>
        </div>
      </div>
    </DialogBase>
  );
}
