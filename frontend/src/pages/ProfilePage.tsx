import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIME_RANGES } from "@/lib/constants";
import { useProfile } from "@/features/profile/hooks/useProfile";
import PushNotificationToggle from "@/components/PushNotificationToggle";

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; color: string }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[var(--popover)] border border-[var(--border)] p-3 rounded-lg shadow-xl shadow-black/50">
        <p className="font-medium text-[var(--foreground)] mb-1">{label}</p>
        {payload.map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]"
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span>
              Bodyweight:{" "}
              <span className="font-medium text-[var(--foreground)]">{p.value} kg</span>
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function ProfilePage() {
  const {
    profile,
    bodyweightDate,
    setBodyweightDate,
    bodyweights,
    selectedRange,
    setSelectedRange,
    isLoading,
    isSaving,
    isDirty,
    saved,
    updateField,
    saveProfile,
    bmi,
    bmiLabel,
  } = useProfile();
  return (
    <div className="min-h-screen">
      {/* Background ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none -z-10"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, oklch(0.25 0.15 55 / 0.12), transparent), radial-gradient(ellipse 40% 50% at 80% 20%, oklch(0.3 0.15 160 / 0.1), transparent)",
        }}
      />

      <main className="max-w-xl mx-auto px-4 pb-16">
        {/* Header */}
        <header className="pt-10 pb-6">
          <Link
            to="/"
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors mb-2 inline-flex items-center gap-1"
          >
            ← Back to Tracker
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--foreground)]">
            My Profile
          </h1>
          <p className="text-[var(--muted-foreground)] text-sm mt-2">
            Your body stats are used to calculate volume for bodyweight
            exercises.
          </p>
        </header>

        {isLoading ? (
          <div className="space-y-4">
            <div className="skeleton h-32 rounded-xl" />
            <div className="skeleton h-32 rounded-xl" />
            <div className="skeleton h-64 rounded-xl" />
          </div>
        ) : (
          <div className="animate-slide-up space-y-6">
            {/* Top Bento Row: Metrics & Nutrition */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: Body Metrics */}
              <div className="glass-card p-6 space-y-6 flex flex-col h-full">
                <h3 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                  📏 Body Metrics
                </h3>

                <div className="space-y-4 flex-grow">
                  <div>
                    <label className="text-xs text-[var(--muted-foreground)] block mb-1.5">
                      Current Weight
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={profile.weight_kg || ""}
                        onChange={(e) =>
                          updateField("weight_kg", Number(e.target.value))
                        }
                        className="glass-input w-full px-4 py-3 text-base text-[var(--foreground)] pr-12"
                        step="0.1"
                        min="0"
                        placeholder="75"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
                        kg
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted-foreground)] block mb-1.5">
                      Weigh-in Date
                    </label>
                    <input
                      type="date"
                      value={bodyweightDate}
                      onChange={(e) => setBodyweightDate(e.target.value)}
                      className="glass-input w-full px-4 py-3 text-base text-[var(--foreground)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted-foreground)] block mb-1.5">
                      Height
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={profile.height_cm || ""}
                        onChange={(e) =>
                          updateField("height_cm", Number(e.target.value))
                        }
                        className="glass-input w-full px-4 py-3 text-base text-[var(--foreground)] pr-12"
                        step="0.5"
                        min="0"
                        placeholder="175"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
                        cm
                      </span>
                    </div>
                  </div>
                </div>

                {/* BMI indicator pinned to bottom */}
                <div className="mt-auto pt-4">
                  {bmi > 0 ? (
                    <div
                      className="rounded-lg px-4 py-3 flex items-center justify-between"
                      style={{ background: "oklch(0.22 0.015 260 / 0.4)", border: "1px solid oklch(0.28 0.015 260 / 0.3)" }}
                    >
                      <span className="text-xs text-[var(--muted-foreground)] font-medium tracking-wide uppercase">
                        BMI
                      </span>
                      <span className="text-lg font-bold text-[var(--foreground)] tabular-nums">
                        {bmi}{" "}
                        <span
                          className="text-xs font-normal ml-1 px-2 py-0.5 rounded-full"
                          style={
                            bmiLabel === "Normal"
                              ? { background: "oklch(0.65 0.22 160 / 0.12)", color: "oklch(0.72 0.19 160)" }
                              : bmiLabel === "Underweight" || bmiLabel === "Overweight"
                                ? { background: "oklch(0.65 0.22 55 / 0.12)", color: "oklch(0.65 0.22 55)" }
                                : { background: "oklch(0.55 0.2 25 / 0.12)", color: "oklch(0.65 0.2 25)" }
                          }
                        >
                          {bmiLabel}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div
                      className="rounded-lg px-4 py-3 flex items-center justify-between opacity-50"
                      style={{ background: "oklch(0.22 0.015 260 / 0.4)", border: "1px solid oklch(0.28 0.015 260 / 0.3)" }}
                    >
                      <span className="text-xs text-[var(--muted-foreground)] font-medium tracking-wide uppercase">
                        BMI
                      </span>
                      <span className="text-sm text-[var(--muted-foreground)]">---</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: Nutrition */}
              <div className="glass-card p-6 space-y-6 flex flex-col h-full">
                <h3 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                  🍽️ Nutrition Targets
                </h3>

                <div className="space-y-4 flex-grow">
                  <div>
                    <label className="text-xs text-[var(--muted-foreground)] block mb-1.5 flex lg:items-center justify-between">
                      <span>TDEE</span>
                      <span className="text-[10px] opacity-60 hidden sm:inline">
                        (Total Daily Energy Exp.)
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={profile.tdee || ""}
                        onChange={(e) =>
                          updateField("tdee", Number(e.target.value))
                        }
                        className="glass-input w-full px-4 py-3 text-base text-[var(--foreground)] pr-14"
                        min="0"
                        placeholder="2500"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
                        kcal
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted-foreground)] block mb-1.5">
                      Daily Intended Calories
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={profile.calories_intake || ""}
                        onChange={(e) =>
                          updateField("calories_intake", Number(e.target.value))
                        }
                        className="glass-input w-full px-4 py-3 text-base text-[var(--foreground)] pr-14"
                        min="0"
                        placeholder="2000"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
                        kcal
                      </span>
                    </div>
                  </div>

                  {/* Macro Targets */}
                  <div className="pt-2 border-t border-[var(--border)]/15">
                    <p className="text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wider mb-3">
                      Daily Macro Targets
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "oklch(0.72 0.19 160 / 0.8)" }}>
                          Protein
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={profile.protein_target || ""}
                            onChange={(e) =>
                              updateField(
                                "protein_target",
                                Number(e.target.value),
                              )
                            }
                            className="glass-input w-full pl-2.5 py-2.5 text-sm text-[var(--foreground)] pr-6"
                            min="0"
                            placeholder="158"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)]">
                            g
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "oklch(0.65 0.22 55 / 0.8)" }}>
                          Carbs
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={profile.carbs_target || ""}
                            onChange={(e) =>
                              updateField(
                                "carbs_target",
                                Number(e.target.value),
                              )
                            }
                            className="glass-input w-full pl-2.5 py-2.5 text-sm text-[var(--foreground)] pr-6"
                            min="0"
                            placeholder="305"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)]">
                            g
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs block mb-1" style={{ color: "oklch(0.65 0.2 330 / 0.8)" }}>
                          Fat
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={profile.fat_target || ""}
                            onChange={(e) =>
                              updateField("fat_target", Number(e.target.value))
                            }
                            className="glass-input w-full pl-2.5 py-2.5 text-sm text-[var(--foreground)] pr-6"
                            min="0"
                            placeholder="60"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)]">
                            g
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Water target */}
                    <div className="mt-4">
                      <label className="text-xs block mb-1" style={{ color: "oklch(0.7 0.13 200 / 0.85)" }}>
                        Daily Water Target
                      </label>
                      <div className="relative max-w-[10rem]">
                        <input
                          type="number"
                          value={profile.water_target_glasses || ""}
                          onChange={(e) =>
                            updateField(
                              "water_target_glasses",
                              Number(e.target.value),
                            )
                          }
                          className="glass-input w-full pl-2.5 py-2.5 text-sm text-[var(--foreground)] pr-16"
                          min="0"
                          placeholder="10"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)]">
                          glasses
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
                        250&nbsp;ml each · {((profile.water_target_glasses || 0) * 250 / 1000).toFixed(2)} L
                      </p>
                    </div>
                  </div>
                </div>

                {/* Surplus/deficit indicator pinned to bottom */}
                <div className="mt-auto pt-4">
                  {profile.tdee > 0 && profile.calories_intake > 0 ? (
                    <div
                      className="rounded-lg px-4 py-3 flex items-center justify-between"
                      style={{ background: "oklch(0.22 0.015 260 / 0.4)", border: "1px solid oklch(0.28 0.015 260 / 0.3)" }}
                    >
                      <span className="text-xs text-[var(--muted-foreground)] font-medium tracking-wide uppercase">
                        {profile.calories_intake >= profile.tdee
                          ? "Surplus"
                          : "Deficit"}
                      </span>
                      <span
                        className="text-lg font-bold tabular-nums px-2 py-0.5 rounded"
                        style={
                          profile.calories_intake >= profile.tdee
                            ? { color: "oklch(0.7 0.18 195)", background: "oklch(0.7 0.18 195 / 0.1)" }
                            : { color: "oklch(0.65 0.22 55)", background: "oklch(0.65 0.22 55 / 0.1)" }
                        }
                      >
                        {profile.calories_intake >= profile.tdee ? "+" : ""}
                        {profile.calories_intake - profile.tdee} kcal
                      </span>
                    </div>
                  ) : (
                    <div
                      className="rounded-lg px-4 py-3 flex items-center justify-between opacity-50"
                      style={{ background: "oklch(0.22 0.015 260 / 0.4)", border: "1px solid oklch(0.28 0.015 260 / 0.3)" }}
                    >
                      <span className="text-xs text-[var(--muted-foreground)] font-medium tracking-wide uppercase">
                        Target
                      </span>
                      <span className="text-sm text-[var(--muted-foreground)]">---</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Save button row */}
            <div className="pt-2">
              <button
                type="button"
                onClick={saveProfile}
                disabled={isSaving || !isDirty}
                className="btn-primary w-full md:w-auto md:min-w-[200px] text-base px-8 py-3 flex items-center justify-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <span
                      className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full"
                      style={{ animation: "spin 0.6s linear infinite" }}
                      aria-hidden="true"
                    />
                    Saving Data…
                  </>
                ) : saved ? (
                  "✓ Saved History!"
                ) : !isDirty ? (
                  "No Changes to Save"
                ) : (
                  "Save Profile Data"
                )}
              </button>
            </div>

            {/* Push Notifications Settings */}
            <div className="glass-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                🔔 Settings
              </h3>
              <PushNotificationToggle />
            </div>

            {/* Chart Row */}
            <div className="pt-6">
              {/* Chart Header w/ Range Selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 px-1">
                <h3 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
                  ⚖️ Bodyweight Trend
                </h3>
                <Select value={selectedRange} onValueChange={setSelectedRange}>
                  <SelectTrigger className="w-full sm:w-[160px] glass-input text-[var(--foreground)]">
                    <SelectValue placeholder="Time Range" />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--card)] border-[var(--border)]">
                    {TIME_RANGES.filter((r) =>
                      ["7", "30", "90", "180", "0"].includes(r.value),
                    ).map((r) => (
                      <SelectItem
                        key={r.value}
                        value={r.value}
                        className="text-[var(--foreground)] hover:bg-[var(--accent)] focus:bg-[var(--accent)]"
                      >
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {bodyweights.length === 0 ? (
                <div className="glass-card p-12 text-center">
                  <p className="text-[var(--muted-foreground)]">
                    No historical data found in this time range.
                  </p>
                </div>
              ) : (
                <div className="glass-card">
                  <div className="px-6 pt-6 pb-6">
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={bodyweights}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--border)"
                            opacity={0.4}
                          />
                          <XAxis
                            dataKey="date"
                            stroke="var(--muted-foreground)"
                            fontSize={12}
                            tickLine={false}
                          />
                          <YAxis
                            stroke="var(--muted-foreground)"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            unit=" kg"
                            domain={["dataMin - 1", "dataMax + 1"]}
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <Line
                            type="monotone"
                            dataKey="weight"
                            name="Bodyweight"
                            stroke="var(--chart-4)"
                            strokeWidth={3}
                            dot={{
                              r: 4,
                              fill: "var(--chart-4)",
                              stroke: "var(--card)",
                              strokeWidth: 2,
                            }}
                            activeDot={{
                              r: 6,
                              fill: "var(--chart-4)",
                              stroke: "var(--background)",
                              strokeWidth: 2,
                            }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
