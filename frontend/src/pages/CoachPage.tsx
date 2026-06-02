import { useEffect, useRef, useState } from "react";
import { Sparkles, BookOpen, ChevronRight, MessageSquare, ClipboardList } from "lucide-react";
import { useCoach } from "@/features/coach/hooks/useCoach";
import { SUGGESTIONS } from "@/features/coach/coach.utils";
import { Bubble, TypingDots, ChatInput } from "@/features/coach/components/ChatParts";
import { CoachPersona } from "@/features/coach/components/CoachPersona";
import { KnowledgeDrawer } from "@/features/coach/components/KnowledgeDrawer";
import { PlanView } from "@/features/coach/components/PlanView";
import { KB_CATEGORIES, KB_ARTICLES } from "@/features/coach/data/knowledge";

type CoachTab = "chat" | "plan";

interface DrawerState {
    open: boolean;
    id: string | null;
    cat?: string;
}

export default function CoachPage() {
    const { messages, send, reset, typing } = useCoach();
    const [drawer, setDrawer] = useState<DrawerState>({ open: false, id: null });
    const [tab, setTab] = useState<CoachTab>("chat");
    const scroller = useRef<HTMLDivElement>(null);
    const started = messages.length > 0;

    useEffect(() => {
        if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    }, [messages, typing]);

    return (
        <div className="relative flex flex-col" style={{ height: "calc(100vh - 8rem)" }}>
            {/* Chat | Plan tabs */}
            <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 pt-1 pb-3">
                <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-white/5 border border-[var(--border)]">
                    {([
                        { id: "chat", label: "Chat", Icon: MessageSquare },
                        { id: "plan", label: "Plan", Icon: ClipboardList },
                    ] as const).map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setTab(id)}
                            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                                tab === id
                                    ? "bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/40"
                                    : "text-[var(--muted-foreground)] border border-transparent hover:text-[var(--foreground)]"
                            }`}
                        >
                            <Icon className="w-4 h-4" /> {label}
                        </button>
                    ))}
                </div>
            </div>

            {tab === "plan" ? (
                <div className="flex-1 min-h-0 overflow-y-auto pb-5">
                    <PlanView />
                </div>
            ) : (
            <>
            <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto pb-5">
                <div className="max-w-3xl mx-auto px-4 sm:px-6">
                    {!started ? (
                        <div className="grid gap-5 pt-2">
                            <div>
                                <h1 className="m-0 text-3xl font-extrabold tracking-tight text-[var(--foreground)] flex items-center gap-3">
                                    <span
                                        className="grid place-items-center w-11 h-11 rounded-xl text-[#04130d]"
                                        style={{ background: "linear-gradient(150deg,#1bd092,#0e7a55)" }}
                                    >
                                        <Sparkles className="w-6 h-6" />
                                    </span>
                                    AI Coach
                                </h1>
                                <p className="mt-3 text-[var(--muted-foreground)] text-base">
                                    Ask about your training, nutrition, or technique — in Thai or English. I read your logs.
                                </p>
                            </div>

                            <CoachPersona onPlanWeek={() => send("Plan my week")} />

                            {/* Suggestions */}
                            <div>
                                <div className="text-[13px] text-[var(--muted-foreground)] font-semibold mb-3 uppercase tracking-wide">
                                    Try asking
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {SUGGESTIONS.map((s, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => send(s.en)}
                                            className="flex flex-col items-start text-left p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/40 transition cursor-pointer"
                                        >
                                            <span className="text-[15px] font-semibold text-[var(--foreground)]">{s.short}</span>
                                            <span className="text-[13px] text-[var(--muted-foreground)] mt-1">{s.th}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Knowledge base entry */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-[13px] text-[var(--muted-foreground)] font-semibold uppercase tracking-wide">
                                        Knowledge base
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setDrawer({ open: true, id: null, cat: "concepts" })}
                                        className="inline-flex items-center gap-1.5 text-[var(--primary)] font-semibold text-[13px] cursor-pointer"
                                    >
                                        Browse all <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {KB_CATEGORIES.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setDrawer({ open: true, id: null, cat: c.id })}
                                            className="flex items-center gap-3 text-left p-3.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/40 transition cursor-pointer"
                                        >
                                            <span className="text-xl">{c.emoji}</span>
                                            <span className="min-w-0">
                                                <span className="block text-[14.5px] font-bold text-[var(--foreground)]">{c.title}</span>
                                                <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">
                                                    {(KB_ARTICLES[c.id]?.length ?? 0)} articles
                                                </span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-4 pt-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2.5 font-extrabold text-lg text-[var(--foreground)]">
                                    <span
                                        className="grid place-items-center w-8 h-8 rounded-lg text-[#04130d]"
                                        style={{ background: "linear-gradient(150deg,#1bd092,#0e7a55)" }}
                                    >
                                        <Sparkles className="w-4 h-4" />
                                    </span>
                                    AI Coach
                                </div>
                                <button
                                    type="button"
                                    onClick={reset}
                                    className="px-3 py-1.5 rounded-full border border-[var(--border)] bg-white/5 text-[var(--foreground)] font-semibold text-[13px] cursor-pointer hover:brightness-110 transition"
                                >
                                    New chat
                                </button>
                            </div>
                            {messages.map((m, i) => (
                                <Bubble key={i} m={m} />
                            ))}
                            {typing && <TypingDots />}
                        </div>
                    )}
                </div>
            </div>

            {/* Input bar */}
            <div className="border-t border-[var(--border)] pt-4 pb-2">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-end gap-3">
                    <button
                        type="button"
                        onClick={() => setDrawer({ open: true, id: null })}
                        title="Knowledge base"
                        aria-label="Open knowledge base"
                        className="flex-none grid place-items-center w-11 h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer mb-8"
                    >
                        <BookOpen className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <ChatInput onSend={send} disabled={typing} />
                    </div>
                </div>
            </div>
            </>
            )}

            <KnowledgeDrawer
                open={drawer.open}
                articleId={drawer.id}
                initialCat={drawer.cat}
                onClose={() => setDrawer({ open: false, id: null })}
            />
        </div>
    );
}
