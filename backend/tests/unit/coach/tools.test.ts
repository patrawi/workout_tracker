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
        session_type: "working",
        gym_profile: "GymA",
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
            getAll: mock(async () => [
                {
                    id: 1,
                    day_type: "Push",
                    position: 1,
                    exercise_name: "Bench Press",
                    is_bodyweight: false,
                    target_weight: 100,
                    sets: 3,
                    rep_low: 8,
                    rep_high: 10,
                    rpe_low: 8,
                    rpe_high: 9,
                    exercise_role: "compound",
                    progression_ladder: "double_12",
                    notes: "",
                    updated_at: "2026-07-01",
                },
                {
                    id: 2,
                    day_type: "Pull",
                    position: 1,
                    exercise_name: "Pull Up / Assisted Pull Up",
                    is_bodyweight: true,
                    target_weight: null,
                    sets: 3,
                    rep_low: 8,
                    rep_high: 9,
                    rpe_low: 8,
                    rpe_high: 9,
                    exercise_role: "compound",
                    progression_ladder: "double_12",
                    notes: "",
                    updated_at: "2026-07-01",
                },
            ]),
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
            getSessionWithWorkouts: mock(async (sessionId: number) => ({
                ...session("2026-07-01", "Legs"),
                session_id: sessionId,
            })),
            getSessionsBefore: mock(async () => [
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
                day_type: { type: "string", enum: ["Push", "Pull", "Legs"], description: "Day type to look up for normal planning" },
                session_id: { type: "number", description: "Reviewed workout session id for session-anchored feedback" },
            },
        });
    });

    test("session-anchored day-type history excludes the reviewed session", async () => {
        const deps = createDeps();
        const tools = buildCoachTools(deps as any);

        const result = JSON.parse(await tools.run("get_day_type_history", { session_id: 20260701 }));

        expect(result.mode).toBe("session_anchored");
        expect(result.reviewed_session.session_id).toBe(20260701);
        expect(result.day_type).toBe("Legs");
        expect(result.previous_sessions.map((s: { session_id: number }) => s.session_id)).toEqual([
            20260625,
            20260618,
            20260611,
        ]);
        expect(deps.workoutRepo.getSessionsBefore).toHaveBeenCalledWith(20260701, 80);
    });

    test("overload assessment passes as_of_session_id through to the repository", async () => {
        const deps = createDeps();
        const tools = buildCoachTools(deps as any);

        await tools.run("get_overload_assessment", { exercise_name: "Bench Press", as_of_session_id: 123 });

        expect(deps.workoutRepo.getExerciseSetsWithContext).toHaveBeenCalledWith(["Bench Press"], 12, 123);
    });

    test("overload assessment resolves slash-separated plan aliases to logged exercise names", async () => {
        const deps = createDeps();
        const tools = buildCoachTools(deps as any);

        const result = JSON.parse(await tools.run("get_overload_assessment", { exercise_name: "Pull Up", as_of_session_id: 96 }));

        expect(result.plan_exercise_name).toBe("Pull Up / Assisted Pull Up");
        expect(result.history_exercise_names).toEqual(["Pull Up / Assisted Pull Up", "Pull Up", "Assisted Pull Up"]);
        expect(deps.workoutRepo.getExerciseSetsWithContext).toHaveBeenCalledWith(
            ["Pull Up / Assisted Pull Up", "Pull Up", "Assisted Pull Up"],
            12,
            96,
        );
    });

    test("exposes propose_plan instead of save_plan", () => {
        const tools = buildCoachTools(createDeps() as any);
        const names = tools.schemas.map((tool) => tool.function.name);

        expect(names).toContain("propose_plan");
        expect(names).toContain("propose_session_prescription");
        expect(names).not.toContain("save_plan");
    });

    test("propose_plan returns a proposal without replacing saved plan rows", async () => {
        const deps = createDeps();
        const tools = buildCoachTools(deps as any);

        const result = JSON.parse(await tools.run("propose_plan", {
            day_type: "Push",
            exercises: [
                {
                    position: 1,
                    exercise_name: "Bench Press",
                    is_bodyweight: false,
                    target_weight: 100,
                    sets: 3,
                    rep_low: 8,
                    rep_high: 10,
                    rpe_low: 8,
                    rpe_high: 9,
                    exercise_role: "compound",
                    progression_ladder: "double_12",
                    notes: "Hold",
                },
            ],
        }));

        expect(result.saved).toBe(false);
        expect(result.proposal.day_type).toBe("Push");
        expect(result.proposal.exercises[0].exercise_name).toBe("Bench Press");
        expect(deps.coachPlanRepo.replaceDayType).not.toHaveBeenCalled();
        expect(tools.drainPlanProposals()).toEqual([result.proposal]);
    });

    test("propose_session_prescription returns a one-off Upper Flex without replacing saved plans", async () => {
        const deps = createDeps();
        const tools = buildCoachTools(deps as any);

        const result = JSON.parse(await tools.run("propose_session_prescription", {
            kind: "upper_flex",
            title: "Upper Flex Today",
            exercises: [
                {
                    source_day_type: "Push",
                    position: 1,
                    exercise_name: "Bench Press",
                    is_bodyweight: false,
                    target_weight: 100,
                    sets: 3,
                    rep_low: 8,
                    rep_high: 10,
                    rpe_low: 8,
                    rpe_high: 9,
                    exercise_role: "compound",
                    progression_ladder: "double_12",
                    notes: "Source Push",
                },
            ],
        }));

        expect(result.saved).toBe(false);
        expect(result.prescription.kind).toBe("upper_flex");
        expect(result.prescription.exercises[0].source_day_type).toBe("Push");
        expect(deps.coachPlanRepo.replaceDayType).not.toHaveBeenCalled();
        expect(tools.drainSessionPrescriptions()).toEqual([result.prescription]);
    });
});
