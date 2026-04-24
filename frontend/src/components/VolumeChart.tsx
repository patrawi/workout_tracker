import { useQuery } from "@tanstack/react-query";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { analyticsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

function CustomTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: Array<{ value: number }>;
    label?: string;
}) {
    if (!active || !payload?.length) return null;

    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-xl">
            <p className="text-xs font-medium text-[var(--muted-foreground)] mb-1">
                {label} Volume
            </p>
            <p className="text-sm font-semibold text-[var(--chart-1)]">
                Sets: {payload[0].value}
            </p>
            {payload[0].value >= 10 && payload[0].value <= 20 ? (
                <p className="text-xs text-green-500 mt-1">Optimal Growth Range 📈</p>
            ) : payload[0].value > 20 ? (
                <p className="text-xs text-yellow-500 mt-1">Junk Volume / Overreaching 🚧</p>
            ) : (
                <p className="text-xs text-blue-400 mt-1">Maintenance / Deload 📉</p>
            )}
        </div>
    );
}

export function VolumeChart() {
    const days = "7";

    const { data = [], isLoading } = useQuery({
        queryKey: queryKeys.analytics.volume(days),
        queryFn: async () => {
            const res = await analyticsApi.getVolume(days);
            if (res.success && res.data) return res.data;
            return [];
        },
    });

    return (
        <Card className="glass-card mb-6">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                        💪 Muscle Group Volume
                    </CardTitle>
                    <CardDescription>
                        Working sets per muscle group in the last 7 days. Optimal hypertrophy is typically 10-20 sets per week.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
                    </div>
                ) : data.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-[var(--muted-foreground)]">
                        No workout data found for this period.
                    </div>
                ) : (
                    <div className="h-[300px] mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={data}
                                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                layout="horizontal"
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="var(--border)"
                                    opacity={0.4}
                                />
                                <XAxis
                                    dataKey="muscle_group"
                                    stroke="var(--muted-foreground)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    dy={10}
                                />
                                <YAxis
                                    stroke="var(--muted-foreground)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    dx={-10}
                                />
                                <Tooltip
                                    content={<CustomTooltip />}
                                    cursor={{ fill: "var(--border)", opacity: 0.2 }}
                                />
                                <ReferenceLine y={10} stroke="#22c55e" strokeDasharray="3 3" opacity={0.5} label={{ value: "Min", fill: "#22c55e", position: "insideBottomLeft", fontSize: 10 }} />
                                <ReferenceLine y={20} stroke="#eab308" strokeDasharray="3 3" opacity={0.5} label={{ value: "Max", fill: "#eab308", position: "insideTopLeft", fontSize: 10 }} />
                                <Bar
                                    dataKey="sets"
                                    fill="var(--chart-1)"
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={50}
                                    animationDuration={1000}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
