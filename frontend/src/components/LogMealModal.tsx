import { useState, useCallback } from "react";
import type { ChangeEvent } from "react";
import DialogBase from "./DialogBase";
import EstimateRangePanel from "./EstimateRangePanel";
import { useMealObservations } from "@/features/nutrition-estimation/hooks/useMealObservations";
import { cn } from "@/lib/utils";
import type {
    CalculateObservationOutcome,
    ComponentKind,
    CreateOutcome,
    LatentHint,
    MealType,
} from "@/types";

// ——— Constants ———

/** Binary cap before base64 encoding (server accepts up to 8M base64 chars). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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

// ——— Local editable shapes ———

/** Attached photo kept as base64 (for interpret) + data URL (for the preview). */
interface AttachedImage {
    base64: string;
    dataUrl: string;
}

/** One editable component row in the review step. */
interface EditableComponent {
    name: string;
    kind: ComponentKind;
    low: string;
    central: string;
    high: string;
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

function readFileAsImage(file: File): Promise<AttachedImage> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result);
            // Strip the data: prefix — the API wants raw base64.
            const comma = dataUrl.indexOf(",");
            resolve({ base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl, dataUrl });
        };
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
    });
}

function emptyComponent(): EditableComponent {
    return { name: "", kind: "other", low: "", central: "", high: "", fraction: "1", latentHints: [] };
}

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
        fraction: c.consumed_fraction !== undefined ? String(c.consumed_fraction) : "1",
        latentHints: c.latent_hints ?? [],
    }));
}

const r1 = (n: number) => Math.round(n * 10) / 10;

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
    const [menuImage, setMenuImage] = useState<AttachedImage | null>(null);
    const [measuredRows, setMeasuredRows] = useState<MeasuredRow[]>([{ name: "", kind: "main", grams: "" }]);

    // Review + result state
    const [components, setComponents] = useState<EditableComponent[]>([]);
    const [outcome, setOutcome] = useState<CreateOutcome | null>(null);
    const [resolved, setResolved] = useState<CalculateObservationOutcome | null>(null);

    const hasAfterImage = mode === "estimated" && afterImage !== null;

    // ——— Image handling ———

    const handleFile = useCallback(
        async (slot: "before" | "after" | "menu", e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            if (!file) return;
            if (file.size > MAX_IMAGE_BYTES) {
                setImageError(`"${file.name}" is over 4 MB — pick a smaller image.`);
                return;
            }
            setImageError(null);
            try {
                const img = await readFileAsImage(file);
                if (slot === "before") setBeforeImage(img);
                else if (slot === "after") setAfterImage(img);
                else setMenuImage(img);
            } catch {
                setImageError("Could not read that file — try another image.");
            }
        },
        [],
    );

    const removeImage = useCallback((slot: "before" | "after" | "menu") => {
        if (slot === "before") setBeforeImage(null);
        else if (slot === "after") setAfterImage(null);
        else setMenuImage(null);
    }, []);

    // ——— Review-step row editing (immutable updates) ———

    const updateComponent = useCallback((index: number, field: keyof EditableComponent, value: string) => {
        setComponents((prev) => {
            const copy = [...prev];
            copy[index] = { ...copy[index], [field]: value };
            return copy;
        });
    }, []);

    const removeComponent = useCallback((index: number) => {
        setComponents((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const addComponent = useCallback(() => {
        setComponents((prev) => [...prev, emptyComponent()]);
    }, []);

    const updateMeasuredRow = useCallback((index: number, field: keyof MeasuredRow, value: string) => {
        setMeasuredRows((prev) => {
            const copy = [...prev];
            copy[index] = { ...copy[index], [field]: value };
            return copy;
        });
    }, []);

    const removeMeasuredRow = useCallback((index: number) => {
        setMeasuredRows((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const addMeasuredRow = useCallback(() => {
        setMeasuredRows((prev) => [...prev, { name: "", kind: "main", grams: "" }]);
    }, []);

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
            if (measuredRows.length === 0) {
                setError("Add at least one component.");
                return;
            }
            for (let i = 0; i < measuredRows.length; i++) {
                const row = measuredRows[i];
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
                    components: measuredRows.map((row) => ({
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
                setComponents(proposalToComponents(result.proposal.components));
            } else {
                // failed (no_food / unreadable) or unavailable — never block (ADR 0017).
                setInterpretNotice("Couldn't analyze the photo — enter components manually.");
                setComponents([emptyComponent()]);
            }
            setStep("review");
        } catch {
            // Network/API failure — same fallback path.
            setInterpretNotice("Couldn't analyze the photo — enter components manually.");
            setComponents([emptyComponent()]);
            setStep("review");
        }
    }, [menuName, mode, measuredRows, beforeImage, afterImage, date, meal, mealSource, create, interpret]);

    /** Review → create (estimated mode, editable proposal or manual rows). */
    const handleReviewSubmit = useCallback(async () => {
        setError(null);
        if (components.length === 0) {
            setError("Add at least one component.");
            return;
        }
        for (let i = 0; i < components.length; i++) {
            const row = components[i];
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
            const fraction = Number(row.fraction);
            if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
                setError(`${label}: eaten fraction must be between 0 and 1.`);
                return;
            }
            if (!hasAfterImage && !QUARTILES.some((q) => Math.abs(fraction - q.value) < 1e-9)) {
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
                has_after_image: hasAfterImage,
                components: components.map((row) => ({
                    name: row.name.trim(),
                    kind: row.kind,
                    weight_g: { low: Number(row.low), central: Number(row.central), high: Number(row.high) },
                    consumed_fraction: Number(row.fraction),
                })),
            });
            setOutcome(res);
            setStep("result");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save the meal.");
        }
    }, [components, hasAfterImage, date, meal, menuName, mealSource, create]);

    /** Ambiguous match → user picked a reference → recalculate. */
    const handlePickCandidate = useCallback(
        async (referenceId: number) => {
            if (!outcome) return;
            setError(null);
            try {
                const res = await resolve(outcome.observation.id, referenceId);
                setResolved(res);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to resolve the reference.");
            }
        },
        [outcome, resolve],
    );

    // ——— Result rendering pieces ———

    const calculation = resolved?.revision.calculation ?? outcome?.observation.calculation ?? null;
    const explanation = resolved?.explanation ?? outcome?.explanation ?? null;
    const reference =
        resolved?.reference ??
        (outcome && (outcome.match.tier === "manual" || outcome.match.tier === "auto")
            ? outcome.match.reference
            : null);

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
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            {/* Before photo */}
                                            <div>
                                                <label className="text-xs text-white font-medium block mb-1.5">
                                                    Before photo *
                                                </label>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    aria-label="Before photo"
                                                    onChange={(e) => handleFile("before", e)}
                                                    className="block w-full text-xs text-surface-400 file:mr-2 file:rounded-lg file:border-0 file:bg-white/5 file:px-3 file:py-2 file:text-xs file:text-white file:cursor-pointer"
                                                />
                                                {beforeImage && (
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <img
                                                            src={beforeImage.dataUrl}
                                                            alt="Before photo preview"
                                                            className="h-20 w-20 rounded-lg object-cover border border-surface-300/30"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => removeImage("before")}
                                                            className="text-xs text-red-400/70 hover:text-red-400"
                                                            aria-label="Remove before photo"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* After photo */}
                                            <div>
                                                <label className="text-xs text-white font-medium block mb-1.5">
                                                    After photo <span className="text-surface-400">(optional)</span>
                                                </label>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    aria-label="After photo"
                                                    onChange={(e) => handleFile("after", e)}
                                                    className="block w-full text-xs text-surface-400 file:mr-2 file:rounded-lg file:border-0 file:bg-white/5 file:px-3 file:py-2 file:text-xs file:text-white file:cursor-pointer"
                                                />
                                                <p className="text-[11px] text-surface-400 mt-1.5">
                                                    After eating — leftovers/broth
                                                </p>
                                                {afterImage && (
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <img
                                                            src={afterImage.dataUrl}
                                                            alt="After photo preview"
                                                            className="h-20 w-20 rounded-lg object-cover border border-surface-300/30"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => removeImage("after")}
                                                            className="text-xs text-red-400/70 hover:text-red-400"
                                                            aria-label="Remove after photo"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Menu/label photo */}
                                            <div>
                                                <label className="text-xs text-white font-medium block mb-1.5">
                                                    Menu photo <span className="text-surface-400">(optional)</span>
                                                </label>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    aria-label="Menu photo"
                                                    onChange={(e) => handleFile("menu", e)}
                                                    className="block w-full text-xs text-surface-400 file:mr-2 file:rounded-lg file:border-0 file:bg-white/5 file:px-3 file:py-2 file:text-xs file:text-white file:cursor-pointer"
                                                />
                                                <p className="text-[11px] text-surface-400 mt-1.5">
                                                    Canteen menu photo — kept for a future update
                                                </p>
                                                {menuImage && (
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <img
                                                            src={menuImage.dataUrl}
                                                            alt="Menu photo preview"
                                                            className="h-20 w-20 rounded-lg object-cover border border-surface-300/30"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => removeImage("menu")}
                                                            className="text-xs text-red-400/70 hover:text-red-400"
                                                            aria-label="Remove menu photo"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
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
                                        {measuredRows.map((row, i) => (
                                            <div key={i} className="flex items-end gap-2">
                                                <div className="flex-1">
                                                    <label htmlFor={`measured-name-${i}`} className="text-xs text-surface-400 block mb-1">
                                                        Component {i + 1}
                                                    </label>
                                                    <input
                                                        id={`measured-name-${i}`}
                                                        type="text"
                                                        value={row.name}
                                                        onChange={(e) => updateMeasuredRow(i, "name", e.target.value)}
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
                                                        value={row.kind}
                                                        onChange={(e) => updateMeasuredRow(i, "kind", e.target.value)}
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
                                                        value={row.grams}
                                                        onChange={(e) => updateMeasuredRow(i, "grams", e.target.value)}
                                                        className="glass-input w-full px-3 py-2 text-sm text-white tabular-nums text-right"
                                                    />
                                                </div>
                                                {measuredRows.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeMeasuredRow(i)}
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
                                            onClick={addMeasuredRow}
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

                            <div className="space-y-3">
                                {components.map((row, i) => (
                                    <div key={i} className="rounded-xl bg-surface-100/50 border border-surface-300/20 p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={row.name}
                                                onChange={(e) => updateComponent(i, "name", e.target.value)}
                                                placeholder={`Component ${i + 1} name`}
                                                aria-label={`Component ${i + 1} name`}
                                                className="glass-input flex-1 px-3 py-2 text-sm text-white font-medium"
                                            />
                                            <select
                                                value={row.kind}
                                                onChange={(e) => updateComponent(i, "kind", e.target.value)}
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
                                                onClick={() => removeComponent(i)}
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
                                                    value={row.low}
                                                    onChange={(e) => updateComponent(i, "low", e.target.value)}
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
                                                    value={row.central}
                                                    onChange={(e) => updateComponent(i, "central", e.target.value)}
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
                                                    value={row.high}
                                                    onChange={(e) => updateComponent(i, "high", e.target.value)}
                                                    aria-label={`Component ${i + 1} high weight in grams`}
                                                    className="glass-input w-full px-3 py-2 text-sm text-white tabular-nums text-right"
                                                />
                                            </div>
                                        </div>

                                        {/* Consumed fraction: free input with after photo, quartiles without */}
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
                                                    value={row.fraction}
                                                    onChange={(e) => updateComponent(i, "fraction", e.target.value)}
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
                                                            Number.isFinite(Number(row.fraction)) &&
                                                            Math.abs(Number(row.fraction) - q.value) < 1e-9;
                                                        return (
                                                            <button
                                                                key={q.label}
                                                                type="button"
                                                                onClick={() => updateComponent(i, "fraction", String(q.value))}
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

                                        {row.latentHints.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {row.latentHints.map((h, hi) => (
                                                    <span key={hi} className="tag-pill">
                                                        {HINT_LABELS[h.kind]} · {h.level}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                <button
                                    type="button"
                                    onClick={addComponent}
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
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => handlePickCandidate(c.id)}
                                            className="w-full text-left rounded-xl bg-surface-100/50 border border-surface-300/20 hover:border-emerald-500/50 transition-colors px-4 py-3"
                                            aria-label={`Use reference ${c.nameEn ?? c.nameTh ?? c.id}`}
                                        >
                                            <div className="text-sm text-white font-medium">
                                                {c.nameEn ?? c.nameTh ?? `Reference #${c.id}`}
                                            </div>
                                            <div className="text-xs text-surface-400 mt-0.5">
                                                {c.provider} v{c.version} · code {c.providerFoodCode} ·{" "}
                                                {r1(c.per100.calories)} kcal / 100 g
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {(outcome.match.tier !== "gap" || resolved) && calculation && explanation && (
                                <EstimateRangePanel calculation={calculation} explanation={explanation} reference={reference} />
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
                            <button
                                type="button"
                                onClick={handleFormContinue}
                                disabled={busy || (mode === "estimated" && !beforeImage)}
                                className="btn-primary text-sm flex items-center gap-2"
                            >
                                {isInterpreting || isCreating ? (
                                    <>
                                        <span
                                            className="inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full"
                                            style={{ animation: "spin 0.6s linear infinite" }}
                                            aria-hidden="true"
                                        />
                                        {isInterpreting ? "Analyzing…" : "Saving…"}
                                    </>
                                    ) : mode === "estimated" ? (
                                        "Analyze photo"
                                    ) : (
                                        "Save estimate"
                                    )}
                            </button>
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
                            <button
                                type="button"
                                onClick={handleReviewSubmit}
                                disabled={busy}
                                className="btn-primary text-sm flex items-center gap-2"
                            >
                                {isCreating ? (
                                    <>
                                        <span
                                            className="inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full"
                                            style={{ animation: "spin 0.6s linear infinite" }}
                                            aria-hidden="true"
                                        />
                                        Saving…
                                    </>
                                ) : (
                                    "Save estimate"
                                )}
                            </button>
                        </>
                    )}

                    {step === "result" && outcome && (
                        <>
                            {outcome.match.tier === "gap" ? (
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
                                    <button
                                        type="button"
                                        onClick={handleConfirm}
                                        disabled={busy || !calculation}
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
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </DialogBase>
    );
}
