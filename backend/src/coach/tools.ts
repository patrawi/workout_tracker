import type { CoachServiceDeps } from "../services/coach.service";
import { isValidDateString } from "../lib/date";

const MAX_DAYS = 31;
const MAX_LIMIT = 20;

type ToolSchemas = {
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
}[];

type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<string>;

function parseDays(raw: unknown, fallback: number): number {
    const n = typeof raw === "number" ? raw : Number(raw);
    const clean = Number.isFinite(n) ? Math.round(n) : fallback;
    return Math.max(1, Math.min(clean, MAX_DAYS));
}

function parseLimit(raw: unknown, fallback: number): number {
    const n = typeof raw === "number" ? raw : Number(raw);
    const clean = Number.isFinite(n) ? Math.round(n) : fallback;
    return Math.max(1, Math.min(clean, MAX_LIMIT));
}

function parseDate(raw: unknown): string | null {
    if (typeof raw !== "string" || !isValidDateString(raw)) return null;
    return raw;
}

export function buildCoachTools(deps: CoachServiceDeps): { schemas: ToolSchemas; run: ToolRunner } {
    const schemas: ToolSchemas = [
        {
            type: "function",
            function: {
                name: "get_daily_nutrition",
                description: "Get per-day nutrition totals (calories, protein, carbs, fat) for the last N days. Use this to answer questions about daily deficit, intake trends, or per-day breakdowns.",
                parameters: {
                    type: "object",
                    properties: { days: { type: "number", description: "Number of days back (max " + MAX_DAYS + ")" } },
                    required: ["days"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "get_nutrition_by_date",
                description: "Get all meal rows for a specific date.",
                parameters: {
                    type: "object",
                    properties: { date: { type: "string", description: "Date in YYYY-MM-DD format" } },
                    required: ["date"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "get_workout_sessions",
                description: "Get the N most recent workout sessions with exercise-level sets.",
                parameters: {
                    type: "object",
                    properties: { limit: { type: "number", description: "Number of sessions (max " + MAX_LIMIT + ")" } },
                    required: ["limit"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "get_bodyweight_logs",
                description: "Get bodyweight logs for the last N days.",
                parameters: {
                    type: "object",
                    properties: { daysBack: { type: "number", description: "Number of days back (max " + MAX_DAYS + ")" } },
                    required: ["daysBack"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "get_volume",
                description: "Get training volume by muscle group for the last N days.",
                parameters: {
                    type: "object",
                    properties: { daysBack: { type: "number", description: "Number of days back (max " + MAX_DAYS + ")" } },
                    required: ["daysBack"],
                },
            },
        },
    ];

    const run: ToolRunner = async (name, args) => {
        switch (name) {
            case "get_daily_nutrition": {
                const days = parseDays(args.days, 7);
                const dates = (await deps.nutritionService.getDates()).slice(0, days);
                const rows = await Promise.all(
                    dates.map(async (date) => {
                        const meals = await deps.nutritionService.getByDate(date);
                        const totals = meals.reduce(
                            (a, r) => ({
                                calories: a.calories + r.calories,
                                protein: a.protein + r.protein,
                                carbs: a.carbs + r.carbs,
                                fat: a.fat + r.fat,
                            }),
                            { calories: 0, protein: 0, carbs: 0, fat: 0 },
                        );
                        return { date, ...totals };
                    }),
                );
                return JSON.stringify(rows);
            }
            case "get_nutrition_by_date": {
                const date = parseDate(args.date);
                if (!date) return JSON.stringify({ error: "Invalid date, use YYYY-MM-DD" });
                const meals = await deps.nutritionService.getByDate(date);
                return JSON.stringify(
                    meals.map((m) => ({
                        food_name: m.food_name,
                        meal: m.meal,
                        protein: m.protein,
                        carbs: m.carbs,
                        fat: m.fat,
                        calories: m.calories,
                    })),
                );
            }
            case "get_workout_sessions": {
                const limit = parseLimit(args.limit, 5);
                const sessions = await deps.workoutRepo.getRecentSessionsWithWorkouts(limit);
                return JSON.stringify(
                    sessions.map((s) => ({
                        created_at: s.created_at,
                        workouts: s.workouts.map((w) => ({
                            exercise_name: w.exercise_name,
                            weight: w.is_bodyweight ? null : w.weight,
                            is_bodyweight: w.is_bodyweight,
                            reps: w.reps,
                            rpe: w.rpe,
                            muscle_group: w.muscle_group,
                        })),
                    })),
                );
            }
            case "get_bodyweight_logs": {
                const daysBack = parseDays(args.daysBack, 14);
                const logs = await deps.bodyweightService.getLogs(daysBack);
                return JSON.stringify(logs.map((l) => ({ date: l.date, weight_kg: l.weight_kg })));
            }
            case "get_volume": {
                const daysBack = parseDays(args.daysBack, 7);
                const volume = await deps.analyticsService.getVolume(daysBack);
                return JSON.stringify(volume);
            }
            default:
                return JSON.stringify({ error: `Unknown tool: ${name}` });
        }
    };

    return { schemas, run };
}
