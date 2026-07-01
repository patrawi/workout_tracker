import { describe, expect, mock, test } from "bun:test";
import { buildCoachTools } from "../../../src/coach/tools";

function workout(exercise_name: string, muscle_group: string) {
    return {
        exercise_name,
        muscle_group,
        weight: 50,
        reps: 10,
        rpe: 8,
        is_bodyweight: false,
    };
}

function session(created_at: string, muscle_group: string) {
    return {
        session_id: Number(created_at.replaceAll("-", "")),
        created_at,
        workouts: [workout(`${muscle_group} movement`, muscle_group)],
    };
}

function createDeps() {
    return {
        analyticsService: {
            getVolume: mock(async () => []),
            getVolumeTrend: mock(async () => []),
        },
        nutritionService: {
            getDates: mock(async () => []),
            getByDate: mock(async () => []),
        },
        bodyweightService: {
            getLogs: mock(async () => []),
        },
        profileService: {},
        coachPlanRepo: {
            getAll: mock(async () => []),
            getByDayType: mock(async () => []),
            replaceDayType: mock(async () => []),
        },
        coachKnowledgeRepo: {},
        workoutRepo: {
            getRecentSessionsWithWorkouts: mock(async () => [
                session("2026-07-01", "Legs"),
                session("2026-06-25", "Legs"),
                session("2026-06-18", "Legs"),
                session("2026-06-11", "Legs"),
                session("2026-06-10", "Chest"),
            ]),
            getExerciseSetsWithContext: mock(async () => []),
        },
    };
}

describe("buildCoachTools", () => {
    test("day-type history always returns 3 matching sessions even if the LLM asks for 1", async () => {
        const deps = createDeps();
        const tools = buildCoachTools(deps as any);

        const result = JSON.parse(await tools.run("get_day_type_history", { day_type: "Legs", limit: 1 }));

        expect(result).toHaveLength(3);
        expect(result.map((s: { created_at: string }) => s.created_at)).toEqual([
            "2026-07-01",
            "2026-06-25",
            "2026-06-18",
        ]);
        expect(deps.workoutRepo.getRecentSessionsWithWorkouts).toHaveBeenCalledWith(40);
    });

    test("day-type history schema does not expose limit selection to the LLM", () => {
        const tools = buildCoachTools(createDeps() as any);
        const schema = tools.schemas.find((tool) => tool.function.name === "get_day_type_history");

        expect(schema?.function.parameters).toEqual({
            type: "object",
            properties: {
                day_type: { type: "string", enum: ["Push", "Pull", "Legs"], description: "Day type to look up" },
            },
            required: ["day_type"],
        });
    });
});
