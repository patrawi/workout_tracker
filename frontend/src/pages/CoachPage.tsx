import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  BookOpen,
  ChevronRight,
  MessageSquare,
  ClipboardList,
  Edit3,
} from "lucide-react";
import { useCoach } from "@/features/coach/hooks/useCoach";
import { SUGGESTIONS } from "@/features/coach/coach.utils";
import {
  Bubble,
  TypingDots,
  ChatInput,
} from "@/features/coach/components/ChatParts";
import { CoachPersona } from "@/features/coach/components/CoachPersona";
import { KnowledgeDrawer } from "@/features/coach/components/KnowledgeDrawer";
import { PlanView } from "@/features/coach/components/PlanView";
import { KnowledgeEditorDrawer } from "@/features/coach/components/KnowledgeEditorDrawer";
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
  const [editorOpen, setEditorOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const started = messages.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  return (
    <div className="relative">
      {/* Persistent header: AI Coach brand left, Chat | Plan pill right */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-3 pb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 font-extrabold text-lg text-[var(--foreground)]">
          <span
            className="grid place-items-center w-8 h-8 rounded-lg text-[var(--primary-foreground)]"
            style={{ background: "linear-gradient(150deg,oklch(0.78 0.16 162),oklch(0.5 0.11 160))" }}
          >
            <Sparkles className="w-4 h-4" />
          </span>
          AI Coach
        </div>
        <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {(
            [
              { id: "chat", label: "Chat", Icon: MessageSquare },
              { id: "plan", label: "Plan", Icon: ClipboardList },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                tab === id
                  ? "text-[var(--primary)] border-[var(--primary)]/40 bg-[var(--primary)]/12"
                  : "text-[var(--muted-foreground)] border-transparent hover:text-[var(--foreground)]"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "plan" ? (
        <div className="pb-5">
          <PlanView />
        </div>
      ) : (
        <>
          <div className="pb-5">
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
              {!started ? (
                <div className="grid gap-5 pt-2">
                  <p className="text-[var(--muted-foreground)] text-base">
                    Ask about your training, nutrition, or technique — in Thai
                    or English. I read your logs.
                  </p>

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
                          <span className="text-[15px] font-semibold text-[var(--foreground)]">
                            {s.short}
                          </span>
                          <span className="text-[13px] text-[var(--muted-foreground)] mt-1">
                            {s.th}
                          </span>
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
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setEditorOpen(true)}
                          className="inline-flex items-center gap-1.5 text-[var(--primary)] font-semibold text-[13px] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit doc
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDrawer({ open: true, id: null, cat: "concepts" })
                          }
                          className="inline-flex items-center gap-1.5 text-[var(--primary)] font-semibold text-[13px] cursor-pointer"
                        >
                          Browse all <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {KB_CATEGORIES.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setDrawer({ open: true, id: null, cat: c.id })
                          }
                          className="flex items-center gap-3 text-left p-3.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/40 transition cursor-pointer"
                        >
                          <span className="text-xl">{c.emoji}</span>
                          <span className="min-w-0">
                            <span className="block text-[14.5px] font-bold text-[var(--foreground)]">
                              {c.title}
                            </span>
                            <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">
                              {KB_ARTICLES[c.id]?.length ?? 0} articles
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 pt-2">
                  <div className="flex justify-end items-center">
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
                  <div ref={bottomRef} />
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

      <KnowledgeEditorDrawer
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}
