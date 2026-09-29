import { Trash2, X } from "lucide-react";
import { formatDateTime } from "@/lib/date-utils";
import type { CoachChatSession } from "../coachHistory";

interface ChatHistoryDrawerProps {
    open: boolean;
    sessions: CoachChatSession[];
    onClose: () => void;
    onResume: (session: CoachChatSession) => void;
    onDelete: (id: string) => void;
}

/** Archived-chats drawer — same right-side shell as KnowledgeDrawer. Sessions
 * are device-local (localStorage); resuming moves the chat back into the
 * current slot and out of the archive. */
export function ChatHistoryDrawer({ open, sessions, onClose, onResume, onDelete }: ChatHistoryDrawerProps) {
    return (
        <>
            <div
                onClick={onClose}
                className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
                style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
                aria-hidden="true"
            />
            <aside
                className="fixed top-0 right-0 bottom-0 w-[400px] max-w-[92%] z-50 bg-[var(--background)] border-l border-[var(--border)] flex flex-col shadow-2xl transition-transform duration-300"
                style={{ transform: open ? "translateX(0)" : "translateX(100%)" }}
                aria-label="Chat history"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <div className="font-bold text-[var(--foreground)]">Chat history</div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close chat history"
                        className="grid place-items-center w-8 h-8 rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 grid gap-2 content-start">
                    {sessions.length === 0 ? (
                        <p className="text-sm text-[var(--muted-foreground)] px-1">
                            No archived chats yet — press "New chat" to move the current
                            conversation here.
                        </p>
                    ) : (
                        sessions.map((s) => (
                            <div
                                key={s.id}
                                className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] pr-1.5"
                            >
                                <button
                                    type="button"
                                    onClick={() => onResume(s)}
                                    className="min-w-0 flex-1 text-left px-3.5 py-3 cursor-pointer"
                                >
                                    <span className="block text-[14px] font-semibold text-[var(--foreground)] truncate">
                                        {s.title}
                                    </span>
                                    <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">
                                        {formatDateTime(new Date(s.updatedAt).toISOString())} ·{" "}
                                        {s.messages.length} messages
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onDelete(s.id)}
                                    aria-label={`Delete chat: ${s.title}`}
                                    className="flex-none grid place-items-center w-8 h-8 rounded-lg text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </aside>
        </>
    );
}
