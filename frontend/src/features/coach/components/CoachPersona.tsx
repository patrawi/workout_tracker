import { Sparkles, MessageCircle } from "lucide-react";

// Persona hero. NOTE: stats + insight below are static placeholders for v1.
// TODO: wire a real generated daily insight + streak/session stats.
export function CoachPersona({ onPlanWeek }: { onPlanWeek: () => void }) {
    return (
        <div>
            <div className="text-xs font-bold tracking-[0.16em] text-[var(--primary)] mb-3">YOUR COACH</div>
            <div
                className="rounded-2xl p-5 sm:p-6 border border-[var(--primary)]/40"
                style={{ background: "linear-gradient(155deg, color-mix(in oklab, var(--primary) 13%, transparent), transparent 62%)" }}
            >
                <div className="flex gap-4 sm:gap-5 items-start flex-wrap">
                    <div
                        className="flex-none grid place-items-center rounded-2xl text-[#04130d]"
                        style={{ width: 76, height: 76, background: "linear-gradient(150deg,#1bd092,#0e7a55)" }}
                    >
                        <Sparkles className="w-9 h-9" />
                    </div>
                    <div className="flex-1 min-w-[260px]">
                        <div className="text-2xl font-semibold text-[var(--foreground)] leading-tight">Coach Mali</div>
                        <p className="mt-2.5 leading-relaxed text-[var(--muted-foreground)] text-[15px]">
                            <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]/70 mr-2 font-mono">
                                Sample insight
                            </span>
                            Ask me anything about your training, nutrition, or technique — I read your logs and answer with your real numbers.
                        </p>
                    </div>
                </div>

                <div className="flex gap-2.5 mt-5 flex-wrap items-center">
                    <button
                        type="button"
                        onClick={onPlanWeek}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--primary)] text-[#04130d] font-bold text-sm cursor-pointer hover:brightness-110 transition"
                    >
                        <Sparkles className="w-4 h-4" /> Plan my week
                    </button>
                    <button
                        type="button"
                        onClick={() => document.getElementById("coach-input")?.focus()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--primary)]/40 bg-white/5 text-[var(--foreground)] font-semibold text-sm cursor-pointer hover:brightness-110 transition"
                    >
                        <MessageCircle className="w-4 h-4 text-[var(--primary)]" /> Ask anything
                    </button>
                </div>
            </div>
        </div>
    );
}
