import { useState } from "react";
import type { GymRow } from "@/lib/api/gyms";
import { EQUIPMENT_GROUPS } from "@/features/workouts/equipment-catalog";

interface GymProfileSheetProps {
    gym: GymRow;
    onClose: () => void;
    onSave: (equipment: string[] | null) => Promise<void>;
    saving: boolean;
}

/**
 * Gym Profile editor (PAT-56 Phase 2, ADR 0027): three equipment groups with
 * per-machine ticks. Tapping a group header presets the whole group, then
 * untick what that gym lacks — setup is one pass per gym. `null` ticks = no
 * profile (the gym is unrestricted); an empty tick list is a real profile
 * with nothing available.
 */
export default function GymProfileSheet({ gym, onClose, onSave, saving }: GymProfileSheetProps) {
    // null = untouched profile; array = what will be saved.
    const [ticks, setTicks] = useState<string[] | null>(gym.equipment);
    // Group collapse state (expanded by default); the group NAME is the
    // whole-group preset tap, the chevron alone collapses — two separate
    // targets so a preset never hides the machines.
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const hasProfile = ticks !== null;

    function toggleItem(value: string) {
        setTicks((prev) => {
            const base = prev ?? [];
            return base.includes(value)
                ? base.filter((v) => v !== value)
                : [...base, value];
        });
    }

    function toggleGroup(values: string[]) {
        setTicks((prev) => {
            const base = prev ?? [];
            const allTicked = values.every((v) => base.includes(v));
            return allTicked
                ? base.filter((v) => !values.includes(v))
                : [...new Set([...base, ...values])];
        });
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            onClick={onClose}
        >
            <div
                className="glass-card w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-6 space-y-5 animate-slide-up"
                style={{ background: "oklch(0.18 0.012 260 / 0.92)" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-[var(--foreground)]">
                            🏋️ {gym.name}
                        </h3>
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            {hasProfile
                                ? `โปรไฟล์อุปกรณ์ · ${ticks.length} รายการ`
                                : "ยังไม่มีโปรไฟล์ — โค้ชจะไม่จำกัดอุปกรณ์ที่ยิมนี้"}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-xl leading-none p-1"
                        aria-label="ปิด"
                    >
                        ×
                    </button>
                </div>

                {!hasProfile && (
                    <div
                        className="rounded-lg px-4 py-3 text-xs text-[var(--muted-foreground)]"
                        style={{ background: "oklch(0.22 0.015 260 / 0.4)", border: "1px solid oklch(0.28 0.015 260 / 0.3)" }}
                    >
                        ติ๊กอุปกรณ์ที่ยิมนี้มี แล้วกดบันทึก — โค้ชจะเลือก/substitute ท่าตามที่ติ๊กเท่านั้น
                        (ท่าที่เคยเล่นที่ยิมนี้ถือว่าเล่นได้อยู่แล้ว)
                    </div>
                )}

                {/* Equipment groups */}
                <div className="space-y-5">
                    {EQUIPMENT_GROUPS.map((group) => {
                        const values = group.items.map((i) => i.value);
                        const tickedCount = hasProfile
                            ? values.filter((v) => ticks.includes(v)).length
                            : 0;
                        const isCollapsed = collapsed[group.key] ?? false;
                        return (
                            <div key={group.key}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => toggleGroup(values)}
                                            className="text-sm font-bold text-[var(--foreground)] hover:opacity-80 transition-opacity"
                                            title="แตะเพื่อติ๊ก/ล้างทั้งกลุ่ม"
                                        >
                                            {group.label}
                                        </button>
                                        <button
                                            onClick={() =>
                                                setCollapsed((prev) => ({ ...prev, [group.key]: !isCollapsed }))
                                            }
                                            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-xs px-1"
                                            aria-label={isCollapsed ? "ขยายกลุ่ม" : "พับกลุ่ม"}
                                        >
                                            {isCollapsed ? "▸" : "▾"}
                                        </button>
                                    </div>
                                    <span
                                        className="text-xs px-2 py-0.5 rounded-full tabular-nums"
                                        style={
                                            tickedCount > 0
                                                ? { background: "oklch(0.65 0.22 160 / 0.12)", color: "oklch(0.72 0.19 160)" }
                                                : { background: "oklch(0.25 0.01 260 / 0.5)", color: "var(--muted-foreground)" }
                                        }
                                    >
                                        {tickedCount}/{values.length}
                                    </span>
                                </div>
                                {!isCollapsed && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {group.items.map((item) => {
                                            const ticked = hasProfile && ticks.includes(item.value);
                                            return (
                                                <button
                                                    key={item.value}
                                                    onClick={() => toggleItem(item.value)}
                                                    className="text-left text-xs px-3 py-2.5 rounded-lg transition-all"
                                                    style={
                                                        ticked
                                                            ? {
                                                                  background: "oklch(0.65 0.22 160 / 0.12)",
                                                                  border: "1px solid oklch(0.72 0.19 160 / 0.4)",
                                                                  color: "oklch(0.72 0.19 160)",
                                                              }
                                                            : {
                                                                  background: "oklch(0.22 0.015 260 / 0.4)",
                                                                  border: "1px solid oklch(0.28 0.015 260 / 0.3)",
                                                                  color: "var(--muted-foreground)",
                                                              }
                                                    }
                                                >
                                                    {ticked ? "✓ " : ""}
                                                    {item.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                        onClick={() => setTicks(null)}
                        disabled={!hasProfile || saving}
                        className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40"
                    >
                        ล้างโปรไฟล์ (ไม่จำกัด)
                    </button>
                    <button
                        onClick={() => onSave(ticks)}
                        disabled={saving}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: "oklch(0.72 0.19 160)", color: "oklch(0.15 0.02 160)" }}
                    >
                        {saving ? "กำลังบันทึก…" : hasProfile ? `บันทึก (${ticks.length} อุปกรณ์)` : "บันทึก"}
                    </button>
                </div>
            </div>
        </div>
    );
}
