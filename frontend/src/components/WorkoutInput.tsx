import { useState, useCallback, useRef, useEffect } from "react";

import { Moon } from "lucide-react";

interface WorkoutInputProps {
    onSubmit: (text: string, workoutDate: string) => Promise<void>;
    isLoading: boolean;
    onRestDay?: () => void;
    showRestDay?: boolean;
}

function getLocalDateTimeNow() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
}

export default function WorkoutInput({ onSubmit, isLoading, onRestDay, showRestDay }: WorkoutInputProps) {
    const [text, setText] = useState("");
    const [workoutDate, setWorkoutDate] = useState(getLocalDateTimeNow);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [text]);

    const handleSubmit = useCallback(async () => {
        if (!text.trim() || isLoading) return;
        await onSubmit(text.trim(), workoutDate);
        setText("");
        setWorkoutDate(getLocalDateTimeNow());
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    }, [text, workoutDate, isLoading, onSubmit]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                // Submit on generic Enter without shift (like a chat app)
                e.preventDefault();
                handleSubmit();
            }
        },
        [handleSubmit]
    );

    return (
        <section aria-label="Workout input">
            <div className="glass-card p-3 animate-slide-up flex flex-col gap-3 focus-within:ring-2 focus-within:ring-[var(--color-accent-400)] transition-shadow">
                <textarea
                    ref={textareaRef}
                    id="workout-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Log your workout e.g. 'rdl 100kg 8 reps'..."
                    disabled={isLoading}
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="send"
                    className="w-full px-3 py-2 text-base text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] resize-none bg-transparent outline-none max-h-[200px] overflow-y-auto"
                    style={{ minHeight: "24px" }}
                />

                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                    {/* Compact Date Picker */}
                    <div className="relative group">
                        <input
                            id="workout-date-input"
                            type="datetime-local"
                            value={workoutDate}
                            onChange={(e) => setWorkoutDate(e.target.value)}
                            className="bg-transparent text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-2 py-1 rounded cursor-pointer transition-colors outline-none focus:ring-1 focus:ring-[var(--color-accent-400)]"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Rest Day Toggle */}
                        {onRestDay && (
                            <button
                                type="button"
                                onClick={onRestDay}
                                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                                    showRestDay
                                        ? ""
                                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--color-surface-200)]"
                                }`}
                                style={showRestDay ? {
                                    background: "oklch(0.45 0.15 280 / 0.2)",
                                    color: "oklch(0.65 0.2 290)",
                                } : undefined}
                                title="Log Rest Day"
                            >
                                <Moon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Rest Day</span>
                            </button>
                        )}

                        {/* Submit Button — 44px tap target */}
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!text.trim() || isLoading}
                            className="flex items-center justify-center bg-[var(--color-accent-500)] hover:bg-[var(--color-accent-400)] text-[oklch(0.13_0.01_260)] w-11 h-11 rounded-xl outline-none transition-all disabled:opacity-50 disabled:shadow-none"
                            style={{ boxShadow: !text.trim() || isLoading ? "none" : "0 0 15px oklch(0.65 0.22 160 / 0.35)" }}
                            aria-label="Log Workout"
                            title="Press Enter to submit"
                        >
                            {isLoading ? (
                                <span
                                    className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full"
                                    style={{ animation: "spin 0.6s linear infinite" }}
                                    aria-hidden="true"
                                />
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 translate-x-[1px]">
                                    <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)] text-center mt-3">
                Log in Thai or English. Press <kbd className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] font-sans text-[10px]">Enter</kbd> to submit, <kbd className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] font-sans text-[10px]">Shift + Enter</kbd> for newline.
            </p>
        </section>
    );
}
