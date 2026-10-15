import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import DialogBase from "./DialogBase";
import BusyButton from "@/features/nutrition-estimation/components/BusyButton";
import ImageSlot, { type AttachedImage } from "@/features/nutrition-estimation/components/ImageSlot";
import { useMealObservations } from "@/features/nutrition-estimation/hooks/useMealObservations";
import { mealObservationApi } from "@/lib/api/mealObservations";
import { estimateFromCreateOutcome, estimateFromRecalculation } from "@/features/nutrition-estimation/estimate";
import { roundToWhole, roundToOneDecimal } from "@/features/nutrition-estimation/format";
import type {
    CalculateObservationOutcome,
    CreateOutcome,
    MealComponentBreakdown,
    MealType,
} from "@/types";

// ——— Constants ———

const MEALS: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

type Step = "form" | "result";

// ——— Helpers ———

/** Per-component provenance (ADR 0026): what backed each component's numbers,
 * with a per-row "change" affordance to pick a different reference. */
function ProvenanceList({
    perComponent,
    searchPosition,
    onOpenSearch,
}: {
    perComponent: MealComponentBreakdown[];
    searchPosition: number | null;
    onOpenSearch: (position: number) => void;
}) {
    if (perComponent.length === 0) return null;
    return (
        <div className="rounded-xl border border-surface-300/20 p-3 space-y-1.5">
            <span className="text-xs text-surface-400">How each component was calculated</span>
            <ul className="space-y-2">
                {perComponent.map((c, i) => (
                    <li key={`${c.name}-${i}`} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-white truncate">{c.name}</span>
                            <span className="flex items-center gap-1.5 shrink-0">
                                {c.estimated ? (
                                    <span className="tag-pill text-xs text-amber-300">estimated · kind prior</span>
                                ) : (
                                    <span className="tag-pill text-xs text-emerald-300">
                                        reference · {c.reference?.name_th ?? c.reference?.name_en ?? `#${c.reference?.id ?? "?"}`}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onOpenSearch(i)}
                                    className="text-xs text-surface-400 hover:text-[var(--foreground)] px-1"
                                    aria-label={`Change reference for ${c.name}`}
                                >
                                    {searchPosition === i ? "cancel" : "change"}
                                </button>
                            </span>
                        </div>
                        {/* Central contribution per component (ADR 0030 — single numbers). */}
                        <div className="text-xs text-surface-400 tabular-nums pl-0.5">
                            {roundToWhole(c.consumed_weight_g.central)} g ·{" "}
                            {roundToWhole(c.contribution.calories.central)} kcal · P{" "}
                            {roundToOneDecimal(c.contribution.protein.central)} / C{" "}
                            {roundToOneDecimal(c.contribution.carbs.central)} / F{" "}
                            {roundToOneDecimal(c.contribution.fat.central)}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ——— Component ———

interface LogMealModalProps {
    open: boolean;
    onClose: () => void;
    /** Selected date on the Nutrition page (YYYY-MM-DD) — the default log date. */
    defaultDate: string;
    /** Flash a message on the page (success confirmations, reference-pending notice). */
    onLogged: (message: string) => void;
}

/**
 * One-flow meal logging (ADR 0030): photo + optional additional info → the VLM
 * estimates → auto create + confirm → result shows the photo and central
 * nutrition numbers. No portion modes, no range editing, no review step —
 * correction is post-hoc via the provenance list. Never-block: a failed
 * analysis stays on the form for retry; a failed confirm keeps a manual
 * fallback button. All state lives here; the parent only opens/closes
 * (remount via key to reset).
 */
export default function LogMealModal({ open, onClose, defaultDate, onLogged }: LogMealModalProps) {
    const { interpret, create, confirm, resolveComponent, isInterpreting, isCreating, isConfirming, isResolvingComponent } =
        useMealObservations();

    const [step, setStep] = useState<Step>("form");
    const [error, setError] = useState<string | null>(null);
    const [analyzeNotice, setAnalyzeNotice] = useState<string | null>(null);
    const [imageError, setImageError] = useState<string | null>(null);
    /** False until the auto (or manual) confirm dual-writes into nutrition_logs. */
    const [confirmed, setConfirmed] = useState(false);

    // Form state
    const [menuName, setMenuName] = useState("");
    const [meal, setMeal] = useState<MealType>("Breakfast");
    const [date, setDate] = useState(defaultDate);
    const [mealSource, setMealSource] = useState("");
    /** Additional info from the user (ADR 0028) — authoritative anchors the VLM
     * must honor (e.g. weights they measured) and persisted with the observation. */
    const [userNote, setUserNote] = useState("");
    const [beforeImage, setBeforeImage] = useState<AttachedImage | null>(null);
    const [afterImage, setAfterImage] = useState<AttachedImage | null>(null);

    // Result state
    const [outcome, setOutcome] = useState<CreateOutcome | null>(null);
    /** Recalculated detail after a per-component resolve (ADR 0026) — wins
     * over the create outcome's estimate. */
    const [updated, setUpdated] = useState<CalculateObservationOutcome | null>(null);
    const [searchPosition, setSearchPosition] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    // ——— Analyze → create → confirm (the whole flow, ADR 0030) ———

    const handleAnalyze = useCallback(async () => {
        setError(null);
        setAnalyzeNotice(null);
        if (!beforeImage) {
            setError("Attach a photo of the meal before eating.");
            return;
        }
        let res: CreateOutcome;
        try {
            const result = await interpret(
                menuName.trim(),
                beforeImage.base64,
                afterImage?.base64,
                userNote.trim() || undefined,
            );
            if (result.status !== "ok" || result.proposal.components.length === 0) {
                setAnalyzeNotice(
                    "Couldn't analyze the photo — try again (better light, full plate in frame) or add info describing the meal.",
                );
                return;
            }
            const proposal = result.proposal;
            // A low-confidence dish name arrives stripped to "" (ADR 0017).
            const dishName = proposal.dish_name.trim();
            if (!menuName.trim() && dishName) setMenuName(dishName);
            // Point weights only — the user never sees or edits ranges (ADR 0030);
            // the interval engine still runs (oil bands keep honest uncertainty).
            // Without an after image the fraction defaults to All (a valid ADR 0015
            // quartile); a VLM-proposed fraction arrives only with one.
            res = await create({
                date,
                meal,
                menu_name: menuName.trim() || dishName || "Logged meal",
                portion_mode: "estimated",
                ...(mealSource.trim() ? { meal_source: mealSource.trim() } : {}),
                ...(userNote.trim() ? { user_note: userNote.trim() } : {}),
                has_after_image: afterImage !== null,
                components: proposal.components.map((c) => ({
                    name: c.name,
                    kind: c.kind,
                    weight_g: { low: c.weight_g.central, central: c.weight_g.central, high: c.weight_g.central },
                    consumed_fraction: c.consumed_fraction ?? 1,
                    ...(c.latent_hints && c.latent_hints.length > 0 ? { latent_hints: c.latent_hints } : {}),
                })),
            });
        } catch {
            setAnalyzeNotice("Couldn't analyze the photo — check your connection and try again.");
            return;
        }
        setOutcome(res);
        setStep("result");
        // Auto-confirm dual-writes the central values into nutrition_logs (ADR 0022).
        // On failure the result stays open with a manual fallback (never-block).
        try {
            await confirm(res.observation.id);
            setConfirmed(true);
        } catch (err) {
            setError(
                err instanceof Error
                    ? `Saved as a draft, but logging failed: ${err.message} — press Confirm & log to retry.`
                    : "Saved as a draft, but logging failed — press Confirm & log to retry.",
            );
        }
    }, [menuName, beforeImage, afterImage, userNote, date, meal, mealSource, interpret, create, confirm]);

    // ——— Result rendering ———

    const estimate = updated
        ? estimateFromRecalculation(updated)
        : outcome
            ? estimateFromCreateOutcome(outcome)
            : null;

    const searchResults = useQuery({
        queryKey: ["mealObservationReferenceSearch", searchTerm],
        queryFn: async () => {
            const res = await mealObservationApi.searchReferenceCandidates(searchTerm, 8);
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Reference search failed");
        },
        enabled: searchPosition !== null && searchTerm.trim().length > 0,
    });

    const handlePickRef = useCallback(
        async (position: number, referenceId: number) => {
            if (!outcome) return;
            setError(null);
            try {
                const res = await resolveComponent(outcome.observation.id, position, referenceId);
                setUpdated(res);
                setSearchPosition(null);
                setSearchTerm("");
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to resolve the reference.");
            }
        },
        [outcome, resolveComponent],
    );

    /** Manual fallback when the auto-confirm failed (never-block, ADR 0030). */
    const handleConfirmRetry = useCallback(async () => {
        if (!outcome) return;
        setError(null);
        try {
            await confirm(outcome.observation.id);
            setConfirmed(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to confirm the meal.");
        }
    }, [outcome, confirm]);

    const handleClose = useCallback(() => {
        // The toast lands as the modal clears — the page behind shows fresh totals.
        if (confirmed) onLogged("Logged — daily totals updated");
        onClose();
    }, [confirmed, onLogged, onClose]);

    if (!open) return null;

    const stepLabels: Record<Step, string> = {
        form: "Step 1 of 2 — Details",
        result: "Step 2 of 2 — Result",
    };

    const busy = isInterpreting || isCreating || isConfirming || isResolvingComponent;

    return (
        <DialogBase open={open} onClose={handleClose} ariaLabel="Log a meal">
            <div className="glass-card w-full flex flex-col animate-slide-up max-h-[85vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 pb-4 border-b border-surface-300/30">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-white">Log a meal</h2>
                            <p className="text-sm text-surface-400 mt-1">{stepLabels[step]}</p>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="text-surface-400 hover:text-white transition-colors text-xl px-2 py-1 rounded-lg hover:bg-surface-200/50"
                            aria-label="Close log meal modal"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {error && (
                        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            {error}
                        </div>
                    )}

                    {/* ——— Step: form ——— */}
                    {step === "form" && (
                        <>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="log-meal-name" className="text-xs text-surface-400 block mb-1.5">
                                        Menu name <span className="text-surface-300/60">(optional — the AI can name it)</span>
                                    </label>
                                    <input
                                        id="log-meal-name"
                                        type="text"
                                        value={menuName}
                                        onChange={(e) => setMenuName(e.target.value)}
                                        placeholder="e.g. Khao man gai / ข้าวมันไก่"
                                        className="glass-input w-full px-3 py-2.5 text-sm text-white"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label htmlFor="log-meal-type" className="text-xs text-surface-400 block mb-1.5">
                                            Meal
                                        </label>
                                        <select
                                            id="log-meal-type"
                                            value={meal}
                                            onChange={(e) => setMeal(e.target.value as MealType)}
                                            className="glass-input w-full px-3 py-2.5 text-sm text-white"
                                        >
                                            {MEALS.map((m) => (
                                                <option key={m} value={m}>
                                                    {m}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="log-meal-date" className="text-xs text-surface-400 block mb-1.5">
                                            Date
                                        </label>
                                        <input
                                            id="log-meal-date"
                                            type="date"
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                            className="glass-input w-full px-3 py-2 text-sm text-white"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="log-meal-source" className="text-xs text-surface-400 block mb-1.5">
                                            Meal source <span className="text-surface-300/60">(optional)</span>
                                        </label>
                                        <input
                                            id="log-meal-source"
                                            type="text"
                                            value={mealSource}
                                            onChange={(e) => setMealSource(e.target.value)}
                                            placeholder="e.g. Canteen, home-cooked"
                                            className="glass-input w-full px-3 py-2.5 text-sm text-white"
                                        />
                                    </div>
                                </div>

                                {/* Additional info becomes authoritative constraints for the AI (ADR 0028). */}
                                <div>
                                    <label htmlFor="log-user-note" className="text-xs text-surface-400 block mb-1.5">
                                        Additional info <span className="text-surface-300/60">(optional — weights you know, what you skipped)</span>
                                    </label>
                                    <textarea
                                        id="log-user-note"
                                        value={userNote}
                                        onChange={(e) => setUserNote(e.target.value)}
                                        rows={2}
                                        maxLength={500}
                                        placeholder="e.g. ข้าวเหนียว 150 g, หมูพวง 180 g, ไม่กินน้ำจิ้ม"
                                        className="glass-input w-full px-3 py-2.5 text-sm text-white resize-none"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <ImageSlot
                                            label="Before photo"
                                            required
                                            inputLabel="Before photo"
                                            image={beforeImage}
                                            onAttach={setBeforeImage}
                                            onRemove={() => setBeforeImage(null)}
                                            onError={setImageError}
                                        />
                                        <ImageSlot
                                            label="After photo"
                                            hint="After eating — leftovers/broth"
                                            inputLabel="After photo"
                                            image={afterImage}
                                            onAttach={setAfterImage}
                                            onRemove={() => setAfterImage(null)}
                                            onError={setImageError}
                                        />
                                    </div>

                                    {imageError && (
                                        <p role="alert" className="text-xs text-amber-400">
                                            {imageError}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {analyzeNotice && (
                                <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                                    <span>{analyzeNotice}</span>
                                    <button
                                        type="button"
                                        onClick={() => setAnalyzeNotice(null)}
                                        className="text-amber-300/70 hover:text-amber-200 shrink-0"
                                        aria-label="Dismiss notice"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}

                            <p className="text-[11px] text-surface-400">
                                Analyzing saves and logs the meal automatically with the AI's estimate —
                                adjust any component afterwards from its provenance row below.
                            </p>
                        </>
                    )}

                    {/* ——— Step: result ——— */}
                    {step === "result" && outcome && (
                        <>
                            {confirmed ? (
                                <p className="text-xs text-emerald-300 flex items-center gap-1.5">
                                    <span aria-hidden>✓</span> Logged — included in today's totals
                                </p>
                            ) : (
                                <p className="text-xs text-amber-300">
                                    Saved as a draft — not in today's totals yet. Press Confirm &amp; log below.
                                </p>
                            )}

                            {outcome.match.tier === "gap" && (
                                <p className="text-xs text-surface-400">
                                    Some components had no catalog match — their numbers are coarse
                                    kind-prior estimates (marked below).
                                </p>
                            )}

                            {beforeImage && (
                                <img
                                    src={beforeImage.dataUrl}
                                    alt="Attached meal photo"
                                    className="w-full max-h-64 object-cover rounded-xl border border-surface-300/20"
                                />
                            )}

                            {estimate && (
                                <div className="space-y-3">
                                    {/* Central estimate only — no ranges (ADR 0030). */}
                                    <div className="rounded-xl border border-surface-300/20 p-4">
                                        <div className="flex items-baseline justify-between">
                                            <span className="text-3xl font-bold text-white tabular-nums">
                                                {roundToWhole(estimate.calculation.nutrients.calories.central)}
                                            </span>
                                            <span className="text-sm text-surface-400">kcal</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 mt-3">
                                            <div className="rounded-lg bg-surface-100/50 px-3 py-2">
                                                <span className="block text-[11px] text-surface-400">Protein</span>
                                                <span className="text-sm font-semibold text-white tabular-nums">
                                                    {roundToOneDecimal(estimate.calculation.nutrients.protein.central)} g
                                                </span>
                                            </div>
                                            <div className="rounded-lg bg-surface-100/50 px-3 py-2">
                                                <span className="block text-[11px] text-surface-400">Carbs</span>
                                                <span className="text-sm font-semibold text-white tabular-nums">
                                                    {roundToOneDecimal(estimate.calculation.nutrients.carbs.central)} g
                                                </span>
                                            </div>
                                            <div className="rounded-lg bg-surface-100/50 px-3 py-2">
                                                <span className="block text-[11px] text-surface-400">Fat</span>
                                                <span className="text-sm font-semibold text-white tabular-nums">
                                                    {roundToOneDecimal(estimate.calculation.nutrients.fat.central)} g
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <ProvenanceList
                                        perComponent={
                                            (updated ?? outcome).observation.calculation?.per_component ?? []
                                        }
                                        searchPosition={searchPosition}
                                        onOpenSearch={(i) => {
                                            setSearchPosition(searchPosition === i ? null : i);
                                            setSearchTerm("");
                                        }}
                                    />
                                    {searchPosition !== null && (
                                        <div className="rounded-xl border border-surface-300/20 p-3 space-y-2">
                                            <input
                                                type="text"
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                autoFocus
                                                placeholder="ค้นหาอ้างอิงอาหาร…"
                                                aria-label="Search nutrition references"
                                                className="glass-input w-full px-3 py-2 text-sm text-[var(--foreground)]"
                                            />
                                            {searchResults.isLoading && (
                                                <p className="text-xs text-surface-400">กำลังค้นหา…</p>
                                            )}
                                            {(searchResults.data ?? []).length > 0 && (
                                                <ul className="space-y-1">
                                                    {(searchResults.data ?? []).map((r) => (
                                                        <li key={r.id}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handlePickRef(searchPosition, r.id)}
                                                                className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg border border-surface-300/20 hover:border-[var(--primary)]/40 transition text-sm"
                                                            >
                                                                <span className="text-[var(--foreground)] truncate">
                                                                    {r.nameTh ?? r.nameEn ?? `#${r.id}`}
                                                                </span>
                                                                <span className="text-xs text-surface-400 shrink-0 tabular-nums">
                                                                    {Math.round(r.per100.calories)} kcal/100g
                                                                </span>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-surface-300/30">
                    {step === "form" && (
                        <>
                            <button
                                type="button"
                                onClick={handleClose}
                                className="px-5 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:text-white hover:bg-surface-200/50 transition-colors"
                            >
                                Cancel
                            </button>
                            <BusyButton
                                onClick={handleAnalyze}
                                busy={busy}
                                busyLabel="Analyzing…"
                                disabled={busy || !beforeImage}
                                className="btn-primary text-sm flex items-center gap-2"
                            >
                                Analyze photo
                            </BusyButton>
                        </>
                    )}

                    {step === "result" && outcome && (
                        confirmed ? (
                            <button
                                type="button"
                                onClick={handleClose}
                                className="px-5 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:text-white hover:bg-surface-200/50 transition-colors"
                            >
                                Done
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:text-white hover:bg-surface-200/50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <BusyButton
                                    onClick={handleConfirmRetry}
                                    busy={isConfirming}
                                    busyLabel="Logging…"
                                    disabled={busy || !estimate}
                                    className="btn-primary text-sm flex items-center gap-2"
                                >
                                    Confirm &amp; log
                                </BusyButton>
                            </>
                        )
                    )}
                </div>
            </div>
        </DialogBase>
    );
}
