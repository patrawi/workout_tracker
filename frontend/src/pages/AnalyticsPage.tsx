import { Link } from "react-router-dom";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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

            <main className="max-w-5xl mx-auto px-4 pb-16">
                {/* Header */}
                <header className="pt-4 pb-6 flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gradient">
                            Analytics
                        </h1>
                    </div>
                </header>

                {/* Global Controls */}
                <section className="flex flex-wrap gap-3 mb-8 animate-slide-up">
                    <Select
                        value={selectedExercise}
                        onValueChange={setSelectedExercise}
                    >
                        <SelectTrigger className="w-64 bg-[var(--card)] border-[var(--border)] text-white">
                            <SelectValue placeholder="Select exercise…" />
                        </SelectTrigger>
                        <SelectContent className="bg-[var(--card)] border-[var(--border)]">
                            {exercises.map((ex) => (
                                <SelectItem
                                    key={ex}
                                    value={ex}
                                    className="text-white hover:bg-[var(--accent)] focus:bg-[var(--accent)]"
                                >
                                    {ex}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={selectedRange} onValueChange={setSelectedRange}>
                        <SelectTrigger className="w-44 bg-[var(--card)] border-[var(--border)] text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[var(--card)] border-[var(--border)]">
                            {TIME_RANGES.map((r) => (
                                <SelectItem
                                    key={r.value}
                                    value={r.value}
                                    className="text-white hover:bg-[var(--accent)] focus:bg-[var(--accent)]"
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
                        <div className="text-5xl mb-4">📊</div>
                        <h3 className="text-lg font-semibold text-white mb-2">
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
                            <Card className="bg-[var(--card)] border-[var(--border)]">
                                <CardHeader className="pb-2 pt-4 px-4">
                                    <CardDescription className="text-xs">
                                        Max Weight
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <div className="text-2xl font-bold text-white tabular-nums">
                                        {kpis.maxWeight}
                                        <span className="text-sm font-normal text-[var(--muted-foreground)] ml-1">
                                            kg
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-[var(--card)] border-[var(--border)]">
                                <CardHeader className="pb-2 pt-4 px-4">
                                    <CardDescription className="text-xs">
                                        Est. 1RM
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <div className="text-2xl font-bold text-white tabular-nums">
                                        {kpis.e1rm}
                                        <span className="text-sm font-normal text-[var(--muted-foreground)] ml-1">
                                            kg
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-[var(--card)] border-[var(--border)]">
                                <CardHeader className="pb-2 pt-4 px-4">
                                    <CardDescription className="text-xs">
                                        Max Volume
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <div className="text-2xl font-bold text-white tabular-nums">
                                        {kpis.maxVolume.toLocaleString()}
                                        <span className="text-sm font-normal text-[var(--muted-foreground)] ml-1">
                                            kg
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-[var(--card)] border-[var(--border)]">
                                <CardHeader className="pb-2 pt-4 px-4">
                                    <CardDescription className="text-xs">
                                        Sessions
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <div className="text-2xl font-bold text-white tabular-nums">
                                        {kpis.totalSessions}
                                    </div>
                                </CardContent>
                            </Card>
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
                                    <span className="text-white font-medium">
                                        {selectedExercise}
                                    </span>{" "}
                                    in this time range.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Chart 1: Absolute Strength (Line) */}
                                <Card className="bg-[var(--card)] border-[var(--border)] animate-slide-up">
                                    <CardHeader>
                                        <CardTitle className="text-white text-lg">
                                            💪 Absolute Strength
                                        </CardTitle>
                                        <CardDescription>
                                            Max weight lifted per session over time
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
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
                                    </CardContent>
                                </Card>

                                {/* Chart 2: Volume (Bar) */}
                                <Card
                                    className="bg-[var(--card)] border-[var(--border)] animate-slide-up"
                                    style={{ animationDelay: "60ms" }}
                                >
                                    <CardHeader>
                                        <CardTitle className="text-white text-lg">
                                            📦 Hypertrophy & Workload
                                        </CardTitle>
                                        <CardDescription>
                                            Total volume (weight × reps) per session
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
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
                                    </CardContent>
                                </Card>

                                {/* Chart 3: Effort vs Weight (Composed) */}
                                <Card
                                    className="bg-[var(--card)] border-[var(--border)] animate-slide-up"
                                    style={{ animationDelay: "120ms" }}
                                >
                                    <CardHeader>
                                        <CardTitle className="text-white text-lg">
                                            🧠 Effort vs. Weight
                                        </CardTitle>
                                        <CardDescription>
                                            RPE (shaded area) overlaid on weight (line) — getting
                                            stronger means same weight, lower RPE
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
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
                                    </CardContent>
                                </Card>

                                {/* Recent Notes Table */}
                                {notes.length > 0 ? (
                                    <Card
                                        className="bg-[var(--card)] border-[var(--border)] animate-slide-up"
                                        style={{ animationDelay: "180ms" }}
                                    >
                                        <CardHeader>
                                            <CardTitle className="text-white text-lg">
                                                📝 Recent Notes
                                            </CardTitle>
                                            <CardDescription>
                                                Your Thai & English comments from recent sessions
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="border-[var(--border)]">
                                                        <TableHead className="text-[var(--muted-foreground)]">
                                                            Date
                                                        </TableHead>
                                                        <TableHead className="text-[var(--muted-foreground)]">
                                                            Weight
                                                        </TableHead>
                                                        <TableHead className="text-[var(--muted-foreground)]">
                                                            Notes
                                                        </TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {notes.map((n) => (
                                                        <TableRow
                                                            key={n.id}
                                                            className="border-[var(--border)] hover:bg-[var(--accent)]/50"
                                                        >
                                                            <TableCell className="text-sm text-[var(--muted-foreground)] whitespace-nowrap">
                                                                {formatDateTime(n.created_at)}
                                                            </TableCell>
                                                            <TableCell className="text-sm text-white font-medium tabular-nums whitespace-nowrap">
                                                                {n.weight}kg × {n.reps}
                                                                {n.rpe > 0 ? ` @${n.rpe}` : ""}
                                                            </TableCell>
                                                            <TableCell className="text-sm">
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
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                ) : null}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
