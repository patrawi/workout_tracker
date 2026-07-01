import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNutrition } from "@/features/nutrition/hooks/useNutrition";
import { useWater } from "@/features/nutrition/hooks/useWater";
import NutritionReviewModal from "@/components/NutritionReviewModal";
import { queryKeys } from "@/lib/query-keys";
import { nutritionApi, foodCatalogApi } from "@/lib/api";
import type { NutritionRow, NutritionItem, MealType } from "@/types";

// ——— Local aliases mapped to the app's global theme tokens (keeps this page
// consistent with the rest of the app; only macro colors stay custom). ———
const PAGE_VARS = {
    "--accent": "var(--color-accent-400)",
    "--accent-soft": "oklch(0.72 0.19 160 / 0.12)",
    "--accent-line": "oklch(0.72 0.19 160 / 0.35)",
    "--accent-glow": "oklch(0.72 0.19 160 / 0.18)",
    "--carb": "var(--chart-4)",
    "--fat": "var(--chart-5)",
    "--alcohol": "oklch(0.74 0.13 225)",
    "--teal": "var(--color-glow-cyan)",
    "--card-2": "var(--color-surface-200)",
    "--text": "var(--foreground)",
    "--dim": "var(--muted-foreground)",
    "--faint": "oklch(0.45 0.01 260)",
    "--bg-2": "var(--background)",
} as React.CSSProperties;

const MEALS: { id: MealType; emoji: string }[] = [
    { id: "Breakfast", emoji: "🍳" },
    { id: "Lunch", emoji: "🥗" },
    { id: "Dinner", emoji: "🍽️" },
    { id: "Snack", emoji: "🥨" },
];

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const calcKcal = (p: number, c: number, f: number, a: number) => Math.round((p * 4 + c * 4 + f * 9 + a * 7) * 10) / 10;

// ——— Date helpers (YYYY-MM-DD strings) ———
const fromYMD = (s: string) => new Date(s + "T00:00:00");
const toYMD = (d: Date) => {
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};
const shiftYMD = (s: string, days: number) => {
    const d = fromYMD(s);
    d.setDate(d.getDate() + days);
    return toYMD(d);
};

// ——— Inline icons (subset of design's StrokeIcon) ———
function Icon({ name, size = 18, style }: { name: string; size?: number; style?: React.CSSProperties }) {
    const paths: Record<string, React.ReactNode> = {
        close: <path d="M6 6l12 12M18 6L6 18" />,
        check: <path d="M5 12l5 5 9-11" />,
        send: <path d="M5 12h13M12 6l6 6-6 6" />,
        arrowL: <path d="M15 6l-6 6 6 6" />,
        arrowR: <path d="M9 6l6 6-6 6" />,
        sync: <><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4" /><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16M4 20v-4h4" /></>,
        calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" /></>,
        edit: <><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M13.5 6.5l3 3" /></>,
    };
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={style}>
            {paths[name]}
        </svg>
    );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div className="glass-card" style={style}>
            {children}
        </div>
    );
}

// ——— Horizontal date strip + calendar popover ———
function DateStrip({ selected, onSelect, loggedDates }: { selected: string; onSelect: (s: string) => void; loggedDates: string[] }) {
    const [anchor, setAnchor] = useState(selected);
    const [pickerOpen, setPickerOpen] = useState(false);
    useEffect(() => { setAnchor(selected); }, [selected]);

    const today = toYMD(new Date());
    const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const week: string[] = [];
    for (let i = -3; i <= 3; i++) week.push(shiftYMD(anchor, i));
    const monthLbl = fromYMD(anchor).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const navBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", border: "1px solid var(--border)", background: "oklch(1 0 0 / .03)", color: "var(--dim)", cursor: "pointer" };

    // Close the calendar popover on outside click / Escape.
    const popRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!pickerOpen) return;
        const onDoc = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setPickerOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPickerOpen(false); };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
    }, [pickerOpen]);

    const logged = useMemo(() => loggedDates.map(fromYMD), [loggedDates]);
    const calVars = {
        "--rdp-accent-color": "var(--accent)",
        "--rdp-accent-background-color": "var(--accent-soft)",
        "--rdp-today-color": "var(--teal)",
        "--rdp-day-width": "38px",
        "--rdp-day-height": "38px",
    } as React.CSSProperties;

    return (
        // Lift this card's stacking context above sibling glass-cards (each makes
        // its own context via backdrop-filter) so the date popover isn't painted over.
        <Card style={{ padding: "16px 18px", position: "relative", zIndex: pickerOpen ? 40 : undefined }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{monthLbl}</span>
                    {selected !== today && (
                        <button onClick={() => { onSelect(today); setAnchor(today); }}
                            style={{ padding: "5px 11px", borderRadius: 999, border: "1px solid var(--accent-line)", background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                            Jump to today
                        </button>
                    )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button className="nut-tap" onClick={() => setAnchor((a) => shiftYMD(a, -7))} title="Previous week" aria-label="Previous week" style={navBtn}><Icon name="arrowL" size={16} /></button>
                    <div ref={popRef} style={{ position: "relative" }}>
                        <button className="nut-tap" onClick={() => setPickerOpen((o) => !o)} title="Pick a date" aria-label="Pick a date" aria-expanded={pickerOpen}
                            style={{ ...navBtn, color: pickerOpen ? "var(--accent)" : "var(--dim)", borderColor: pickerOpen ? "var(--accent-line)" : "var(--border)" }}>
                            <Icon name="calendar" size={16} />
                        </button>
                        {pickerOpen && (
                            <div style={{
                                ...calVars, position: "absolute", top: 42, right: 0, zIndex: 60,
                                background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16,
                                padding: 10, boxShadow: "0 20px 50px oklch(0 0 0 / .5)", color: "var(--text)",
                            }}>
                                <DayPicker
                                    mode="single"
                                    selected={fromYMD(selected)}
                                    defaultMonth={fromYMD(selected)}
                                    onSelect={(d) => { if (d) { const s = toYMD(d); onSelect(s); setAnchor(s); setPickerOpen(false); } }}
                                    modifiers={{ logged }}
                                    modifiersClassNames={{ logged: "rdp-logged" }}
                                />
                            </div>
                        )}
                    </div>
                    <button className="nut-tap" onClick={() => setAnchor((a) => shiftYMD(a, 7))} title="Next week" aria-label="Next week" style={navBtn}><Icon name="arrowR" size={16} /></button>
                </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 8 }}>
                {week.map((d) => {
                    const on = d === selected;
                    const isToday = d === today;
                    const future = d > today;
                    return (
                        <button key={d} onClick={() => onSelect(d)} style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 0 9px",
                            borderRadius: 14, cursor: "pointer", transition: "all .15s ease",
                            border: "1px solid " + (on ? "var(--accent-line)" : "transparent"),
                            background: on ? "var(--accent-soft)" : "transparent", opacity: future ? 0.45 : 1,
                        }}>
                            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: on ? "var(--accent)" : "var(--faint)" }}>{WD[fromYMD(d).getDay()]}</span>
                            <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, color: on ? "var(--accent)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>{fromYMD(d).getDate()}</span>
                            <span style={{ width: 5, height: 5, borderRadius: 99, background: isToday ? (on ? "var(--accent)" : "var(--teal)") : "transparent" }} />
                        </button>
                    );
                })}
            </div>
        </Card>
    );
}

// ——— Calorie ring gauge (tick style) ———
function CalorieRing({ consumed, goal, size = 210 }: { consumed: number; goal: number; size?: number }) {
    const pct = goal > 0 ? Math.min(consumed / goal, 1) : 0;
    const over = goal > 0 && consumed > goal;
    const remaining = goal - consumed;
    const cx = 100, cy = 100;
    const NT = 64;
    const ticks = [];
    for (let i = 0; i < NT; i++) {
        const ang = (i / NT) * 2 * Math.PI - Math.PI / 2;
        const active = goal > 0 && i / NT <= pct;
        const ro = 92, ri = 80;
        ticks.push(
            <line key={i}
                x1={cx + ro * Math.cos(ang)} y1={cy + ro * Math.sin(ang)}
                x2={cx + ri * Math.cos(ang)} y2={cy + ri * Math.sin(ang)}
                stroke={active ? (over ? "var(--fat)" : "var(--accent)") : "oklch(1 0 0 / .10)"}
                strokeWidth="3.2" strokeLinecap="round" />,
        );
    }
    return (
        <div style={{ position: "relative", width: size, height: size }}>
            <svg viewBox="0 0 200 200" width={size} height={size} style={{ filter: "drop-shadow(0 0 14px var(--accent-glow))" }}>{ticks}</svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-.02em", color: "var(--text)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                    {goal > 0 ? r0(Math.abs(remaining)) : r0(consumed)}
                </div>
                <div style={{ fontSize: 12, color: over ? "var(--fat)" : "var(--dim)", fontWeight: 600 }}>
                    {goal > 0 ? (over ? "kcal over" : "kcal left") : "kcal eaten"}
                </div>
            </div>
        </div>
    );
}

// ——— Delta vs previous day (kept from original) ———
function DeltaBadge({ current, previous }: { current: number; previous: number }) {
    if (previous === 0) return null;
    const delta = current - previous;
    if (Math.abs(delta) < 0.5) return null;
    const pct = ((delta / previous) * 100).toFixed(0);
    const up = delta > 0;
    return (
        <span style={{ fontSize: 10, fontVariantNumeric: "tabular-nums", color: up ? "var(--accent)" : "var(--fat)", marginLeft: 6 }}>
            {up ? "▲" : "▼"} {Math.abs(delta).toFixed(0)} ({pct}%)
        </span>
    );
}

// ——— Macro bars ———
function MacroBars({ totals, goals, prev }: {
    totals: { p: number; c: number; f: number; a: number };
    goals: { protein: number; carbs: number; fat: number };
    prev: { p: number; c: number; f: number; a: number };
}) {
    const goalRows = [
        { k: "Protein", v: totals.p, g: goals.protein, color: "var(--accent)", pv: prev.p },
        { k: "Carbs", v: totals.c, g: goals.carbs, color: "var(--carb)", pv: prev.c },
        { k: "Fat", v: totals.f, g: goals.fat, color: "var(--fat)", pv: prev.f },
    ];
    return (
        <div style={{ display: "grid", gap: 15 }}>
            {goalRows.map((row) => {
                const pct = row.g > 0 ? Math.min(row.v / row.g, 1) : 0;
                const remain = row.g - row.v;
                return (
                    <div key={row.k}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>{row.k}</span>
                            <span style={{ fontSize: 13, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                                <b style={{ color: row.color }}>{r1(row.v)}</b>
                                {row.g > 0 && <span style={{ color: "var(--faint)" }}> / {row.g}g</span>}
                                <DeltaBadge current={row.v} previous={row.pv} />
                            </span>
                        </div>
                        <div style={{ height: 7, borderRadius: 99, background: "oklch(1 0 0 / .06)", overflow: "hidden" }}>
                            <div style={{ width: pct * 100 + "%", height: "100%", borderRadius: 99, background: row.color, transition: "width .6s cubic-bezier(.4,0,.2,1)" }} />
                        </div>
                        {row.g > 0 && (
                            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 4, textAlign: "right" }}>
                                {remain >= 0 ? r1(remain) + "g left" : r1(-remain) + "g over"}
                            </div>
                        )}
                    </div>
                );
            })}
            <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>Alcohol</span>
                    <span style={{ fontSize: 13, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                        <b style={{ color: "var(--alcohol)" }}>{r1(totals.a)}</b>
                        <span style={{ color: "var(--faint)" }}> g consumed</span>
                        <DeltaBadge current={totals.a} previous={prev.a} />
                    </span>
                </div>
            </div>
        </div>
    );
}

// ——— Water tracker ———
function Glass({ filled }: { filled: boolean }) {
    return (
        <svg viewBox="0 0 40 48" width="40" height="48" style={{ display: "block" }}>
            <defs>
                <clipPath id="cup"><path d="M9 6 h22 l-2.5 36 a3 3 0 0 1 -3 2.6 h-11 a3 3 0 0 1 -3 -2.6 z" /></clipPath>
            </defs>
            <g clipPath="url(#cup)">
                <rect x="0" y="0" width="40" height="48" fill="oklch(1 0 0 / .04)" />
                {filled && <rect x="0" y="16" width="40" height="48" fill="var(--teal)" opacity="0.85" />}
                {filled && <rect x="0" y="16" width="40" height="4" fill="oklch(1 0 0)" opacity="0.25" />}
            </g>
            <path d="M9 6 h22 l-2.5 36 a3 3 0 0 1 -3 2.6 h-11 a3 3 0 0 1 -3 -2.6 z" fill="none"
                stroke={filled ? "var(--teal)" : "oklch(1 0 0 / .18)"} strokeWidth="1.6" />
        </svg>
    );
}

function WaterCard({ glasses, goal, onSave, isSaving }: { glasses: number; goal: number; onSave: (n: number) => void; isSaving: boolean }) {
    const [draft, setDraft] = useState(glasses);
    useEffect(() => { setDraft(glasses); }, [glasses]);
    const dirty = draft !== glasses;
    const ml = draft * 250;
    const stepBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 10, border: "1px solid var(--border)", background: "oklch(1 0 0 / .03)", color: "var(--text)", fontSize: 18, fontWeight: 700, cursor: "pointer", display: "grid", placeItems: "center", lineHeight: 1 };
    return (
        <Card style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Water intake</div>
                    <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 2 }}>Goal {goal} glasses · {(goal * 250 / 1000).toFixed(1)} L</div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--teal)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{(ml / 1000).toFixed(2)}L</div>
                    <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{draft} of {goal}</div>
                </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Array.from({ length: goal }).map((_, i) => (
                    <button key={i} onClick={() => setDraft(i + 1 === draft ? i : i + 1)} title={`${i + 1} glasses`}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", opacity: i < draft ? 1 : 0.55 }}>
                        <Glass filled={i < draft} />
                    </button>
                ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button className="nut-tap" aria-label="Remove a glass" onClick={() => setDraft(Math.max(0, draft - 1))} style={stepBtn}>–</button>
                <input type="range" min="0" max={goal} value={draft} onChange={(e) => setDraft(+e.target.value)}
                    style={{ flex: 1, accentColor: "var(--teal)" }} />
                <button className="nut-tap" aria-label="Add a glass" onClick={() => setDraft(Math.min(goal, draft + 1))} style={stepBtn}>+</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 36 }}>
                <span style={{ fontSize: 12, color: dirty ? "var(--dim)" : "var(--faint)" }}>
                    {dirty ? (draft > glasses ? `+${draft - glasses}` : draft - glasses) + " unsaved" : "All changes saved"}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                    {dirty && (
                        <button onClick={() => setDraft(glasses)} style={{ padding: "8px 13px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Reset</button>
                    )}
                    <button onClick={() => dirty && onSave(draft)} disabled={!dirty || isSaving} style={{
                        display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10, border: "none",
                        background: dirty ? "var(--teal)" : "oklch(1 0 0 / .05)", color: dirty ? "var(--primary-foreground)" : "var(--faint)",
                        fontWeight: 700, fontSize: 13, cursor: dirty && !isSaving ? "pointer" : "default", transition: "all .15s ease",
                    }}>
                        <Icon name="check" size={15} /> {isSaving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </Card>
    );
}

// ——— AI paste input ———
function AIInput({ dateLabel, value, setValue, onParse, onManual, isParsing }: {
    dateLabel: string; value: string; setValue: (s: string) => void; onParse: () => void; onManual: () => void; isParsing: boolean;
}) {
    const taRef = useRef<HTMLTextAreaElement>(null);
    const [focused, setFocused] = useState(false);
    const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onParse(); } };

    // Auto-grow with content (matches the home WorkoutInput), so the box is
    // never a tall empty void at rest and never clips long pastes.
    useEffect(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
    }, [value]);

    return (
        <div style={{ display: "grid", gap: 12 }}>
            <div style={{
                position: "relative", borderRadius: 18, background: "var(--card)",
                border: `1px solid ${focused ? "var(--accent)" : "var(--accent-line)"}`,
                boxShadow: focused ? "0 0 0 3px var(--accent-glow), 0 0 26px var(--accent-glow)" : "0 0 20px var(--accent-glow)",
                transition: "border-color .18s ease, box-shadow .18s ease",
            }}>
                <textarea ref={taRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey}
                    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                    placeholder="Paste your food log… e.g. 'Breakfast: 2 eggs, 50g cereal for 40g serving…'"
                    rows={1} disabled={isParsing}
                    style={{ width: "100%", resize: "none", minHeight: 52, maxHeight: 240, overflowY: "auto", padding: "16px 70px 6px 20px", border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 16, lineHeight: 1.5, fontFamily: "inherit" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 14px 20px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--faint)" }}>
                        <Icon name="calendar" size={14} /> {dateLabel}
                    </span>
                    <button onClick={onParse} disabled={!value.trim() || isParsing} title="Parse with AI" style={{
                        position: "absolute", right: 16, bottom: 14, width: 44, height: 44, borderRadius: 13, border: "none",
                        background: "var(--accent)", color: "var(--primary-foreground)", display: "grid", placeItems: "center",
                        cursor: !value.trim() || isParsing ? "default" : "pointer", opacity: !value.trim() || isParsing ? 0.5 : 1, boxShadow: "0 6px 18px var(--accent-glow)",
                    }}>
                        {isParsing
                            ? <span style={{ width: 16, height: 16, border: "2px solid oklch(0 0 0 / .3)", borderTopColor: "var(--primary-foreground)", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                            : <Icon name="send" size={20} />}
                    </button>
                </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--faint)" }}>Paste in Thai or English · <span style={{ color: "var(--dim)" }}>Enter</span> to parse, <span style={{ color: "var(--dim)" }}>Shift+Enter</span> for newline.</span>
                <button className="nut-tap" onClick={onManual} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999, border: "1px dashed var(--border)", background: "transparent", color: "var(--dim)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add a food manually
                </button>
            </div>
        </div>
    );
}

// ——— Add / edit food modal ———
function AddFoodModal({ open, meal, initial, onClose, onSave, isSaving }: {
    open: boolean; meal: MealType; initial?: NutritionRow | null;
    onClose: () => void; onSave: (meal: MealType, f: { name: string; p: number; c: number; f: number; a: number; kcal: number }) => void; isSaving: boolean;
}) {
    // Fresh state each open — parent remounts via `key`, so init lazily from props.
    const [f, setF] = useState(() => initial
        ? { name: initial.food_name, meal: initial.meal, p: String(initial.protein), c: String(initial.carbs), f: String(initial.fat), a: String(initial.alcohol), kcal: String(initial.calories) }
        : { name: "", meal, p: "", c: "", f: "", a: "", kcal: "" });
    if (!open) return null;
    const num = (x: string) => (x === "" ? 0 : +x || 0);
    const autoKcal = calcKcal(num(f.p), num(f.c), num(f.f), num(f.a));
    const save = () => {
        if (!f.name.trim()) return;
        onSave(f.meal, { name: f.name.trim(), p: num(f.p), c: num(f.c), f: num(f.f), a: num(f.a), kcal: f.kcal === "" ? autoKcal : num(f.kcal) });
    };
    const fld: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text)", fontSize: 16, fontFamily: "inherit" };
    const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 5, display: "block" };
    const navBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", cursor: "pointer" };
    return (
        <div onClick={onClose} style={{ ...PAGE_VARS, position: "fixed", inset: 0, background: "oklch(0 0 0 / .6)", display: "grid", placeItems: "center", zIndex: 200, padding: 20, overflowY: "auto" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "100%", maxHeight: "calc(100dvh - 40px)", overflowY: "auto", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: 24, boxShadow: "0 30px 70px oklch(0 0 0 / .5)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{initial ? "Edit food" : "Add food"}</div>
                    <button className="nut-tap" onClick={onClose} aria-label="Close" style={navBtn}><Icon name="close" size={15} /></button>
                </div>
                <div style={{ display: "grid", gap: 14 }}>
                    <div>
                        <label style={lbl}>Food</label>
                        <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Grilled chicken breast" style={fld} />
                    </div>
                    <div>
                        <label style={lbl}>Meal</label>
                        <select value={f.meal} onChange={(e) => setF({ ...f, meal: e.target.value as MealType })} style={fld}>
                            {MEALS.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                        </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                        <div><label style={lbl}>Protein</label><input inputMode="decimal" value={f.p} onChange={(e) => setF({ ...f, p: e.target.value })} placeholder="g" style={fld} /></div>
                        <div><label style={lbl}>Carbs</label><input inputMode="decimal" value={f.c} onChange={(e) => setF({ ...f, c: e.target.value })} placeholder="g" style={fld} /></div>
                        <div><label style={lbl}>Fat</label><input inputMode="decimal" value={f.f} onChange={(e) => setF({ ...f, f: e.target.value })} placeholder="g" style={fld} /></div>
                        <div><label style={lbl}>Alcohol</label><input inputMode="decimal" value={f.a} onChange={(e) => setF({ ...f, a: e.target.value })} placeholder="g" style={fld} /></div>
                    </div>
                    <div>
                        <label style={lbl}>Calories <span style={{ textTransform: "none", color: "var(--faint)" }}>(auto: {r0(autoKcal)} kcal)</span></label>
                        <input inputMode="decimal" value={f.kcal} onChange={(e) => setF({ ...f, kcal: e.target.value })} placeholder={String(r0(autoKcal))} style={fld} />
                    </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
                    <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Cancel</button>
                    <button onClick={save} disabled={!f.name.trim() || isSaving} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "var(--accent)", color: "var(--primary-foreground)", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: !f.name.trim() || isSaving ? 0.5 : 1 }}>
                        {isSaving ? "Saving…" : initial ? "Save" : "Add food"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ——— Toast ———
function Toast({ msg }: { msg: string }) {
    if (!msg) return null;
    return (
        <div style={{ ...PAGE_VARS, position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 250, background: "var(--card-2)", border: "1px solid var(--accent-line)", color: "var(--text)", padding: "11px 18px", borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: "0 12px 30px oklch(0 0 0 / .45)", display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name="check" size={16} style={{ color: "var(--accent)" }} /> {msg}
        </div>
    );
}

// ——— Meal section ———
function ColHead() {
    return (
        <div className="nut-row" style={{ padding: "0 4px 7px", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--faint)" }}>
            <span>Item</span>
            <span className="nut-pcf" style={{ textAlign: "right" }}>P</span>
            <span className="nut-pcf" style={{ textAlign: "right" }}>C</span>
            <span className="nut-pcf" style={{ textAlign: "right" }}>F</span>
            <span className="nut-pcf" style={{ textAlign: "right" }}>A</span>
            <span style={{ textAlign: "right" }}>kcal</span>
        </div>
    );
}

function FoodRow({ it, onRemove, onEdit }: { it: NutritionRow; onRemove: () => void; onEdit: () => void }) {
    const actBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 7, border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--dim)", cursor: "pointer", display: "grid", placeItems: "center" };
    return (
        <div className="nut-row" style={{ padding: "11px 4px", borderTop: "1px solid var(--border)" }}>
            <div style={{ minWidth: 0, fontSize: 14, color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.food_name}</div>
            <span className="nut-pcf" style={{ textAlign: "right", fontSize: 13, color: "var(--dim)", fontVariantNumeric: "tabular-nums" }}>{r1(it.protein)}</span>
            <span className="nut-pcf" style={{ textAlign: "right", fontSize: 13, color: "var(--dim)", fontVariantNumeric: "tabular-nums" }}>{r1(it.carbs)}</span>
            <span className="nut-pcf" style={{ textAlign: "right", fontSize: 13, color: "var(--dim)", fontVariantNumeric: "tabular-nums" }}>{r1(it.fat)}</span>
            <span className="nut-pcf" style={{ textAlign: "right", fontSize: 13, color: "var(--dim)", fontVariantNumeric: "tabular-nums" }}>{r1(it.alcohol)}</span>
            <span style={{ textAlign: "right", fontSize: 14, color: "var(--text)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r0(it.calories)}</span>
            <div className="nut-actions">
                <button className="nut-tap" onClick={onEdit} title="Edit" aria-label={`Edit ${it.food_name}`} style={actBtn}><Icon name="edit" size={13} /></button>
                <button className="nut-tap" onClick={onRemove} title="Remove" aria-label={`Remove ${it.food_name}`} style={actBtn}><Icon name="close" size={13} /></button>
            </div>
        </div>
    );
}

function MealSection({ meal, emoji, items, onAdd, onRemove, onEdit }: {
    meal: MealType; emoji: string; items: NutritionRow[];
    onAdd: (m: MealType) => void; onRemove: (id: number) => void; onEdit: (it: NutritionRow) => void;
}) {
    const s = useMemo(() => items.reduce((a, i) => ({ p: a.p + i.protein, c: a.c + i.carbs, f: a.f + i.fat, alc: a.alc + i.alcohol, kcal: a.kcal + i.calories }), { p: 0, c: 0, f: 0, alc: 0, kcal: 0 }), [items]);
    const has = items.length > 0;
    const addMealBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: 9, border: "1px solid var(--accent-line)", background: "var(--accent-soft)", color: "var(--accent)", fontSize: 19, fontWeight: 600, cursor: "pointer", display: "grid", placeItems: "center", lineHeight: 1 };
    return (
        <Card style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: has ? 12 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <span style={{ fontSize: 22 }}>{emoji}</span>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{meal}</div>
                        {has && <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 1, whiteSpace: "nowrap" }}>P {r1(s.p)} · C {r1(s.c)} · F {r1(s.f)} · A {r1(s.alc)}</div>}
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {has && <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r0(s.kcal)}<span style={{ fontSize: 12, color: "var(--faint)", fontWeight: 500 }}> kcal</span></span>}
                    <button className="nut-tap" onClick={() => onAdd(meal)} title={`Add to ${meal}`} aria-label={`Add to ${meal}`} style={addMealBtn}>+</button>
                </div>
            </div>
            {has ? (
                <div>
                    <ColHead />
                    {items.map((it) => <FoodRow key={it.id} it={it} onRemove={() => onRemove(it.id)} onEdit={() => onEdit(it)} />)}
                </div>
            ) : (
                <button onClick={() => onAdd(meal)} style={{ width: "100%", marginTop: 12, padding: "14px", borderRadius: 12, border: "1px dashed var(--border)", background: "transparent", color: "var(--faint)", fontSize: 13, cursor: "pointer" }}>
                    Nothing logged — tap to add a {meal.toLowerCase()} item
                </button>
            )}
        </Card>
    );
}

// ——— Page ———
export default function NutritionPage() {
    const [searchParams] = useSearchParams();
    const initialDate = searchParams.get("date") || undefined;

    const {
        selectedDate, setSelectedDate, items, parsedItems, loggedDates, targets, calorieGoal, waterTarget,
        summary, isLoading, isParsing, isConfirming, parseText, confirmItems, cancelReview,
        deleteItem, updateItem, deleteDay, error,
    } = useNutrition(initialDate);

    const { glasses, saveWater, isSaving: isSavingWater } = useWater(selectedDate);

    const [text, setText] = useState("");
    const [toast, setToast] = useState("");
    const flash = useCallback((m: string) => {
        setToast(m);
        clearTimeout((window as { __nt?: ReturnType<typeof setTimeout> }).__nt);
        (window as { __nt?: ReturnType<typeof setTimeout> }).__nt = setTimeout(() => setToast(""), 1900);
    }, []);

    // Catalog sync
    const [syncMsg, setSyncMsg] = useState<string | null>(null);
    const syncMutation = useMutation({
        mutationFn: async () => {
            const res = await foodCatalogApi.sync();
            if (res.success && res.data) return res.data;
            throw new Error(res.error ?? "Sync failed");
        },
        onSuccess: (d) => setSyncMsg(`Catalog synced — ${d.added} new, ${d.updated} updated, ${d.skipped} unchanged (${d.total} total)`),
        onError: (e) => setSyncMsg(e instanceof Error ? e.message : "Sync failed"),
    });

    // Previous day for macro deltas
    const prevDate = useMemo(() => shiftYMD(selectedDate, -1), [selectedDate]);
    const { data: prevItems = [] } = useQuery({
        queryKey: queryKeys.nutrition.byDate(prevDate),
        queryFn: async () => {
            const res = await nutritionApi.getByDate(prevDate);
            return res.success && res.data ? res.data : [];
        },
        staleTime: 1000 * 60 * 5,
    });
    const prevTotals = useMemo(() => prevItems.reduce((a, i) => ({ p: a.p + i.protein, c: a.c + i.carbs, f: a.f + i.fat, a: a.a + i.alcohol }), { p: 0, c: 0, f: 0, a: 0 }), [prevItems]);

    // Add / edit modal
    const [modal, setModal] = useState<{ open: boolean; meal: MealType; editing: NutritionRow | null; nonce: number }>({ open: false, meal: "Breakfast", editing: null, nonce: 0 });
    const openModal = useCallback((meal: MealType, editing: NutritionRow | null) =>
        setModal((m) => ({ open: true, meal, editing, nonce: m.nonce + 1 })), []);
    const closeModal = useCallback(() => setModal((m) => ({ ...m, open: false, editing: null })), []);

    const handleSubmit = useCallback(async () => {
        if (!text.trim() || isParsing) return;
        await parseText(text.trim());
    }, [text, isParsing, parseText]);

    const handleConfirmSave = useCallback(async (editedItems: NutritionItem[]) => {
        await confirmItems(editedItems);
        setText("");
        flash("Saved to log");
    }, [confirmItems, flash]);

    const handleModalSave = useCallback(async (meal: MealType, f: { name: string; p: number; c: number; f: number; a: number; kcal: number }) => {
        if (modal.editing) {
            await updateItem(modal.editing.id, {
                food_name: f.name, meal, protein: r1(f.p), carbs: r1(f.c), fat: r1(f.f), alcohol: r1(f.a), calories: r1(f.kcal),
            });
            flash("Updated");
        } else {
            const item: NutritionItem = {
                food_name: f.name, meal, protein: r1(f.p), carbs: r1(f.c), fat: r1(f.f), alcohol: r1(f.a), calories: r1(f.kcal),
                amount: 1, unit: "serving", has_missing_macros: false,
            };
            await confirmItems([item]);
            flash(`Added to ${meal}`);
        }
        closeModal();
    }, [modal.editing, updateItem, confirmItems, flash, closeModal]);

    const groupedItems = useMemo(
        () => MEALS.map((m) => ({ meal: m.id, emoji: m.emoji, items: items.filter((i) => i.meal === m.id) })),
        [items],
    );

    const dateLabel = fromYMD(selectedDate).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });

    return (
        <div style={{ ...PAGE_VARS, minHeight: "100dvh", color: "var(--text)" }}>
            {/* Calendar dot + mobile/responsive rules (media + pointer queries can't be inline) */}
            <style>{`
                .rdp-logged { position: relative; }
                .rdp-logged::after { content: ""; position: absolute; left: 50%; bottom: 5px; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 99px; background: var(--teal); }
                .rdp-logged.rdp-selected::after { background: var(--primary-foreground); }

                /* Summary: two columns on wide, stacked on narrow */
                .nut-summary { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 22px; align-items: stretch; }
                @media (max-width: 760px) { .nut-summary { grid-template-columns: 1fr; } }

                /* Food rows: full macro columns on wide, name+kcal on narrow.
                   The trailing action track is a FIXED width (var --act) shared by
                   header and rows, so every macro column lines up. Buttons are
                   absolutely positioned within that reserved track, out of flow. */
                .nut-row { display: grid; grid-template-columns: 1fr 48px 48px 48px 48px 74px var(--act, 64px); align-items: center; position: relative; }
                @media (max-width: 560px) { .nut-row { grid-template-columns: 1fr auto var(--act, 64px); column-gap: 12px; } .nut-pcf { display: none; } }
                @media (pointer: coarse) { .nut-row { --act: 96px; } }

                /* Row actions: always visible on touch, hover-revealed on pointer-fine */
                .nut-actions { position: absolute; right: 4px; top: 0; bottom: 0; display: flex; align-items: center; justify-content: flex-end; gap: 4px; transition: opacity .15s; }
                @media (hover: hover) and (pointer: fine) { .nut-actions { opacity: 0; } .nut-row:hover .nut-actions { opacity: 1; } }

                /* Comfortable tap targets on touch devices (WCAG 2.5.8 / mobile) */
                @media (pointer: coarse) { .nut-tap { min-width: 44px; min-height: 44px; } }
            `}</style>

            <main style={{ width: "100%", maxWidth: 1080, margin: "0 auto", paddingInline: "max(16px, env(safe-area-inset-left))", paddingTop: 8, paddingBottom: "calc(48px + env(safe-area-inset-bottom))", display: "grid", gap: 20 }}>
                {/* Header */}
                <div style={{ paddingTop: 24 }}>
                    <Link to="/" style={{ fontSize: 13, color: "var(--dim)", textDecoration: "none" }}>← Back to Tracker</Link>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginTop: 8 }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-.02em", color: "var(--text)" }}>Nutrition</h1>
                            <p style={{ margin: "8px 0 0", color: "var(--dim)", fontSize: 15 }}>
                                Paste your food notes — the catalog fills in real label macros, AI scales the rest.
                            </p>
                        </div>
                        <button className="nut-tap" onClick={() => { setSyncMsg(null); syncMutation.mutate(); }} disabled={syncMutation.isPending}
                            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 15px", borderRadius: 999, border: "1px solid var(--border)", background: "oklch(1 0 0 / .03)", color: "var(--dim)", fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: syncMutation.isPending ? 0.6 : 1 }}>
                            <Icon name="sync" size={15} style={syncMutation.isPending ? { animation: "spin 1s linear infinite" } : undefined} />
                            {syncMutation.isPending ? "Syncing…" : "Sync catalog"}
                        </button>
                    </div>
                    {syncMsg && <p style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}>{syncMsg}</p>}
                </div>

                {error && (
                    <div style={{ padding: 12, borderRadius: 12, fontSize: 14, background: "oklch(0.55 0.2 25 / 0.1)", border: "1px solid oklch(0.55 0.2 25 / 0.3)", color: "oklch(0.75 0.12 25)" }}>{error}</div>
                )}

                <DateStrip selected={selectedDate} onSelect={setSelectedDate} loggedDates={loggedDates} />

                {/* Summary: ring + macros | water */}
                <div className="nut-summary">
                    <Card style={{ padding: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 28, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                            <CalorieRing consumed={summary.totalCalories} goal={calorieGoal} size={210} />
                            <div style={{ display: "flex", gap: 22 }}>
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 19, fontWeight: 800, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{r0(summary.totalCalories)}</div>
                                    <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>Consumed</div>
                                </div>
                                <div style={{ width: 1, background: "var(--border)" }} />
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 19, fontWeight: 800, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{calorieGoal > 0 ? r0(calorieGoal) : "—"}</div>
                                    <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>Goal</div>
                                </div>
                            </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 220 }}>
                            <MacroBars
                                totals={{ p: summary.totalProtein, c: summary.totalCarbs, f: summary.totalFat, a: summary.totalAlcohol }}
                                goals={{ protein: targets.protein_target, carbs: targets.carbs_target, fat: targets.fat_target }}
                                prev={prevTotals}
                            />
                            {targets.protein_target === 0 && targets.carbs_target === 0 && targets.fat_target === 0 && (
                                <div style={{ marginTop: 14 }}>
                                    <Link to="/profile" style={{ fontSize: 12, color: "var(--accent)" }}>Set your macro targets in Profile →</Link>
                                </div>
                            )}
                        </div>
                    </Card>
                    <WaterCard glasses={glasses} goal={waterTarget} onSave={(n) => { saveWater(n); flash("Water saved"); }} isSaving={isSavingWater} />
                </div>

                {/* Input */}
                <AIInput dateLabel={dateLabel} value={text} setValue={setText} onParse={handleSubmit} onManual={() => openModal("Breakfast", null)} isParsing={isParsing} />

                {/* Food log */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)" }}>Food log</h2>
                    {items.length > 0 && (
                        <button onClick={() => { if (window.confirm("Clear all nutrition entries for this date?")) { deleteDay(); flash("Day cleared"); } }}
                            style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "none", border: "none", color: "var(--faint)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                            <Icon name="close" size={14} /> Clear day
                        </button>
                    )}
                </div>

                {isLoading ? (
                    <div style={{ display: "grid", gap: 16 }}>
                        <div className="skeleton" style={{ height: 96, borderRadius: 18 }} />
                        <div className="skeleton" style={{ height: 96, borderRadius: 18 }} />
                    </div>
                ) : (
                    <div style={{ display: "grid", gap: 16 }}>
                        {groupedItems.map((g) => (
                            <MealSection key={g.meal} meal={g.meal} emoji={g.emoji} items={g.items}
                                onAdd={(m) => openModal(m, null)}
                                onRemove={(id) => { deleteItem(id); }}
                                onEdit={(it) => openModal(it.meal, it)} />
                        ))}
                    </div>
                )}
            </main>

            <AddFoodModal key={modal.nonce} open={modal.open} meal={modal.meal} initial={modal.editing}
                onClose={closeModal}
                onSave={handleModalSave} isSaving={isConfirming} />

            <Toast msg={toast} />

            {parsedItems && (
                <NutritionReviewModal items={parsedItems} onConfirm={handleConfirmSave} onCancel={cancelReview} isSubmitting={isConfirming} />
            )}
        </div>
    );
}
