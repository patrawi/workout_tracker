import { memo, useRef, useState } from "react";
import { Sparkles, Send } from "lucide-react";
import type { CoachMessage } from "../coach.types";
import { MarkdownMessage } from "./MarkdownMessage";

export function CoachAvatar({ size = 34 }: { size?: number }) {
    return (
        <div
            className="flex-none grid place-items-center rounded-xl text-[var(--primary-foreground)]"
            style={{ width: size, height: size, background: "linear-gradient(150deg,oklch(0.78 0.16 162),oklch(0.5 0.11 160))" }}
        >
            <Sparkles className="w-[18px] h-[18px]" />
        </div>
    );
}

function BubbleImpl({ m }: { m: CoachMessage }) {
    const user = m.role === "user";
    return (
        <div className={`flex gap-3 items-start ${user ? "flex-row-reverse" : ""}`}>
            {!user && <CoachAvatar />}
            <div className="max-w-[80%] sm:max-w-[76%] flex flex-col gap-1.5">
                {!user && m.reasoning && (
                    <details className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 text-[13px] text-[var(--muted-foreground)]">
                        <summary className="cursor-pointer select-none px-3 py-1.5 font-semibold">
                            💭 Show thinking
                        </summary>
                        <div className="px-3 pb-2.5 pt-0.5 whitespace-pre-wrap leading-relaxed border-t border-[var(--border)] mt-0.5">
                            {m.reasoning}
                        </div>
                    </details>
                )}
                <div
                    className={`px-4 py-3 rounded-2xl leading-relaxed text-[15px] border text-[var(--foreground)] ${
                        user
                            ? "bg-[var(--primary)]/10 border-[var(--primary)]/40 rounded-tr-sm whitespace-pre-wrap"
                            : "bg-[var(--secondary)] border-[var(--border)] rounded-tl-sm"
                    }`}
                >
                    {user ? m.text : <MarkdownMessage text={m.text} />}
                </div>
            </div>
        </div>
    );
}

// rerender-memo: existing bubbles don't re-render when a new message appends.
export const Bubble = memo(BubbleImpl);

export function TypingDots() {
    return (
        <div className="flex gap-3 items-start">
            <CoachAvatar />
            <div className="flex gap-1.5 px-4 py-4 rounded-2xl rounded-tl-sm bg-[var(--secondary)] border border-[var(--border)]">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)] animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                    />
                ))}
            </div>
        </div>
    );
}

export function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
    const [value, setValue] = useState("");
    const ref = useRef<HTMLTextAreaElement>(null);

    const submit = () => {
        if (!value.trim()) return;
        onSend(value);
        setValue("");
        if (ref.current) ref.current.style.height = "auto";
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    };

    const grow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const el = e.target;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 160) + "px";
        setValue(el.value);
    };

    const canSend = !!value.trim() && !disabled;

    return (
        <div>
            <div className="flex items-end gap-3 p-3 sm:p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] focus-within:border-[var(--primary)]/50 transition-colors">
                <textarea
                    ref={ref}
                    id="coach-input"
                    value={value}
                    onChange={grow}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder="Ask your coach…  ถามโค้ชของคุณ…"
                    className="flex-1 resize-none bg-transparent outline-none text-[var(--foreground)] text-[15px] leading-relaxed py-1.5 max-h-40 placeholder:text-[var(--muted-foreground)]"
                />
                <button
                    type="button"
                    onClick={submit}
                    disabled={!canSend}
                    aria-label="Send message"
                    className={`flex-none grid place-items-center w-11 h-11 rounded-xl transition-all ${
                        canSend
                            ? "bg-[var(--primary)] text-[var(--primary-foreground)] cursor-pointer"
                            : "bg-white/5 text-[var(--muted-foreground)] cursor-default"
                    }`}
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>
            <p className="text-center text-xs text-[var(--muted-foreground)] mt-2.5">
                Replies in Thai or English. Press Enter to send, Shift + Enter for newline.
            </p>
        </div>
    );
}
