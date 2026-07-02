import type { CoachServiceDeps } from "../services/coach.service";
import { isValidDateString } from "../lib/date";
import { classifySession } from "./classify";
import { assessExercise } from "./overload";
import type { CoachPlanInput } from "../repositories/coach-plan.repository";

const MAX_DAYS = 31;
const MAX_LIMIT = 20;
const DAY_TYPE_HISTORY_LIMIT = 3;
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

function parseSessionId(raw: unknown): number | null {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    const clean = Math.trunc(n);
    return clean > 0 ? clean : null;
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

function normalizeExerciseName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function exerciseAliases(name: string): string[] {
    const pieces = name
        .split("/")
        .map((piece) => piece.trim())
        .filter(Boolean);
    const aliases = [name.trim(), ...pieces];
    return [...new Map(aliases.map((alias) => [normalizeExerciseName(alias), alias])).values()];
}

function namesMatch(savedName: string, requestedName: string): boolean {
    const requested = normalizeExerciseName(requestedName);
    return exerciseAliases(savedName).some((alias) => normalizeExerciseName(alias) === requested);
}

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

function formatWorkoutSession(s: {
    session_id: number;
    created_at: string | null;
    session_type?: string;
    gym_profile?: string;
    workouts: {
        exercise_name: string;
        muscle_group: string;
        weight: number;
        is_bodyweight: boolean;
        reps: number;
        rpe: number;
    }[];
}) {
    return {
        session_id: s.session_id,
        created_at: s.created_at,
        session_type: s.session_type,
        gym_profile: s.gym_profile,
        exercises: s.workouts.map((w) => ({
            exercise_name: w.exercise_name,
            muscle_group: w.muscle_group,
            weight: w.is_bodyweight ? null : w.weight,
            is_bodyweight: w.is_bodyweight,
            reps: w.reps,
            rpe: w.rpe,
        })),
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
                description: "Get the N most recent workout sessions with exercise-level sets, including session_id for exact follow-up.",
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
                description: "Get the number of SETS logged per muscle group for the last N days. This is a set COUNT, NOT volume load. For a volume-load trend (weight × reps, spec §4.2) use get_volume_trend instead.",
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
                name: "get_volume_trend",
                description: "Volume-load trend per muscle group (spec §4.2: Volume Load = weight × reps × sets). Compares two adjacent equal windows — current [last N days] vs previous [N to 2N days ago] — and returns current/previous volume load, set counts, and the delta %, all computed deterministically. Use this for any 'volume load trend' question; never subtract windows yourself (spec §6.2). Note: bodyweight sets with weight 0 contribute 0 to volume load — read set counts for those.",
                parameters: {
                    type: "object",
                    properties: { daysBack: { type: "number", description: "Length of each window in days (max " + MAX_DAYS + "). Default 14." } },
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
                description: "Get workout history for a Push/Pull/Legs day. For normal planning, pass day_type. For post-save feedback, pass session_id: the tool classifies that reviewed session and returns previous matching sessions BEFORE it, excluding the reviewed session.",
                parameters: {
                    type: "object",
                    properties: {
                        day_type: { type: "string", enum: ["Push", "Pull", "Legs"], description: "Day type to look up for normal planning" },
                        session_id: { type: "number", description: "Reviewed workout session id for session-anchored feedback" },
                    },
                },
            },
        },
        {
            type: "function",
            function: {
                name: "get_overload_assessment",
                description: "Deterministic progressive-overload assessment for ONE exercise (spec §4). Computes data sufficiency, gym-profile continuity, the go-signal (top of rep range across all working sets), rep-target promotion, and capped increment recommendation. For post-save feedback, pass as_of_session_id so later sessions are ignored. Use this BEFORE proposing a weight change — never compute the math yourself. Returns hold/promote_reps/increase/add_weight_optional plus any pain-flagged set comments for you to hand back (§5.2). The exercise must exist in the saved plan (provides the rep range).",
                parameters: {
                    type: "object",
                    properties: {
                        exercise_name: { type: "string", description: "Exact exercise name as saved in the plan" },
                        as_of_session_id: { type: "number", description: "Optional reviewed session id; assessment includes history up to and including this session only" },
                    },
                    required: ["exercise_name"],
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
                        session_id: s.session_id,
                        created_at: s.created_at,
                        session_type: s.session_type,
                        gym_profile: s.gym_profile,
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
            case "get_volume_trend": {
                const daysBack = parseDays(args.daysBack, 14);
                const trend = await deps.analyticsService.getVolumeTrend(daysBack);
                return JSON.stringify(trend);
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
                const sessionId = parseSessionId(args.session_id);
                if (sessionId !== null) {
                    const reviewed = await deps.workoutRepo.getSessionWithWorkouts(sessionId);
                    if (!reviewed) return JSON.stringify({ error: `session_id ${sessionId} not found` });

                    const day = classifySession(reviewed.workouts.map((w) => w.muscle_group));
                    const previous = await deps.workoutRepo.getSessionsBefore(sessionId, 80);
                    const matching = previous
                        .filter((s) => classifySession(s.workouts.map((w) => w.muscle_group)) === day)
                        .slice(0, DAY_TYPE_HISTORY_LIMIT);

                    return JSON.stringify({
                        mode: "session_anchored",
                        session_id: sessionId,
                        day_type: day,
                        reviewed_session: formatWorkoutSession(reviewed),
                        previous_sessions: matching.map(formatWorkoutSession),
                    });
                }

                const day = parseDayType(args.day_type);
                if (!day) return JSON.stringify({ error: "day_type must be Push, Pull, or Legs, or pass session_id" });
                const sessions = await deps.workoutRepo.getRecentSessionsWithWorkouts(40);
                const matching = sessions
                    .filter((s) => classifySession(s.workouts.map((w) => w.muscle_group)) === day)
                    .slice(0, DAY_TYPE_HISTORY_LIMIT);
                return JSON.stringify(
                    matching.map(formatWorkoutSession),
                );
            }
            case "get_overload_assessment": {
                const exercise = str(args.exercise_name).trim();
                if (!exercise) return JSON.stringify({ error: "exercise_name is required" });
                const asOfSessionId = parseSessionId(args.as_of_session_id);

                // Plan target supplies the rep range that defines "top of range" (§4.3).
                const plan = await deps.coachPlanRepo.getAll();
                const target = plan.find((p) => namesMatch(p.exercise_name, exercise));
                if (!target) {
                    return JSON.stringify({ error: `"${exercise}" is not in the saved plan — cannot assess without a rep range.` });
                }

                const historyExerciseNames = exerciseAliases(target.exercise_name);
                const history = await deps.workoutRepo.getExerciseSetsWithContext(
                    historyExerciseNames,
                    12,
                    asOfSessionId ?? undefined,
                );
                const isDumbbell = exercise.toLowerCase().includes("dumbbell");
                const assessment = assessExercise(
                    history.map((s) => ({
                        session_id: s.session_id,
                        date: s.created_at,
                        session_type: s.session_type,
                        gym_profile: s.gym_profile,
                        sets: s.sets.map((set) => ({ weight: set.weight, reps: set.reps, rpe: set.rpe, pain: set.pain })),
                    })),
                    { rep_low: target.rep_low, rep_high: target.rep_high, sets: target.sets, rpe_high: target.rpe_high, is_bodyweight: target.is_bodyweight },
                    { isDumbbell },
                );

                // Surface pain-flagged set comments so the LLM can hand back (§5.2) —
                // it reads the free text; this tool never classifies severity.
                const painComments = history
                    .flatMap((s) => s.sets.filter((set) => set.pain).map((set) => ({
                        date: s.created_at,
                        notes_thai: set.notes_thai,
                        notes_english: set.notes_english,
                    })));

                return JSON.stringify({
                    exercise_name: exercise,
                    plan_exercise_name: target.exercise_name,
                    history_exercise_names: historyExerciseNames,
                    as_of_session_id: asOfSessionId,
                    ...assessment,
                    painComments,
                });
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
