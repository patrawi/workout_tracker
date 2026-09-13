// Shared primary action button with the inline spinner (S2.3). Replaces the
// spinner blocks pasted across LogMealModal and PendingMealDialog.
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface BusyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** True while the async action runs — shows the spinner and blocks clicks. */
    busy?: boolean;
    /** Label rendered next to the spinner while busy (e.g. "Saving…"). */
    busyLabel?: ReactNode;
}

/**
 * Action button that swaps its children for a spinner + busyLabel while busy.
 * Defaults to type="button"; extra classes and handlers pass through.
 */
export default function BusyButton({
    busy = false,
    busyLabel,
    children,
    disabled,
    type = "button",
    ...rest
}: BusyButtonProps) {
    return (
        <button type={type} disabled={disabled || busy} {...rest}>
            {busy ? (
                <>
                    <span
                        className="inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full"
                        style={{ animation: "spin 0.6s linear infinite" }}
                        aria-hidden="true"
                    />
                    {busyLabel}
                </>
            ) : (
                children
            )}
        </button>
    );
}
