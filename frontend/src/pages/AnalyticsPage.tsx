import { useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, BarChart3 as BarChartIcon, Brain, FileText, ChevronDown } from "lucide-react";
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    ComposedChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { Popover } from "radix-ui";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { VolumeChart } from "@/components/VolumeChart";
import { useAnalyticsData } from "@/features/analytics/hooks/useAnalyticsData";
import { TIME_RANGES } from "@/lib/constants";
import { formatDateTime } from "@/lib/date-utils";

// ——————————————————— Custom Tooltip ———————————————————

function CustomTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
}) {
    if (!active || !payload?.length) return null;

    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-xl">
            <p className="text-xs font-medium text-[var(--muted-foreground)] mb-1">
                {label}
            </p>
            {payload.map((entry) => (
                <p
                    key={entry.name}
                    className="text-sm font-semibold"
                    style={{ color: entry.color }}
                >
                    {entry.name}: {entry.value.toLocaleString()}
                    {entry.name === "weight" || entry.name === "maxWeight"
                        ? " kg"
                        : ""}
                </p>
            ))}
        </div>
    );
}

// ——————————————————— Main Component ———————————————————

export default function AnalyticsPage() {
    const {
        exercises,
        selectedExercise,
        setSelectedExercise,
        selectedRange,
        setSelectedRange,
        notes,
        isLoading,
        kpis,
        strengthData,
        volumeData,
        effortData,
        hasData,
    } = useAnalyticsData();

    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const filtered = useMemo(() => {
        if (!search.trim()) return exercises;
        const q = search.toLowerCase();
        return exercises.filter((ex) => ex.toLowerCase().includes(q));
    }, [exercises, search]);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setSearch("");
            setHighlightedIndex(0);
        }
        setOpen(nextOpen);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[highlightedIndex]) {
                setSelectedExercise(filtered[highlightedIndex]);
                setOpen(false);
            }
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    return (
        <div className="min-h-screen">
            {/* Background ambient glow */}
            <div
                className="fixed inset-0 pointer-events-none -z-10"
                aria-hidden="true"
                style={{
                    background:
                        "radial-gradient(ellipse 60% 40% at 50% 0%, oklch(0.25 0.15 290 / 0.12), transparent), radial-gradient(ellipse 40% 50% at 20% 20%, oklch(0.3 0.15 160 / 0.1), transparent)",
                }}
            />

            <main className="max-w-4xl mx-auto px-4 pb-16">
                {/* Header */}
                <header className="pt-4 pb-6 flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--foreground)]">
                            Analytics
                        </h1>
                    </div>
                </header>

                {/* Global Controls */}
                <section className="flex flex-wrap gap-3 mb-8 animate-slide-up">
                    <Popover.Root open={open} onOpenChange={handleOpenChange}>
                        <Popover.Trigger asChild>
                            <button
                                className="border-input [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-64 items-center justify-between gap-2 rounded-md border bg-[var(--card)] px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] h-9"
                                aria-expanded={open}
                                aria-haspopup="listbox"
                            >
                                <span className={selectedExercise ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}>
                                    {selectedExercise || "Select exercise…"}
                                </span>
                                <ChevronDown className="size-4 opacity-50" />
                            </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                            <Popover.Content
                                className="z-50 min-w-[16rem] rounded-md border border-[var(--border)] bg-[var(--card)] p-1 shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                                sideOffset={4}
                                onOpenAutoFocus={(e) => {
                                    e.preventDefault();
                                    inputRef.current?.focus();
                                }}
                            >
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setHighlightedIndex(0);
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Search exercises…"
                                    role="combobox"
                                    aria-expanded={open}
                                    aria-controls="exercise-listbox"
                                    aria-activedescendant={
                                        filtered[highlightedIndex]
                                            ? `exercise-option-${highlightedIndex}`
                                            : undefined
                                    }
                                    className="w-full rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus-visible:ring-[var(--ring)] focus-visible:ring-1 mb-1"
                                />
                                <ul
                                    id="exercise-listbox"
                                    role="listbox"
                                    className="max-h-64 overflow-auto"
                                >
                                    {filtered.map((ex, i) => (
                                        <li
                                            key={ex}
                                            id={`exercise-option-${i}`}
                                            role="option"
                                            aria-selected={i === highlightedIndex}
                                            className={`relative cursor-default select-none rounded-sm px-3 py-1.5 text-sm text-[var(--foreground)] ${
                                                i === highlightedIndex
                                                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                                                    : ""
                                            }`}
                                            onClick={() => {
                                                setSelectedExercise(ex);
                                                setOpen(false);
                                            }}
                                            onMouseEnter={() => setHighlightedIndex(i)}
                                        >
                                            {ex}
                                        </li>
                                    ))}
                                    {filtered.length === 0 && (
                                        <li className="px-3 py-2 text-sm text-[var(--muted-foreground)]">
                                            No exercises found
                                        </li>
                                    )}
                                </ul>
                            </Popover.Content>
                        </Popover.Portal>
                    </Popover.Root>

                    <Select value={selectedRange} onValueChange={setSelectedRange}>
                        <SelectTrigger className="w-44 bg-[var(--card)] border-[var(--border)] text-[var(--foreground)]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[var(--card)] border-[var(--border)]">
                            {TIME_RANGES.map((r) => (
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
                </section>

                {/* No exercises state */}
                {exercises.length === 0 && !isLoading ? (
                    <div className="glass-card p-12 text-center animate-fade-in">
                        <div className="text-5xl mb-4 text-[var(--muted-foreground)]">📊</div>
                        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                            No data yet
                        </h3>
                        <p className="text-[var(--muted-foreground)] max-w-sm mx-auto mb-4">
                            Log some workouts first, then come back here to see your progress
                            charts.
                        </p>
                        <Link to="/" className="btn-primary inline-block text-sm">
                            Go Log Workouts
                        </Link>
                    </div>
                ) : (
                    <>
                        {/* KPI Quick Stats */}
                        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 animate-slide-up">
                            <div className="glass-card px-4 pt-4 pb-4">
                                <p className="text-xs text-[var(--muted-foreground)] mb-2">Max Weight</p>
                                <div className="stat-value text-2xl">
                                    {kpis.maxWeight}
                                    <span className="text-sm font-normal text-[var(--muted-foreground)] ml-1">kg</span>
                                </div>
                            </div>

                            <div className="glass-card px-4 pt-4 pb-4">
                                <p className="text-xs text-[var(--muted-foreground)] mb-2">Est. 1RM</p>
                                <div className="stat-value text-2xl">
                                    {kpis.e1rm}
                                    <span className="text-sm font-normal text-[var(--muted-foreground)] ml-1">kg</span>
                                </div>
                            </div>

                            <div className="glass-card px-4 pt-4 pb-4">
                                <p className="text-xs text-[var(--muted-foreground)] mb-2">Max Volume</p>
                                <div className="stat-value text-2xl">
                                    {kpis.maxVolume.toLocaleString()}
                                    <span className="text-sm font-normal text-[var(--muted-foreground)] ml-1">kg</span>
                                </div>
                            </div>

                            <div className="glass-card px-4 pt-4 pb-4">
                                <p className="text-xs text-[var(--muted-foreground)] mb-2">Sessions</p>
                                <div className="stat-value text-2xl">
                                    {kpis.totalSessions}
                                </div>
                            </div>
                        </section>

                        {/* Muscle Group Volume Chart (Independent of chosen exercise) */}
                        <div className="animate-slide-up" style={{ animationDelay: "0.1s" }}>
                            <VolumeChart />
                        </div>

                        {isLoading ? (
                            <div className="space-y-6">
                                <div className="skeleton h-64 w-full rounded-xl" />
                                <div className="skeleton h-64 w-full rounded-xl" />
                            </div>
                        ) : !hasData ? (
                            <div className="glass-card p-12 text-center animate-fade-in">
                                <p className="text-[var(--muted-foreground)]">
                                    No data for{" "}
                                    <span className="text-[var(--foreground)] font-medium">
                                        {selectedExercise}
                                    </span>{" "}
                                    in this time range.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Chart 1: Absolute Strength (Line) */}
                                <div className="glass-card animate-slide-up">
                                    <div className="px-6 pt-6 pb-2">
                                        <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4" />
                                            Absolute Strength
                                        </h2>
                                        <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                            Max weight lifted per session over time
                                        </p>
                                    </div>
                                    <div className="px-6 pb-6">
                                        <div className="h-72">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={strengthData}>
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
                                                    />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="maxWeight"
                                                        name="maxWeight"
                                                        stroke="var(--chart-1)"
                                                        strokeWidth={2.5}
                                                        dot={{
                                                            r: 4,
                                                            fill: "var(--chart-1)",
                                                            stroke: "var(--card)",
                                                            strokeWidth: 2,
                                                        }}
                                                        activeDot={{ r: 6 }}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                {/* Chart 2: Volume (Bar) */}
                                <div
                                    className="glass-card animate-slide-up"
                                    style={{ animationDelay: "60ms" }}
                                >
                                    <div className="px-6 pt-6 pb-2">
                                        <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                                            <BarChartIcon className="w-4 h-4" />
                                            Hypertrophy & Workload
                                        </h2>
                                        <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                            Total volume (weight × reps) per session
                                        </p>
                                    </div>
                                    <div className="px-6 pb-6">
                                        <div className="h-72">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={volumeData}>
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
                                                    />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Bar
                                                        dataKey="volume"
                                                        name="volume"
                                                        fill="var(--chart-2)"
                                                        radius={[6, 6, 0, 0]}
                                                        opacity={0.85}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                {/* Chart 3: Effort vs Weight (Composed) */}
                                <div
                                    className="glass-card animate-slide-up"
                                    style={{ animationDelay: "120ms" }}
                                >
                                    <div className="px-6 pt-6 pb-2">
                                        <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                                            <Brain className="w-4 h-4" />
                                            Effort vs. Weight
                                        </h2>
                                        <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                            RPE (shaded area) overlaid on weight (line) — getting
                                            stronger means same weight, lower RPE
                                        </p>
                                    </div>
                                    <div className="px-6 pb-6">
                                        <div className="h-72">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={effortData}>
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
                                                        yAxisId="weight"
                                                        stroke="var(--muted-foreground)"
                                                        fontSize={12}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        unit=" kg"
                                                    />
                                                    <YAxis
                                                        yAxisId="rpe"
                                                        orientation="right"
                                                        stroke="var(--muted-foreground)"
                                                        fontSize={12}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        domain={[0, 10]}
                                                    />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Area
                                                        yAxisId="rpe"
                                                        type="monotone"
                                                        dataKey="rpe"
                                                        name="rpe"
                                                        fill="var(--chart-3)"
                                                        fillOpacity={0.15}
                                                        stroke="var(--chart-3)"
                                                        strokeWidth={1.5}
                                                        strokeDasharray="4 4"
                                                    />
                                                    <Line
                                                        yAxisId="weight"
                                                        type="monotone"
                                                        dataKey="weight"
                                                        name="weight"
                                                        stroke="var(--chart-1)"
                                                        strokeWidth={2.5}
                                                        dot={{
                                                            r: 4,
                                                            fill: "var(--chart-1)",
                                                            stroke: "var(--card)",
                                                            strokeWidth: 2,
                                                        }}
                                                    />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                {/* Recent Notes Table */}
                                {notes.length > 0 ? (
                                    <div
                                        className="glass-card animate-slide-up"
                                        style={{ animationDelay: "180ms" }}
                                    >
                                        <div className="px-6 pt-6 pb-2">
                                            <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                                                <FileText className="w-4 h-4" />
                                                Recent Notes
                                            </h2>
                                            <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                                Your Thai & English comments from recent sessions
                                            </p>
                                        </div>
                                        <div className="px-6 pb-6">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="border-b border-[var(--border)]">
                                                        <th className="text-left text-xs font-medium text-[var(--muted-foreground)] pb-3 pr-4">Date</th>
                                                        <th className="text-left text-xs font-medium text-[var(--muted-foreground)] pb-3 pr-4">Weight</th>
                                                        <th className="text-left text-xs font-medium text-[var(--muted-foreground)] pb-3">Notes</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {notes.map((n) => (
                                                        <tr
                                                            key={n.id}
                                                            className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--accent)]/30 transition-colors"
                                                        >
                                                            <td className="text-sm text-[var(--muted-foreground)] whitespace-nowrap py-3 pr-4">
                                                                {formatDateTime(n.created_at)}
                                                            </td>
                                                            <td className="text-sm text-[var(--foreground)] font-medium tabular-nums whitespace-nowrap py-3 pr-4">
                                                                {n.weight}kg × {n.reps}
                                                                {n.rpe > 0 ? ` @${n.rpe}` : ""}
                                                            </td>
                                                            <td className="text-sm py-3">
                                                                {n.notes_thai ? (
                                                                    <span className="text-[var(--chart-4)] block">
                                                                        🇹🇭 {n.notes_thai}
                                                                    </span>
                                                                ) : null}
                                                                {n.notes_english ? (
                                                                    <span className="text-[var(--muted-foreground)] block">
                                                                        🇬🇧 {n.notes_english}
                                                                    </span>
                                                                ) : null}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
