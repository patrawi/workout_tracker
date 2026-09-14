import { useState, useCallback } from "react";
import DialogBase from "./DialogBase";
import EstimateRangePanel from "./EstimateRangePanel";
import BusyButton from "@/features/nutrition-estimation/components/BusyButton";
import ImageSlot, { type AttachedImage } from "@/features/nutrition-estimation/components/ImageSlot";
import ReferenceCandidateCard from "@/features/nutrition-estimation/components/ReferenceCandidateCard";
import ReferenceSearchPanel from "@/features/nutrition-estimation/components/ReferenceSearchPanel";
import { useMealObservations } from "@/features/nutrition-estimation/hooks/useMealObservations";
import {
    estimateFromCreateOutcome,
    estimateFromRecalculation,
} from "@/features/nutrition-estimation/estimate";
import { useRowList } from "@/features/nutrition-estimation/row-list";
import { cn } from "@/lib/utils";
import type {
    ComponentKind,
    CreateOutcome,
    CalculateObservationOutcome,
    LatentHint,
    MealType,
} from "@/types";

// ——— Constants ———

const MEALS: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

const KINDS: { value: ComponentKind; label: string }[] = [
    { value: "rice", label: "Rice" },
    { value: "main", label: "Main" },
    { value: "side", label: "Side" },
    { value: "broth", label: "Broth" },
    { value: "other", label: "Other" },
];

/** Fixed consumed-fraction choices when there is no after image (ADR 0015). */
const QUARTILES: { value: number; label: string }[] = [
    { value: 1, label: "All" },
    { value: 0.75, label: "3/4" },
    { value: 0.5, label: "1/2" },
    { value: 0.25, label: "1/4" },
];

const HINT_LABELS: Record<LatentHint["kind"], string> = {
    visible_oil: "Visible oil",
    dryness: "Dryness",
    remaining_broth: "Remaining broth",
};

/** Correctable levels per hint; picking "none" removes the hint entirely. */
const HINT_LEVEL_OPTIONS: { value: LatentHint["level"]; label: string }[] = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "none", label: "None (remove)" },
];

// ——— Local editable shapes ———

/** One editable component row in the review step. */
interface EditableComponent {
    name: string;
    kind: ComponentKind;
    low: string;
    central: string;
    high: string;
    /** Empty string = not yet picked — never an anchoring default (ADR 0017). */
    fraction: string;
    latentHints: LatentHint[];
}

/** One measured-weight row in the form step (measured mode). */
interface MeasuredRow {
    name: string;
    kind: ComponentKind;
    grams: string;
}

type Step = "form" | "review" | "result";

// ——— Helpers ———

function emptyComponent(): EditableComponent {
    return { name: "", kind: "other", low: "", central: "", high: "", fraction: "", latentHints: [] };
}

function emptyMeasuredRow(): MeasuredRow {
    return { name: "", kind: "main", grams: "" };
}

/** VLM proposal → editable rows. A stripped (low-confidence) fraction stays empty. */
function proposalToComponents(
    components: Array<{
        name: string;
        kind: ComponentKind;
        weight_g: { low: number; central: number; high: number };
        consumed_fraction?: number;
        latent_hints?: LatentHint[];
    }>,
): EditableComponent[] {
    return components.map((c) => ({
        name: c.name,
        kind: c.kind,
        low: String(c.weight_g.low),
        central: String(c.weight_g.central),
        high: String(c.weight_g.high),
        fraction: c.consumed_fraction !== undefined ? String(c.consumed_fraction) : "",
        latentHints: c.latent_hints ?? [],
    }));
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
 * Photo-first meal logging (design spec §1–§3): details → AI review → result.
 * Estimated mode sends the before/after photos to /interpret; the VLM proposal is
 * fully editable (AI is a proposer only, ADR 0017) and a failed/unavailable
 * analysis never blocks logging — it drops into manual entry. Measured mode logs
 * scale-measured component weights directly. All state lives here; the parent
 * only opens/closes (remount via key to reset).
 */
export default function LogMealModal({ open, onClose, defaultDate, onLogged }: LogMealModalProps) {
    const { interpret, create, confirm, resolve, isInterpreting, isCreating, isConfirming, isResolving } =
        useMealObservations();

    const [step, setStep] = useState<Step>("form");
    const [error, setError] = useState<string | null>(null);
    const [interpretNotice, setInterpretNotice] = useState<string | null>(null);
    const [imageError, setImageError] = useState<string | null>(null);

    // Form state
    const [menuName, setMenuName] = useState("");
    const [meal, setMeal] = useState<MealType>("Breakfast");
    const [date, setDate] = useState(defaultDate);
    const [mealSource, setMealSource] = useState("");
    const [mode, setMode] = useState<"estimated" | "measured">("estimated");
    const [beforeImage, setBeforeImage] = useState<AttachedImage | null>(null);
    const [afterImage, setAfterImage] = useState<AttachedImage | null>(null);

    // Review + result state
    const componentList = useRowList<EditableComponent>(emptyComponent);
    const measuredList = useRowList<MeasuredRow>(emptyMeasuredRow);
    const [outcome, setOutcome] = useState<CreateOutcome | null>(null);
    const [resolved, setResolved] = useState<CalculateObservationOutcome | null>(null);
    /** VLM dish-name proposal (stripped/low-confidence arrives as "" → null here). */
    const [vlmDishName, setVlmDishName] = useState<string | null>(null);
    const [dishNameUsed, setDishNameUsed] = useState(false);
    const [changeReferenceOpen, setChangeReferenceOpen] = useState(false);

    const hasAfterImage = afterImage !== null;

    // ——— Review-step hint editing (hints are correctable proposals, ADR 0017) ———

    const setHintLevel = useCallback(
        (rowIndex: number, kind: LatentHint["kind"], level: LatentHint["level"]) => {
            const entry = componentList.rows[rowIndex];
            if (!entry) return;
            // "none" removes the hint — nothing is sent for it (ADR 0017).
            const next =
                level === "none"
                    ? entry.row.latentHints.filter((h) => h.kind !== kind)
                    : entry.row.latentHints.map((h) => (h.kind === kind ? { ...h, level } : h));
            componentList.update(rowIndex, { latentHints: next });
        },
        [componentList],
    );

    const removeHint = useCallback(
        (rowIndex: number, kind: LatentHint["kind"]) => {
            const entry = componentList.rows[rowIndex];
            if (!entry) return;
            componentList.update(rowIndex, {
                latentHints: entry.row.latentHints.filter((h) => h.kind !== kind),
            });
        },
        [componentList],
    );

    // ——— Submission ———

    /** Form → review: run the VLM on the photos (estimated) or save directly (measured). */
    const handleFormContinue = useCallback(async () => {
        setError(null);
        const name = menuName.trim();
        if (!name) {
            setError("Menu name is required.");
            return;
        }
        if (mode === "measured") {
            // Measured mode: exact grams, no photos, straight to create.
            if (measuredList.rows.length === 0) {
                setError("Add at least one component.");
                return;
            }
            for (let i = 0; i < measuredList.rows.length; i++) {
                const row = measuredList.rows[i].row;
                if (!row.name.trim()) {
                    setError(`Component ${i + 1}: name is required.`);
                    return;
                }
                const grams = Number(row.grams);
                if (!Number.isFinite(grams) || grams <= 0) {
                    setError(`Component '${row.name.trim() || String(i + 1)}': enter a measured weight in grams.`);
                    return;
                }
            }
            try {
                const res = await create({
                    date,
                    meal,
                    menu_name: name,
                    portion_mode: "measured",
                    ...(mealSource.trim() ? { meal_source: mealSource.trim() } : {}),
                    components: measuredList.rows.map(({ row }) => ({
                        name: row.name.trim(),
                        kind: row.kind,
                        weight_g: Number(row.grams),
                        consumed_fraction: 1,
                    })),
                });
                setOutcome(res);
                setStep("result");
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to save the meal.");
            }
            return;
        }

        // Estimated mode: a before photo is required for the VLM pass.
        if (!beforeImage) {
            setError("Attach a photo of the meal before eating.");
            return;
        }
        try {
            const result = await interpret(name, beforeImage.base64, afterImage?.base64);
            if (result.status === "ok" && result.proposal.components.length > 0) {
                setInterpretNotice(null);
                componentList.replaceAll(proposalToComponents(result.proposal.components));
                // A low-confidence dish name arrives stripped to "" (ADR 0017) —
                // only a real proposal is surfaced.
                setVlmDishName(result.proposal.dish_name.trim() || null);
                setDishNameUsed(false);
            } else {
                // failed (no_food / unreadable) or unavailable — never block (ADR 0017).
                setInterpretNotice("Couldn't analyze the photo — enter components manually.");
                componentList.replaceAll([emptyComponent()]);
                setVlmDishName(null);
            }
            setStep("review");
        } catch {
            // Network/API failure — same fallback path.
            setInterpretNotice("Couldn't analyze the photo — enter components manually.");
            componentList.replaceAll([emptyComponent()]);
            setVlmDishName(null);
            setStep("review");
        }
    }, [
        menuName,
        mode,
        measuredList,
        beforeImage,
        afterImage,
        date,
        meal,
        mealSource,
        create,
        interpret,
        componentList,
    ]);

    /** Review → create (estimated mode, editable proposal or manual rows). */
    const handleReviewSubmit = useCallback(async () => {
        setError(null);
        if (componentList.rows.length === 0) {
            setError("Add at least one component.");
            return;
        }
        // Fractions confirmed against the after photo accept any value in (0, 1];
        // otherwise only the fixed quartile choices (ADR 0015). The review step is
        // estimated-mode only, but the payload field spells the mode out.
        const fractionFromAfterImage = mode === "estimated" && hasAfterImage;
        for (let i = 0; i < componentList.rows.length; i++) {
            const row = componentList.rows[i].row;
            const label = row.name.trim() || `Component ${i + 1}`;
            if (!row.name.trim()) {
                setError(`${label}: name is required.`);
                return;
            }
            const low = Number(row.low);
            const central = Number(row.central);
            const high = Number(row.high);
            if (![low, central, high].every(Number.isFinite) || !(low > 0 && low <= central && central <= high)) {
                setError(`${label}: weights must satisfy 0 < low ≤ central ≤ high.`);
                return;
            }
            if (row.fraction.trim() === "") {
                // No anchoring default: the fraction exists only once the user picks it.
                setError(`${label}: pick the eaten fraction.`);
                return;
            }
            const fraction = Number(row.fraction);
            if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
                setError(`${label}: eaten fraction must be between 0 and 1.`);
                return;
            }
            if (!fractionFromAfterImage && !QUARTILES.some((q) => Math.abs(fraction - q.value) < 1e-9)) {
                setError(`${label}: without an after photo the eaten fraction must be All, 3/4, 1/2 or 1/4.`);
                return;
            }
        }
        try {
            const res = await create({
                date,
                meal,
                menu_name: menuName.trim(),
                portion_mode: "estimated",
                ...(mealSource.trim() ? { meal_source: mealSource.trim() } : {}),
                has_after_image: fractionFromAfterImage,
                components: componentList.rows.map(({ row }) => ({
                    name: row.name.trim(),
                    kind: row.kind,
                    weight_g: { low: Number(row.low), central: Number(row.central), high: Number(row.high) },
                    consumed_fraction: Number(row.fraction),
                    ...(row.latentHints.length > 0
                        ? { latent_hints: row.latentHints.map(({ kind, level }) => ({ kind, level })) }
                        : {}),
                })),
            });
            setOutcome(res);
            setStep("result");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save the meal.");
        }
    }, [componentList, hasAfterImage, mode, date, meal, menuName, mealSource, create]);

    /** Candidate/reference picked → resolve → recalculate the displayed estimate. */
    const handlePickCandidate = useCallback(
        async (referenceId: number) => {
            if (!outcome) return;
            setError(null);
            try {
                const res = await resolve(outcome.observation.id, referenceId);
                setResolved(res);
                setChangeReferenceOpen(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to resolve the reference.");
            }
        },
        [outcome, resolve],
    );

    // ——— Result rendering ———

    /** A resolve/confirm recalculation wins over the create outcome's estimate. */
    const estimate = resolved
        ? estimateFromRecalculation(resolved)
        : outcome
            ? estimateFromCreateOutcome(outcome)
            : null;

    const handleConfirm = useCallback(async () => {
        if (!outcome) return;
        setError(null);
        try {
            await confirm(outcome.observation.id);
            onLogged("Logged — daily totals updated");
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to confirm the meal.");
        }
    }, [outcome, confirm, onLogged, onClose]);

    const handleClose = useCallback(() => {
        onClose();
    }, [onClose]);

    if (!open) return null;

    const stepLabels: Record<Step, string> = {
        form: "Step 1 of 3 — Details",
        review: "Step 2 of 3 — Review estimate",
        result: "Step 3 of 3 — Result",
    };

    const busy = isInterpreting || isCreating || isConfirming || isResolving;

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
                                        Menu name *
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

                                {/* Mode toggle */}
                                <div>
                                    <span className="text-xs text-surface-400 block mb-1.5">Portion mode</span>
                                    <div className="inline-flex rounded-xl border border-surface-300/30 p-1 gap-1" role="group" aria-label="Portion mode">
                                        {(["estimated", "measured"] as const).map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setMode(m)}
                                                aria-pressed={mode === m}
                                                className={cn(
                                                    "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                                                    mode === m ? "bg-white/10 text-white" : "text-surface-400 hover:text-white",
                                                )}
                                            >
                                                {m === "estimated" ? "Estimated" : "Measured"}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {mode === "estimated" ? (
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
                                ) : (
                                    /* Measured mode: exact component weights */
                                    <div className="space-y-3">
                                        <p className="text-xs text-surface-400">
                                            Enter each component's scale-measured weight — no photos needed.
                                        </p>
                                        {measuredList.rows.map((entry, i) => (
                                            <div key={entry.id} className="flex items-end gap-2">
                                                <div className="flex-1">
                                                    <label htmlFor={`measured-name-${i}`} className="text-xs text-surface-400 block mb-1">
                                                        Component {i + 1}
                                                    </label>
                                                    <input
                                                        id={`measured-name-${i}`}
                                                        type="text"
                                                        value={entry.row.name}
                                                        onChange={(e) => measuredList.update(i, { name: e.target.value })}
                                                        placeholder="e.g. Rice"
                                                        className="glass-input w-full px-3 py-2 text-sm text-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label htmlFor={`measured-kind-${i}`} className="text-xs text-surface-400 block mb-1">
                                                        Kind
                                                    </label>
                                                    <select
                                                        id={`measured-kind-${i}`}
                                                        value={entry.row.kind}
                                                        onChange={(e) => measuredList.update(i, { kind: e.target.value as ComponentKind })}
                                                        className="glass-input px-2 py-2 text-sm text-white"
                                                    >
                                                        {KINDS.map((k) => (
                                                            <option key={k.value} value={k.value}>
                                                                {k.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="w-28">
                                                    <label htmlFor={`measured-grams-${i}`} className="text-xs text-surface-400 block mb-1">
                                                        Grams
                                                    </label>
                                                    <input
                                                        id={`measured-grams-${i}`}
                                                        type="number"
                                                        inputMode="decimal"
                                                        min={0}
                                                        step="any"
                                                        value={entry.row.grams}
                                                        onChange={(e) => measuredList.update(i, { grams: e.target.value })}
                                                        className="glass-input w-full px-3 py-2 text-sm text-white tabular-nums text-right"
                                                    />
                                                </div>
                                                {measuredList.rows.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => measuredList.remove(i)}
                                                        className="text-xs text-red-400/60 hover:text-red-400 px-2 py-2 rounded-lg hover:bg-red-500/10"
                                                        aria-label={`Remove component ${i + 1}`}
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={measuredList.add}
                                            className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                                        >
                                            + Add component
                                        </button>
                                    </div>
                                )}
                            </div>

                            <p className="text-[11px] text-surface-400">
                                Estimated mode: the AI proposes components and weights from your photos — you
                                review and edit everything before saving. Logging is never blocked if the
                                analysis fails.
                            </p>
                        </>
                    )}

                    {/* ——— Step: review (estimated) ——— */}
                    {step === "review" && (
                        <>
                            {interpretNotice && (
                                <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                                    <span>{interpretNotice}</span>
                                    <button
                                        type="button"
                                        onClick={() => setInterpretNotice(null)}
                                        className="text-amber-300/70 hover:text-amber-200 shrink-0"
                                        aria-label="Dismiss notice"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}

                            {/* VLM dish-name proposal — user-owned menu name; adopting is optional (spec §2). */}
                            {vlmDishName && (
                                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-300/20 bg-surface-100/50 px-4 py-2.5 text-sm">
                                    <span className="text-surface-400">AI sees:</span>
                                    <span className="text-white font-medium">{vlmDishName}</span>
                                    {dishNameUsed ? (
                                        <span className="text-xs text-emerald-400">used for matching</span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMenuName(vlmDishName);
                                                setDishNameUsed(true);
                                            }}
                                            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
                                        >
                                            Use
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="space-y-3">
                                {componentList.rows.map((entry, i) => (
                                    <div key={entry.id} className="rounded-xl bg-surface-100/50 border border-surface-300/20 p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={entry.row.name}
                                                onChange={(e) => componentList.update(i, { name: e.target.value })}
                                                placeholder={`Component ${i + 1} name`}
                                                aria-label={`Component ${i + 1} name`}
                                                className="glass-input flex-1 px-3 py-2 text-sm text-white font-medium"
                                            />
                                            <select
                                                value={entry.row.kind}
                                                onChange={(e) => componentList.update(i, { kind: e.target.value as ComponentKind })}
                                                aria-label={`Component ${i + 1} kind`}
                                                className="glass-input px-2 py-2 text-sm text-white"
                                            >
                                                {KINDS.map((k) => (
                                                    <option key={k.value} value={k.value}>
                                                        {k.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => componentList.remove(i)}
                                                className="text-xs text-red-400/60 hover:text-red-400 px-2 py-2 rounded-lg hover:bg-red-500/10"
                                                aria-label={`Remove component ${i + 1}`}
                                            >
                                                Remove
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label htmlFor={`comp-low-${i}`} className="text-xs text-surface-400 block mb-1">
                                                    Low (g)
                                                </label>
                                                <input
                                                    id={`comp-low-${i}`}
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={0}
                                                    step="any"
                                                    value={entry.row.low}
                                                    onChange={(e) => componentList.update(i, { low: e.target.value })}
                                                    aria-label={`Component ${i + 1} low weight in grams`}
                                                    className="glass-input w-full px-3 py-2 text-sm text-white tabular-nums text-right"
                                                />
                                            </div>
                                            <div>
                                                <label htmlFor={`comp-central-${i}`} className="text-xs text-surface-400 block mb-1">
                                                    Central (g)
                                                </label>
                                                <input
                                                    id={`comp-central-${i}`}
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={0}
                                                    step="any"
                                                    value={entry.row.central}
                                                    onChange={(e) => componentList.update(i, { central: e.target.value })}
                                                    aria-label={`Component ${i + 1} central weight in grams`}
                                                    className="glass-input w-full px-3 py-2 text-sm text-white tabular-nums text-right"
                                                />
                                            </div>
                                            <div>
                                                <label htmlFor={`comp-high-${i}`} className="text-xs text-surface-400 block mb-1">
                                                    High (g)
                                                </label>
                                                <input
                                                    id={`comp-high-${i}`}
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={0}
                                                    step="any"
                                                    value={entry.row.high}
                                                    onChange={(e) => componentList.update(i, { high: e.target.value })}
                                                    aria-label={`Component ${i + 1} high weight in grams`}
                                                    className="glass-input w-full px-3 py-2 text-sm text-white tabular-nums text-right"
                                                />
                                            </div>
                                        </div>

                                        {/* Consumed fraction: free input with after photo, quartiles without.
                                            Nothing is preselected — a missing proposal fraction must not
                                            anchor to "all eaten" (ADR 0017). */}
                                        {hasAfterImage ? (
                                            <div>
                                                <label htmlFor={`comp-fraction-${i}`} className="text-xs text-surface-400 block mb-1">
                                                    Eaten fraction (0–1)
                                                </label>
                                                <input
                                                    id={`comp-fraction-${i}`}
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    value={entry.row.fraction}
                                                    onChange={(e) => componentList.update(i, { fraction: e.target.value })}
                                                    aria-label={`Component ${i + 1} eaten fraction`}
                                                    className="glass-input w-32 px-3 py-2 text-sm text-white tabular-nums text-right"
                                                />
                                            </div>
                                        ) : (
                                            <div>
                                                <span className="text-xs text-surface-400 block mb-1.5">Eaten fraction</span>
                                                <div
                                                    className="inline-flex rounded-xl border border-surface-300/30 p-1 gap-1"
                                                    role="group"
                                                    aria-label={`Component ${i + 1} eaten fraction`}
                                                >
                                                    {QUARTILES.map((q) => {
                                                        const active =
                                                            Number.isFinite(Number(entry.row.fraction)) &&
                                                            entry.row.fraction.trim() !== "" &&
                                                            Math.abs(Number(entry.row.fraction) - q.value) < 1e-9;
                                                        return (
                                                            <button
                                                                key={q.label}
                                                                type="button"
                                                                onClick={() => componentList.update(i, { fraction: String(q.value) })}
                                                                aria-pressed={active}
                                                                className={cn(
                                                                    "px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors",
                                                                    active ? "bg-white/10 text-white" : "text-surface-400 hover:text-white",
                                                                )}
                                                            >
                                                                {q.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Latent hints stay correctable proposals: level select + remove. */}
                                        {entry.row.latentHints.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-2">
                                                {entry.row.latentHints.map((h) => (
                                                    <span
                                                        key={h.kind}
                                                        className="tag-pill inline-flex items-center gap-1.5"
                                                    >
                                                        <span className="text-xs">{HINT_LABELS[h.kind]}</span>
                                                        <select
                                                            value={h.level}
                                                            onChange={(e) =>
                                                                setHintLevel(i, h.kind, e.target.value as LatentHint["level"])
                                                            }
                                                            aria-label={`Component ${i + 1} ${HINT_LABELS[h.kind]} level`}
                                                            className="bg-transparent text-xs text-white outline-none cursor-pointer"
                                                        >
                                                            {HINT_LEVEL_OPTIONS.map((o) => (
                                                                <option key={o.value} value={o.value}>
                                                                    {o.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeHint(i, h.kind)}
                                                            aria-label={`Remove ${HINT_LABELS[h.kind]} hint`}
                                                            className="text-surface-400 hover:text-white"
                                                        >
                                                            ✕
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                <button
                                    type="button"
                                    onClick={componentList.add}
                                    className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                                >
                                    + Add component
                                </button>
                            </div>
                        </>
                    )}

                    {/* ——— Step: result ——— */}
                    {step === "result" && outcome && (
                        <>
                            {outcome.match.tier === "gap" && (
                                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                                    Saved as reference-pending — no macros until a reference is added. Find it
                                    in the pending list below.
                                </div>
                            )}

                            {outcome.match.tier === "ambiguous" && !resolved && (
                                <div className="space-y-2">
                                    <p className="text-sm text-surface-400">
                                        Several references match "{menuName.trim()}" — pick the closest one.
                                    </p>
                                    {outcome.match.candidates.map((c) => (
                                        <ReferenceCandidateCard
                                            key={c.id}
                                            candidate={c}
                                            onPick={() => handlePickCandidate(c.id)}
                                        />
                                    ))}
                                </div>
                            )}

                            {estimate && (
                                <div className="space-y-3">
                                    {/* ADR 0020: the auto-selected reference is changeable, in place. */}
                                    <div className="flex items-center justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setChangeReferenceOpen((openState) => !openState)}
                                            aria-expanded={changeReferenceOpen}
                                            className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                                        >
                                            {changeReferenceOpen ? "Hide reference search" : "Change reference"}
                                        </button>
                                    </div>
                                    {changeReferenceOpen && (
                                        <ReferenceSearchPanel
                                            label="Find a different reference"
                                            onPick={handlePickCandidate}
                                        />
                                    )}
                                    <EstimateRangePanel estimate={estimate} />
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
                                onClick={handleFormContinue}
                                busy={isInterpreting || isCreating}
                                busyLabel={isInterpreting ? "Analyzing…" : "Saving…"}
                                disabled={busy || (mode === "estimated" && !beforeImage)}
                                className="btn-primary text-sm flex items-center gap-2"
                            >
                                {mode === "estimated" ? "Analyze photo" : "Save estimate"}
                            </BusyButton>
                        </>
                    )}

                    {step === "review" && (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    setError(null);
                                    setStep("form");
                                }}
                                className="px-5 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:text-white hover:bg-surface-200/50 transition-colors"
                            >
                                Back
                            </button>
                            <BusyButton
                                onClick={handleReviewSubmit}
                                busy={isCreating}
                                busyLabel="Saving…"
                                disabled={busy}
                                className="btn-primary text-sm flex items-center gap-2"
                            >
                                Save estimate
                            </BusyButton>
                        </>
                    )}

                    {step === "result" && outcome && (
                        <>
                            {outcome.match.tier === "gap" && !estimate ? (
                                <button type="button" onClick={handleClose} className="btn-primary text-sm">
                                    Close
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
                                        onClick={handleConfirm}
                                        busy={isConfirming}
                                        busyLabel="Logging…"
                                        disabled={busy || !estimate}
                                        className="btn-primary text-sm flex items-center gap-2"
                                    >
                                        Confirm & log
                                    </BusyButton>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </DialogBase>
    );
}
