import { useState, useCallback, useEffect } from "react";
import DialogBase from "./DialogBase";
import EstimateRangePanel from "./EstimateRangePanel";
import {
    useMealObservations,
    useMealObservationDetail,
    useReferenceSearch,
} from "@/features/nutrition-estimation/hooks/useMealObservations";
import { formatDate } from "@/lib/date-utils";
import type { CalculateObservationOutcome } from "@/types";

const r0 = (n: number) => Math.round(n);

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
 * calculation (unconfirmed drafts) go straight to the range + confirm view.
 */
export default function PendingMealDialog({ observationId, onClose, onLogged }: PendingMealDialogProps) {
    const { confirm, resolve, isConfirming, isResolving } = useMealObservations();
    const { data: detail, isLoading, error: detailError } = useMealObservationDetail(observationId);

    // Debounced search input (300 ms) — empty input never hits the wire.
    const [searchInput, setSearchInput] = useState("");
    const [debounced, setDebounced] = useState("");
    useEffect(() => {
        const t = setTimeout(() => setDebounced(searchInput.trim()), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    const {
        data: results,
        isFetching,
        error: searchError,
    } = useReferenceSearch(debounced.length > 0 ? debounced : null);

    const [resolved, setResolved] = useState<CalculateObservationOutcome | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handlePick = useCallback(
        async (referenceId: number) => {
            setError(null);
            try {
                const res = await resolve(observationId, referenceId);
                setResolved(res);
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

    const calculation = resolved?.revision.calculation ?? detail?.calculation ?? null;
    const explanation = resolved?.explanation ?? detail?.explanation ?? null;
    const reference = resolved?.reference ?? detail?.reference ?? null;
    const needsReference = detail !== undefined && calculation === null;

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
                                                        ? `${r0(c.weight_central ?? 0)} g`
                                                        : `${r0(c.weight_low ?? 0)}–${r0(c.weight_central ?? 0)}–${r0(c.weight_high ?? 0)} g`}
                                                    {" · "}
                                                    {Math.round(c.consumed_fraction * 100)}% eaten
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Reference search — only when there is nothing calculated yet */}
                            {needsReference && (
                                <div className="space-y-2">
                                    <label htmlFor="pending-ref-search" className="text-xs text-surface-400 block">
                                        Find a nutrition reference
                                    </label>
                                    <input
                                        id="pending-ref-search"
                                        type="text"
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                        placeholder="e.g. chicken rice / ข้าวมันไก่"
                                        className="glass-input w-full px-3 py-2.5 text-sm text-white"
                                    />
                                    {searchError && (
                                        <p role="alert" className="text-xs text-red-300">
                                            {searchError instanceof Error ? searchError.message : "Search failed"}
                                        </p>
                                    )}
                                    {isFetching && (
                                        <div className="space-y-2" aria-hidden="true">
                                            <div className="skeleton h-14 rounded-xl" />
                                            <div className="skeleton h-14 rounded-xl" />
                                        </div>
                                    )}
                                    {!isFetching && debounced.length === 0 && (
                                        <p className="text-xs text-surface-400">
                                            Type a food name to search the reference catalog.
                                        </p>
                                    )}
                                    {!isFetching && debounced.length > 0 && results && results.length === 0 && (
                                        <p className="text-xs text-surface-400">No references found.</p>
                                    )}
                                    {!isFetching && results && results.length > 0 && (
                                        <div className="space-y-2">
                                            {results.map((item) => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => handlePick(item.id)}
                                                    className="w-full text-left rounded-xl bg-surface-100/50 border border-surface-300/20 hover:border-emerald-500/50 transition-colors px-4 py-3"
                                                    aria-label={`Use reference ${item.name_en ?? item.name_th ?? item.id}`}
                                                >
                                                    <div className="text-sm text-white font-medium">
                                                        {item.name_en ?? item.name_th ?? `Reference #${item.id}`}
                                                    </div>
                                                    <div className="text-xs text-surface-400 mt-0.5">
                                                        {item.provider} v{item.version} · code {item.provider_food_code} ·{" "}
                                                        {r0(item.calories)} kcal / 100 g
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Resulting range (after resolve, or a draft that already has one) */}
                            {calculation && explanation && (
                                <EstimateRangePanel calculation={calculation} explanation={explanation} reference={reference} />
                            )}
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
                    {calculation && (
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={isConfirming || isResolving}
                            className="btn-primary text-sm flex items-center gap-2"
                        >
                            {isConfirming ? (
                                <>
                                    <span
                                        className="inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full"
                                        style={{ animation: "spin 0.6s linear infinite" }}
                                        aria-hidden="true"
                                    />
                                    Logging…
                                </>
                            ) : (
                                "Confirm & log"
                            )}
                        </button>
                    )}
                </div>
            </div>
        </DialogBase>
    );
}
