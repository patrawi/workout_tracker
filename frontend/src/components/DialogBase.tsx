import { useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";

interface DialogBaseProps {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    className?: string;
    ariaLabel?: string;
    ariaLabelledby?: string;
    /** Bottom drawer (mobile sheet): anchored to the viewport's bottom edge and
     *  full-bleed on phones; falls back to the centered card on sm+. */
    drawer?: boolean;
}

/**
 * Thin wrapper around native <dialog> with showModal().
 * closedby="any" enables light-dismiss (click backdrop to close) natively.
 * Includes a Safari fallback for browsers that don't support closedby.
 */
export default function DialogBase({
    open,
    onClose,
    children,
    className,
    ariaLabel,
    ariaLabelledby,
    drawer = false,
}: DialogBaseProps) {
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;

        if (open && !dialog.open) {
            dialog.showModal();
        } else if (!open && dialog.open) {
            dialog.close();
        }
    }, [open]);

    const handleClose = useCallback(() => {
        onClose();
    }, [onClose]);

    // Safari fallback: light-dismiss via click-on-backdrop detection
    useEffect(() => {
        const dialog = ref.current;
        if (!dialog || !open) return;

        if ("closedBy" in HTMLDialogElement.prototype) return;

        const handleClick = (e: MouseEvent) => {
            if (e.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            const inDialog =
                rect.top <= e.clientY &&
                e.clientY <= rect.top + rect.height &&
                rect.left <= e.clientX &&
                e.clientX <= rect.left + rect.width;
            if (!inDialog) {
                onClose();
            }
        };

        dialog.addEventListener("click", handleClick);
        return () => dialog.removeEventListener("click", handleClick);
    }, [open, onClose]);

    // Handle close event (fires on Esc, light-dismiss, or form submit)
    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        dialog.addEventListener("close", handleClose);
        return () => dialog.removeEventListener("close", handleClose);
    }, [handleClose]);

    return (
        <dialog
            ref={ref}
            closedby="any"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            className={`backdrop:bg-[oklch(0.05_0.005_260_/_0.7)] backdrop:backdrop-blur-sm bg-transparent p-0 overflow-visible ${
                drawer
                    ? // Bottom drawer: pinned to the bottom edge, full-bleed on phones;
                      // sm:m-auto (later in the cascade) restores the centered card on desktop.
                      "mt-auto mb-0 mx-auto sm:m-auto rounded-t-3xl sm:rounded-2xl w-full sm:w-[calc(100%-2rem)] max-h-[92dvh]"
                    : "m-auto rounded-2xl w-[calc(100%-2rem)] max-h-[85vh]"
            } ${className ?? "max-w-3xl"}`}
            style={{ overscrollBehavior: "contain" }}
        >
            {children}
        </dialog>
    );
}
