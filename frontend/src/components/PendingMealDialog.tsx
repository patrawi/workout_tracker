import { useState, useCallback } from "react";
import DialogBase from "./DialogBase";
import EstimateRangePanel from "./EstimateRangePanel";
import BusyButton from "@/features/nutrition-estimation/components/BusyButton";
import ReferenceSearchPanel from "@/features/nutrition-estimation/components/ReferenceSearchPanel";
import {
    useMealObservations,
    useMealObservationDetail,
} from "@/features/nutrition-estimation/hooks/useMealObservations";
import {
    estimateFromDetail,
    estimateFromRecalculation,
} from "@/features/nutrition-estimation/estimate";
import { roundToWhole } from "@/features/nutrition-estimation/format";
import { formatDate } from "@/lib/date-utils";
import type { CalculateObservationOutcome } from "@/types";

interface PendingMealDialogProps {
    observationId: number;
    onClose: () => void;
    /** Flash a message on the page after confirming. */
    onLogged: (message: string) => void;
}

/**
 * Resolve dialog for a pending meal (design spec §7): shows the observation
 * detail; for reference-pending meals a debounced reference search lets the user
 * pick a candidate → resolve → recalculate → confirm. Meals that already carry a
 * calculation (unconfirmed drafts) go straight to the range + confirm view, with
 * a Change reference action (ADR 0020) reusing the same search.
 */
export default function PendingMealDialog({ observationId, onClose, onLogged }: PendingMealDialogProps) {
    const { confirm, resolve, isConfirming, isResolving } = useMealObservations();
    const { data: detail, isLoading, error: detailError } = useMealObservationDetail(observationId);

    const [resolved, setResolved] = useState<CalculateObservationOutcome | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [changeReferenceOpen, setChangeReferenceOpen] = useState(false);

    const handlePick = useCallback(
        async (referenceId: number) => {
            setError(null);
            try {
                const res = await resolve(observationId, referenceId);
                setResolved(res);
                setChangeReferenceOpen(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to resolve the reference.");
            }
        },
        [observationId, resolve],
    );

    const handleConfirm = useCallback(async () => {
        setError(null);
        try {
            await confirm(observationId);
            onLogged("Logged — daily totals updated");
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to confirm the meal.");
        }
    }, [observationId, confirm, onLogged, onClose]);

    /** A resolve recalculation wins over the detail's current estimate. */
    const estimate = resolved
        ? estimateFromRecalculation(resolved)
        : detail
            ? estimateFromDetail(detail)
            : null;
    const needsReference = detail !== undefined && estimate === null;

    const detailErrorMessage = detailError
        ? detailError instanceof Error
            ? detailError.message
            : "Failed to load the meal"
        : null;
    const banner = error ?? detailErrorMessage;

    return (
        <DialogBase open onClose={onClose} ariaLabel="Resolve pending meal" className="max-w-2xl">
            <div className="glass-card w-full flex flex-col animate-slide-up max-h-[85vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 pb-4 border-b border-surface-300/30">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-white">Pending meal</h2>
                            <p className="text-sm text-surface-400 mt-1">
                                {isLoading ? (
                                    <span className="skeleton inline-block h-4 w-40 align-middle" />
                                ) : detail ? (
                                    <>
                                        {detail.menu_name} · {formatDate(detail.date)}
                                    </>
                                ) : (
                                    ""
                                )}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-surface-400 hover:text-white transition-colors text-xl px-2 py-1 rounded-lg hover:bg-surface-200/50"
                            aria-label="Close pending meal dialog"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {banner && (
                        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            {banner}
                        </div>
                    )}

                    {isLoading && (
                        <div className="space-y-4" aria-hidden="true">
                            <div className="skeleton h-16 rounded-xl" />
                            <div className="skeleton h-16 rounded-xl" />
                            <div className="skeleton h-40 rounded-xl" />
                        </div>
                    )}

                    {!isLoading && detail && (
                        <>
                            {/* Components summary */}
                            {detail.components.length > 0 && (
                                <div className="rounded-xl bg-surface-100/50 border border-surface-300/20 p-4">
                                    <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
                                        Components
                                    </h3>
                                    <div className="space-y-1.5">
                                        {detail.components.map((c) => (
                                            <div key={c.id} className="flex items-baseline justify-between gap-3 text-sm">
                                                <span className="text-white">{c.name}</span>
                                                <span className="text-surface-400 tabular-nums text-xs whitespace-nowrap">
                                                    {c.weight_mode === "measured"
                                                        ? `${roundToWhole(c.weight_central ?? 0)} g`
                                                        : `${roundToWhole(c.weight_low ?? 0)}–${roundToWhole(c.weight_central ?? 0)}–${roundToWhole(c.weight_high ?? 0)} g`}
                                                    {" · "}
                                                    {Math.round(c.consumed_fraction * 100)}% eaten
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Reference search — always for reference-pending meals; on demand
                                to change the reference of an existing estimate (ADR 0020). */}
                            {needsReference && (
                                <ReferenceSearchPanel
                                    label="Find a nutrition reference"
                                    onPick={handlePick}
                                />
                            )}
                            {!needsReference && estimate && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setChangeReferenceOpen((open) => !open)}
                                            aria-expanded={changeReferenceOpen}
                                            className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                                        >
                                            {changeReferenceOpen ? "Hide reference search" : "Change reference"}
                                        </button>
                                    </div>
                                    {changeReferenceOpen && (
                                        <ReferenceSearchPanel
                                            label="Find a different reference"
                                            onPick={handlePick}
                                        />
                                    )}
                                </div>
                            )}

                            {/* Resulting range (after resolve, or a draft that already has one) */}
                            {estimate && <EstimateRangePanel estimate={estimate} />}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-surface-300/30">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:text-white hover:bg-surface-200/50 transition-colors"
                    >
                        Close
                    </button>
                    {estimate && (
                        <BusyButton
                            onClick={handleConfirm}
                            busy={isConfirming}
                            busyLabel="Logging…"
                            disabled={isConfirming || isResolving}
                            className="btn-primary text-sm flex items-center gap-2"
                        >
                            Confirm & log
                        </BusyButton>
                    )}
                </div>
            </div>
        </DialogBase>
    );
}
