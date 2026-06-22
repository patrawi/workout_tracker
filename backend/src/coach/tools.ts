import type { CoachServiceDeps } from "../services/coach.service";
import { isValidDateString } from "../lib/date";
import { classifySession } from "./classify";
import type { CoachPlanInput } from "../repositories/coach-plan.repository";

const MAX_DAYS = 31;
const MAX_LIMIT = 20;
const PLAN_DAY_TYPES = ["Push", "Pull", "Legs"] as const;

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

function parseDayType(raw: unknown): "Push" | "Pull" | "Legs" | null {
    return (PLAN_DAY_TYPES as readonly string[]).includes(raw as string)
        ? (raw as "Push" | "Pull" | "Legs")
        : null;
}

const num = (v: unknown, fallback = 0): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");

// Coerce one LLM-supplied exercise into a storable plan row.
function coercePlanRow(raw: Record<string, unknown>, index: number): CoachPlanInput {
    const is_bodyweight = raw.is_bodyweight === true;
    return {
        position: num(raw.position, index + 1),
        exercise_name: str(raw.exercise_name) || `Exercise ${index + 1}`,
        is_bodyweight,
        target_weight: is_bodyweight ? null : raw.target_weight == null ? null : num(raw.target_weight),
        sets: num(raw.sets, 3),
        rep_low: num(raw.rep_low),
        rep_high: num(raw.rep_high),
        rpe_low: num(raw.rpe_low),
        rpe_high: num(raw.rpe_high),
        notes: str(raw.notes),
    };
}

const planExerciseSchema = {
    type: "object",
    properties: {
        position: { type: "number" },
        exercise_name: { type: "string" },
        is_bodyweight: { type: "boolean" },
        target_weight: { type: ["number", "null"] },
        sets: { type: "number" },
        rep_low: { type: "number" },
        rep_high: { type: "number" },
        rpe_low: { type: "number" },
        rpe_high: { type: "number" },
        notes: { type: "string" },
    },
    required: ["position", "exercise_name", "is_bodyweight", "sets", "rep_low", "rep_high", "rpe_low", "rpe_high"],
};

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
        {
            type: "function",
            function: {
                name: "get_plan",
                description: "Get the user's current saved training plan. Omit day_type for all days, or pass one (Push/Pull/Legs) to get just that day.",
                parameters: {
                    type: "object",
                    properties: { day_type: { type: "string", enum: ["Push", "Pull", "Legs"], description: "Optional day type filter" } },
                },
            },
        },
        {
            type: "function",
            function: {
                name: "get_day_type_history",
                description: "Get the N most recent logged sessions that classify as a given day type (Push/Pull/Legs), with per-exercise sets and muscle group. Use this to analyze past performance before proposing the next session of that day.",
                parameters: {
                    type: "object",
                    properties: {
                        day_type: { type: "string", enum: ["Push", "Pull", "Legs"], description: "Day type to look up" },
                        limit: { type: "number", description: "Number of matching sessions (default 3, max " + MAX_LIMIT + ")" },
                    },
                    required: ["day_type"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "save_plan",
                description: "Save (replace) the plan for one day type. Call this ONLY after the user has explicitly confirmed they want to save. Replaces the whole day's plan with the given exercises.",
                parameters: {
                    type: "object",
                    properties: {
                        day_type: { type: "string", enum: ["Push", "Pull", "Legs"] },
                        exercises: { type: "array", items: planExerciseSchema },
                    },
                    required: ["day_type", "exercises"],
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
            case "get_plan": {
                const day = parseDayType(args.day_type);
                const rows = day
                    ? await deps.coachPlanRepo.getByDayType(day)
                    : await deps.coachPlanRepo.getAll();
                return JSON.stringify(
                    rows.map((r) => ({
                        day_type: r.day_type,
                        position: r.position,
                        exercise_name: r.exercise_name,
                        is_bodyweight: r.is_bodyweight,
                        target_weight: r.target_weight,
                        sets: r.sets,
                        rep_low: r.rep_low,
                        rep_high: r.rep_high,
                        rpe_low: r.rpe_low,
                        rpe_high: r.rpe_high,
                        notes: r.notes,
                        updated_at: r.updated_at,
                    })),
                );
            }
            case "get_day_type_history": {
                const day = parseDayType(args.day_type);
                if (!day) return JSON.stringify({ error: "day_type must be Push, Pull, or Legs" });
                const limit = parseLimit(args.limit, 3);
                const sessions = await deps.workoutRepo.getRecentSessionsWithWorkouts(40);
                const matching = sessions
                    .filter((s) => classifySession(s.workouts.map((w) => w.muscle_group)) === day)
                    .slice(0, limit);
                return JSON.stringify(
                    matching.map((s) => ({
                        created_at: s.created_at,
                        exercises: s.workouts.map((w) => ({
                            exercise_name: w.exercise_name,
                            muscle_group: w.muscle_group,
                            weight: w.is_bodyweight ? null : w.weight,
                            is_bodyweight: w.is_bodyweight,
                            reps: w.reps,
                            rpe: w.rpe,
                        })),
                    })),
                );
            }
            case "save_plan": {
                const day = parseDayType(args.day_type);
                if (!day) return JSON.stringify({ error: "day_type must be Push, Pull, or Legs" });
                if (!Array.isArray(args.exercises)) return JSON.stringify({ error: "exercises must be an array" });
                const rows = (args.exercises as Record<string, unknown>[]).map(coercePlanRow);
                const saved = await deps.coachPlanRepo.replaceDayType(day, rows);
                return JSON.stringify({ ok: true, day_type: day, saved_count: saved.length });
            }
            default:
                return JSON.stringify({ error: `Unknown tool: ${name}` });
        }
    };

    return { schemas, run };
}
