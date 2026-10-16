import { useState, useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import DialogBase from "./DialogBase";
import DropToast from "./DropToast";
import BusyButton from "@/features/nutrition-estimation/components/BusyButton";
import CameraCapture from "@/features/nutrition-estimation/components/CameraCapture";
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

type Step = "photo" | "details" | "result";

/** Drawer gesture state: following the finger, springing back, or sliding out. */
type SheetDrag = { kind: "idle" } | { kind: "drag"; y: number } | { kind: "settle" } | { kind: "dismiss" };

// ——— Helpers ———

/** Per-component provenance (ADR 0026) as collapsed ingredient cards: each
 *  card shows the name over "kcal • grams"; tapping the pencil expands the
 *  card in place to reveal the nutrition detail and the reference search
 *  (the "change" affordance) inside the card. */
function ProvenanceList({
    perComponent,
    onPick,
}: {
    perComponent: MealComponentBreakdown[];
    onPick: (position: number, referenceId: number) => Promise<void>;
}) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [searchPosition, setSearchPosition] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const searchResults = useQuery({
        queryKey: ["mealObservationReferenceSearch", searchTerm],
        queryFn: async () => {
            const res = await mealObservationApi.searchReferenceCandidates(searchTerm, 8);
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Reference search failed");
        },
        enabled: searchPosition !== null && searchTerm.trim().length > 0,
    });

    const pick = useCallback(
        async (position: number, referenceId: number) => {
            await onPick(position, referenceId);
            setSearchPosition(null);
            setSearchTerm("");
        },
        [onPick],
    );

    if (perComponent.length === 0) return null;
    return (
        <div className="space-y-3">
            <span className="text-xs text-surface-400">Ingredients</span>
            <div className="space-y-2.5">
                {perComponent.map((c, i) => {
                    const open = openIndex === i;
                    return (
                        <div
                            key={`${c.name}-${i}`}
                            className="rounded-2xl border border-surface-300/20 bg-white/[0.02] overflow-hidden"
                        >
                            {/* Collapsed summary — mockup: name over kcal • grams. */}
                            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                                <button
                                    type="button"
                                    onClick={() => setOpenIndex(open ? null : i)}
                                    aria-expanded={open}
                                    className="flex-1 min-w-0 text-left"
                                >
                                    <span className="block text-sm font-medium text-white truncate">{c.name}</span>
                                    <span className="block text-xs text-surface-400 mt-0.5 tabular-nums">
                                        {roundToWhole(c.contribution.calories.central)} kcal •{" "}
                                        {roundToWhole(c.consumed_weight_g.central)} g
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOpenIndex(open ? null : i)}
                                    aria-expanded={open}
                                    aria-label={`Edit ${c.name}`}
                                    className={`shrink-0 rounded-full p-2 transition active:scale-90 ${
                                        open ? "text-emerald-300 bg-emerald-500/10" : "text-surface-300 hover:bg-white/5"
                                    }`}
                                >
                                    <Pencil size={16} aria-hidden />
                                </button>
                            </div>

                            {/* Expanded — nutrition detail + reference search live inside the card. */}
                            {open && (
                                <div className="px-4 pb-3.5 space-y-2.5 border-t border-surface-300/10 animate-fade-in">
                                    <div className="flex items-center justify-between gap-2 pt-3">
                                        {c.estimated ? (
                                            <span className="tag-pill text-xs text-amber-300">estimated · kind prior</span>
                                        ) : (
                                            <span className="tag-pill text-xs text-emerald-300">
                                                reference ·{" "}
                                                {c.reference?.name_th ?? c.reference?.name_en ?? `#${c.reference?.id ?? "?"}`}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setSearchPosition(searchPosition === i ? null : i)}
                                            className="text-xs text-surface-400 hover:text-[var(--foreground)] px-1"
                                            aria-label={`Change reference for ${c.name}`}
                                        >
                                            {searchPosition === i ? "cancel" : "change"}
                                        </button>
                                    </div>
                                    {/* Central contribution per component (ADR 0030 — single numbers). */}
                                    <div className="text-xs text-surface-400 tabular-nums">
                                        {roundToWhole(c.consumed_weight_g.central)} g ·{" "}
                                        {roundToWhole(c.contribution.calories.central)} kcal · P{" "}
                                        {roundToOneDecimal(c.contribution.protein.central)} / C{" "}
                                        {roundToOneDecimal(c.contribution.carbs.central)} / F{" "}
                                        {roundToOneDecimal(c.contribution.fat.central)}
                                    </div>

                                    {searchPosition === i && (
                                        <div className="space-y-2">
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
                                                                onClick={() => void pick(i, r.id)}
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
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ——— Component ———

/** Compact per-slot status on the photo step: preview (with remove) or an
 *  empty dashed placeholder — mirrors the design's รูปก่อนกิน/รูปหลังกิน row. */
function SlotThumb({
    label,
    required = false,
    image,
    onRemove,
}: {
    label: string;
    required?: boolean;
    image: AttachedImage | null;
    onRemove: () => void;
}) {
    return (
        <div className="rounded-xl border border-surface-300/20 p-2">
            <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[11px] text-surface-400 truncate">
                    {label} <span className="text-surface-300/50">· {required ? "จำเป็น" : "ไม่บังคับ"}</span>
                </span>
                {image && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="text-red-400/70 hover:text-red-400 text-[11px] px-1 shrink-0 transition active:scale-90"
                        aria-label={`Remove ${label}`}
                    >
                        ✕
                    </button>
                )}
            </div>
            {image ? (
                <img
                    key={image.dataUrl}
                    src={image.dataUrl}
                    alt={`${label} preview`}
                    className="animate-pop-in h-20 w-full rounded-lg object-cover border border-surface-300/30"
                />
            ) : (
                <div className="h-20 rounded-lg border border-dashed border-surface-300/30 flex items-center justify-center text-[11px] text-surface-400/60">
                    {required ? "ถ่ายหรือเลือกรูป" : "รอรูป"}
                </div>
            )}
        </div>
    );
}

interface LogMealModalProps {
    open: boolean;
    onClose: () => void;
    /** Selected date on the Nutrition page (YYYY-MM-DD) — the default log date. */
    defaultDate: string;
    /** Flash a message on the page (success confirmations, reference-pending notice). */
    onLogged: (message: string) => void;
}

/**
 * Two-step meal logging (ADR 0030 + mobile redesign): step 1 is photo capture
 * only — live camera (auto-prompts permission) or gallery; step 2 collects the
 * details; then the VLM estimates → auto create + confirm → result shows the
 * photo and central nutrition numbers. Steps push/pop with iOS-style spring
 * motion. No portion modes, no range editing, no review step — correction is
 * post-hoc via the provenance list. Never-block: a failed analysis stays on
 * the details step for retry; a failed confirm keeps a manual fallback button.
 * All state lives here; the parent only opens/closes (remount via key to reset).
 */
export default function LogMealModal({ open, onClose, defaultDate, onLogged }: LogMealModalProps) {
    const { interpret, create, confirm, resolveComponent, isInterpreting, isCreating, isConfirming, isResolvingComponent } =
        useMealObservations();

    const [step, setStep] = useState<Step>("photo");
    /** Push (forward) vs pop (back) — picks the step transition direction. */
    const [direction, setDirection] = useState<"forward" | "back">("forward");
    /** Top toast (drops in, auto-dismisses) — analysis failures, save failures. */
    const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
    const [imageError, setImageError] = useState<string | null>(null);
    /** False until the auto (or manual) confirm dual-writes into nutrition_logs. */
    const [confirmed, setConfirmed] = useState(false);

    const showToast = useCallback((message: string) => {
        setToast({ id: Date.now(), message });
    }, []);

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

    /** Camera/gallery captures land in the first empty slot: before photo,
     * then after photo. Both full → the after slot is replaced. */
    const handleCaptured = useCallback(
        (image: AttachedImage) => {
            if (!beforeImage) setBeforeImage(image);
            else setAfterImage(image);
        },
        [beforeImage],
    );

    // ——— Step navigation (drives the push/pop transition) ———

    const goDetails = useCallback(() => {
        setDirection("forward");
        setStep("details");
    }, []);

    const goBackToPhoto = useCallback(() => {
        setDirection("back");
        setStep("photo");
    }, []);

    // ——— Drawer drag-to-dismiss (iOS sheet): pull the grabber/header down ———

    const handleClose = useCallback(() => {
        // The toast lands as the modal clears — the page behind shows fresh totals.
        if (confirmed) onLogged("Logged — daily totals updated");
        onClose();
    }, [confirmed, onLogged, onClose]);

    const [sheetDrag, setSheetDrag] = useState<SheetDrag>({ kind: "idle" });
    const dragInfoRef = useRef({ startY: 0, lastY: 0, lastT: 0, velocity: 0 });
    const sheetTimerRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (sheetTimerRef.current !== null) window.clearTimeout(sheetTimerRef.current);
    }, []);

    /** Slide the sheet out (gravity ease-in), then run the real close — the
     *  single exit path for backdrop taps, ✕/Cancel, and the drag gesture. */
    const dismissSheet = useCallback(() => {
        if (sheetDrag.kind === "dismiss" || sheetDrag.kind === "settle") return;
        setSheetDrag({ kind: "dismiss" });
        sheetTimerRef.current = window.setTimeout(handleClose, 300);
    }, [handleClose, sheetDrag.kind]);

    const beginSheetDrag = useCallback(
        (e: ReactPointerEvent) => {
            if (sheetDrag.kind !== "idle") return;
            if (e.pointerType === "mouse" && e.button !== 0) return;
            dragInfoRef.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
            setSheetDrag({ kind: "drag", y: 0 });
        },
        [sheetDrag.kind],
    );

    useEffect(() => {
        if (sheetDrag.kind !== "drag") return;
        const move = (e: PointerEvent) => {
            const d = dragInfoRef.current;
            d.velocity = (e.clientY - d.lastY) / Math.max(1, e.timeStamp - d.lastT);
            d.lastY = e.clientY;
            d.lastT = e.timeStamp;
            // Rubber-band the top: the sheet only follows downward.
            setSheetDrag({ kind: "drag", y: Math.max(0, e.clientY - d.startY) });
        };
        const end = () => {
            const d = dragInfoRef.current;
            const y = Math.max(0, d.lastY - d.startY);
            const flung = d.velocity > 0.6;
            if (y > 120 || (flung && y > 24)) {
                dismissSheet();
            } else {
                setSheetDrag({ kind: "settle" });
                sheetTimerRef.current = window.setTimeout(() => setSheetDrag({ kind: "idle" }), 320);
            }
        };
        window.addEventListener("pointermove", move, { passive: true });
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", end);
        };
    }, [sheetDrag.kind, dismissSheet]);

    const sheetStyle =
        sheetDrag.kind === "drag"
            ? { transform: `translateY(${sheetDrag.y}px)`, transition: "none", willChange: "transform" }
            : sheetDrag.kind === "settle"
                ? { transform: "translateY(0px)", transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)" }
                : sheetDrag.kind === "dismiss"
                    ? { transform: "translateY(100%)", transition: "transform 0.3s cubic-bezier(0.55, 0, 1, 0.45)" }
                    : undefined;

    // Result state
    const [outcome, setOutcome] = useState<CreateOutcome | null>(null);
    /** Recalculated detail after a per-component resolve (ADR 0026) — wins
     * over the create outcome's estimate. */
    const [updated, setUpdated] = useState<CalculateObservationOutcome | null>(null);

    // ——— Analyze → create → confirm (the whole flow, ADR 0030) ———

    const handleAnalyze = useCallback(async () => {
        if (!beforeImage) {
            showToast("Attach a photo of the meal before eating.");
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
                showToast(
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
            showToast("Couldn't analyze the photo — check your connection and try again.");
            return;
        }
        setOutcome(res);
        setDirection("forward");
        setStep("result");
        // Auto-confirm dual-writes the central values into nutrition_logs (ADR 0022).
        // On failure the result stays open with a manual fallback (never-block).
        try {
            await confirm(res.observation.id);
            setConfirmed(true);
        } catch (err) {
            showToast(
                err instanceof Error
                    ? `Saved as a draft, but logging failed: ${err.message} — press Confirm & log to retry.`
                    : "Saved as a draft, but logging failed — press Confirm & log to retry.",
            );
        }
    }, [menuName, beforeImage, afterImage, userNote, date, meal, mealSource, interpret, create, confirm, showToast]);
    // ——— Result rendering ———

    const estimate = updated
        ? estimateFromRecalculation(updated)
        : outcome
            ? estimateFromCreateOutcome(outcome)
            : null;

    const handlePickRef = useCallback(
        async (position: number, referenceId: number) => {
            if (!outcome) return;
            try {
                const res = await resolveComponent(outcome.observation.id, position, referenceId);
                setUpdated(res);
            } catch (err) {
                showToast(err instanceof Error ? err.message : "Failed to resolve the reference.");
            }
        },
        [outcome, resolveComponent, showToast],
    );

    /** Manual fallback when the auto-confirm failed (never-block, ADR 0030). */
    const handleConfirmRetry = useCallback(async () => {
        if (!outcome) return;
        try {
            await confirm(outcome.observation.id);
            setConfirmed(true);
        } catch (err) {
            showToast(err instanceof Error ? err.message : "Failed to confirm the meal.");
        }
    }, [outcome, confirm, showToast]);

    if (!open) return null;

    const stepLabels: Record<Step, string> = {
        photo: "Step 1 of 3 — Photo",
        details: "Step 2 of 3 — Details",
        result: "Step 3 of 3 — Result",
    };

    const busy = isInterpreting || isCreating || isConfirming || isResolvingComponent;

    return (
        <DialogBase open={open} onClose={dismissSheet} ariaLabel="Log a meal" drawer>
            <div
                className="glass-card w-full flex flex-col animate-sheet-up max-h-[92dvh] overflow-hidden rounded-t-3xl sm:rounded-2xl"
                style={sheetStyle}
            >
                {/* Drag surface: grabber + header. Pull down to dismiss — past
                    the threshold (or with a fling) the sheet slides out, else it
                    springs back. touch-action:none keeps the gesture ours. */}
                <div
                    onPointerDown={beginSheetDrag}
                    style={{ touchAction: "none" }}
                    className="cursor-grab active:cursor-grabbing"
                >
                    {/* iOS sheet grabber */}
                    <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-white/15" />

                    {/* Header */}
                    <div className="px-5 pt-3 pb-4 sm:px-6 border-b border-surface-300/30">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">Log a meal</h2>
                                <p className="text-sm text-surface-400 mt-1">{stepLabels[step]}</p>
                            </div>
                            {/* Mobile closes via swipe or backdrop tap — the ✕ is desktop-only. */}
                            <button
                                type="button"
                                onClick={dismissSheet}
                                className="hidden sm:block text-surface-400 hover:text-white transition text-xl px-2 py-1 rounded-lg hover:bg-surface-200/50 active:scale-90"
                                aria-label="Close log meal modal"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                </div>

                {/* Body — keyed remount per step drives the push/pop transition. */}
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
                    <div key={step} className={direction === "forward" ? "step-in-right" : "step-in-left"}>
                        {/* ——— Step 1: photo ——— */}
                        {step === "photo" && (
                            <div className="space-y-4">
                                {/* Camera-first capture (design: แนบรูป AI) — live viewfinder
                                    + gallery fallback, feeding the slot row below. */}
                                <CameraCapture onAttach={handleCaptured} onError={setImageError} />

                                {imageError && (
                                    <p role="alert" className="text-xs text-amber-400">
                                        {imageError}
                                    </p>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <SlotThumb label="รูปก่อนกิน" required image={beforeImage} onRemove={() => setBeforeImage(null)} />
                                    <SlotThumb label="รูปหลังกิน" image={afterImage} onRemove={() => setAfterImage(null)} />
                                </div>
                            </div>
                        )}

                        {/* ——— Step 2: details ——— */}
                        {step === "details" && (
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

                            <p className="text-[11px] text-surface-400">
                                Analyzing saves and logs the meal automatically with the AI's estimate —
                                adjust any component afterwards from its provenance row below.
                            </p>
                            </>
                        )}

                        {/* ——— Step 3: result ——— */}
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
                                        onPick={handlePickRef}
                                    />
                                </div>
                            )}
                        </>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 pt-4 sm:p-6 sm:pt-4 border-t border-surface-300/30">
                    {step === "photo" && (
                        <>
                            <button
                                type="button"
                                onClick={dismissSheet}
                                className="px-5 py-3 rounded-xl text-sm font-medium text-surface-400 hover:text-white hover:bg-surface-200/50 transition active:scale-[0.97]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={goDetails}
                                disabled={!beforeImage}
                                className="btn-primary text-sm transition active:scale-[0.97]"
                            >
                                Next
                            </button>
                        </>
                    )}

                    {step === "details" && (
                        <>
                            <button
                                type="button"
                                onClick={goBackToPhoto}
                                disabled={busy}
                                className="px-5 py-3 rounded-xl text-sm font-medium text-surface-400 hover:text-white hover:bg-surface-200/50 transition active:scale-[0.97] disabled:opacity-50"
                            >
                                Back
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
                                onClick={dismissSheet}
                                className="px-5 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:text-white hover:bg-surface-200/50 transition-colors"
                            >
                                Done
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={dismissSheet}
                                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:text-white hover:bg-surface-200/50 transition active:scale-[0.97]"
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

            {/* Top toast — drops from the screen edge, auto-lifts after 4s. */}
            {toast && <DropToast key={toast.id} message={toast.message} onDone={() => setToast(null)} />}
        </DialogBase>
    );
}
