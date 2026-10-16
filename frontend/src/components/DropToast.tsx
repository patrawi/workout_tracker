// Top-center drop-in toast: slides down from the screen edge on the iOS sheet
// spring, then exits with the drawer's gravity ease-in — the exit is an inline
// transition (same mechanism as the drawer's dismiss), immune to animation
// fill-mode conflicts, and a timer closes it deterministically afterwards.
import { useCallback, useEffect, useRef, useState } from "react";

interface DropToastProps {
    message: string;
    /** Milliseconds before it lifts back out. */
    duration?: number;
    /** Called after the exit transition finished — caller clears the message. */
    onDone: () => void;
}

export default function DropToast({ message, duration = 4000, onDone }: DropToastProps) {
    const [leaving, setLeaving] = useState(false);
    const doneRef = useRef(onDone);
    useEffect(() => {
        doneRef.current = onDone;
    }, [onDone]);

    const dismiss = useCallback(() => {
        setLeaving((was) => {
            if (was) return was;
            window.setTimeout(() => doneRef.current(), 300);
            return true;
        });
    }, []);

    useEffect(() => {
        const hide = window.setTimeout(dismiss, duration);
        return () => window.clearTimeout(hide);
    }, [duration, dismiss]);

    return (
        <div
            role="status"
            onClick={dismiss}
            style={
                leaving
                    ? {
                          transform: "translateY(-140%)",
                          opacity: 0,
                          transition:
                              "transform 0.28s cubic-bezier(0.55, 0, 1, 0.45), opacity 0.25s ease-in",
                      }
                    : undefined
            }
            className={`fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-50 w-[min(92vw,24rem)] -translate-x-1/2 cursor-pointer rounded-2xl border border-amber-400/30 bg-[oklch(0.18_0.02_260_/_0.92)] px-4 py-3 text-sm text-amber-200 shadow-xl backdrop-blur-md ${
                leaving ? "" : "animate-toast-drop"
            }`}
        >
            {message}
        </div>
    );
}
