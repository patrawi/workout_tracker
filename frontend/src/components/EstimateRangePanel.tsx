import { formatInterval, roundToWhole, roundToOneDecimal } from "@/features/nutrition-estimation/format";
import type { ResolvedEstimate } from "@/features/nutrition-estimation/estimate";

interface EstimateRangePanelProps {
    estimate: ResolvedEstimate;
}

/**
 * "Plausible Nutrition Range" display (design spec §6): low–central–high per
 * nutrient plus the explanation panel — reference used, complete per-component
 * breakdown (consumed weight, fraction, per-nutrient contribution), range
 * drivers, and the measured/estimated + relaxed-assumptions flags.
 */
export default function EstimateRangePanel({ estimate }: EstimateRangePanelProps) {
    const { calculation, explanation, reference, components } = estimate;
    const { nutrients, per_component, drivers, relaxed, relaxed_constraints } = calculation;
    const macroRows: Array<{ label: string; key: "protein" | "carbs" | "fat" | "alcohol"; unit: string; color: string }> = [
        { label: "Protein", key: "protein", unit: "g", color: "text-emerald-400" },
        { label: "Carbs", key: "carbs", unit: "g", color: "text-amber-400" },
        { label: "Fat", key: "fat", unit: "g", color: "text-rose-400" },
        { label: "Alcohol", key: "alcohol", unit: "g", color: "text-sky-400" },
    ];

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Plausible Nutrition Range</h3>
                <p className="text-xs text-surface-400 mt-1">
                    Low–central–high from the evidence — the central value is logged on confirm.
                </p>
            </div>

            {/* Calories headline */}
            <div className="rounded-xl bg-surface-100/50 border border-surface-300/20 p-4 text-center">
                <div className="text-3xl font-bold text-white tabular-nums">
                    {formatInterval(nutrients.calories, roundToWhole)}
                    <span className="text-sm font-medium text-surface-400 ml-2">kcal</span>
                </div>
            </div>

            {/* Macros */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {macroRows.map((m) => (
                    <div key={m.key} className="rounded-xl bg-surface-100/50 border border-surface-300/20 p-3">
                        <div className={`text-xs font-semibold ${m.color}`}>{m.label}</div>
                        <div className="text-sm text-white tabular-nums mt-1">
                            {formatInterval(nutrients[m.key], roundToOneDecimal)}
                            <span className="text-surface-400"> {m.unit}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Flags */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="tag-pill">{explanation.portion_mode === "measured" ? "Measured weights" : "Estimated weights"}</span>
                {relaxed && (
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        ⚠ Relaxed assumptions{relaxed_constraints.length > 0 ? `: ${relaxed_constraints.join(", ")}` : ""}
                    </span>
                )}
                {explanation.manually_entered_fields && (
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-white/5 text-surface-400 border border-surface-300/30">
                        Includes manually entered fields
                    </span>
                )}
            </div>

            {/* Reference + per-component breakdown */}
            <div className="rounded-xl bg-surface-100/50 border border-surface-300/20 p-4 space-y-3">
                <div className="text-xs text-surface-400">
                    Reference:{" "}
                    {reference ? (
                        <span className="text-white font-medium">
                            {reference.nameEn ?? reference.nameTh ?? `#${reference.id}`}
                            <span className="text-surface-400 font-normal">
                                {" "}— {reference.provider} v{reference.version}
                            </span>
                        </span>
                    ) : explanation.reference ? (
                        <span className="text-white font-medium">
                            #{explanation.reference.id}
                            <span className="text-surface-400 font-normal">
                                {" "}— {explanation.reference.provider} v{explanation.reference.version}
                            </span>
                        </span>
                    ) : (
                        "none"
                    )}
                </div>

                {per_component.length > 0 && (
                    <div className="space-y-2.5">
                        {per_component.map((component) => {
                            // The fraction lives on the persisted component row; match by name.
                            const fraction = components.find((c) => c.name === component.name)?.consumed_fraction;
                            return (
                                <div key={component.name}>
                                    <div className="flex items-baseline justify-between gap-3 text-xs">
                                        <span className="text-white font-medium truncate">{component.name}</span>
                                        <span className="text-surface-400 tabular-nums whitespace-nowrap">
                                            {formatInterval(component.consumed_weight_g, roundToWhole)} g eaten
                                            {fraction !== undefined && <> · {Math.round(fraction * 100)}%</>}
                                            {" → "}
                                            <span className="text-surface-300">
                                                {formatInterval(component.contribution.calories, roundToWhole)} kcal
                                            </span>
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-surface-400 tabular-nums mt-0.5">
                                        P {formatInterval(component.contribution.protein, roundToOneDecimal)} g · C{" "}
                                        {formatInterval(component.contribution.carbs, roundToOneDecimal)} g · F{" "}
                                        {formatInterval(component.contribution.fat, roundToOneDecimal)} g
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {drivers.length > 0 && (
                    <div className="text-xs text-surface-400 border-t border-surface-300/20 pt-2">
                        Range drivers: {drivers.join("; ")}
                    </div>
                )}
            </div>
        </div>
    );
}
