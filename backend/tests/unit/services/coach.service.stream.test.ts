// Characterization tests for the agentic streaming tool loop in
// coach.service.chatStream — the DeepSeek stream module is mocked so each
// test scripts the rounds (deltas + result) and inspects the history the
// service feeds into the next round.
import { describe, test, expect, mock } from "bun:test";

type FakeToolCall = {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
};

type FakeRound = {
    deltas?: Array<{ type: "reasoning" | "content"; text: string }>;
    result: { content: string; tool_calls?: FakeToolCall[] };
};

const rounds: FakeRound[] = [];
const historyCalls: Array<Array<{ role: string; content?: string; tool_calls?: unknown; tool_call_id?: string }>> = [];

// Keep every real export (coach/client.ts needs deepseekChatRaw etc.) and
// override only the generator the service streams through.
const actualDeepseek = await import("../../../src/llm/deepseek");
mock.module("../../../src/llm/deepseek", () => ({
    ...actualDeepseek,
    deepseekChatStream: async function* (opts: {
        messages: Array<{ role: string; content?: string; tool_calls?: unknown; tool_call_id?: string }>;
    }) {
        historyCalls.push(opts.messages);
        const script = rounds.shift();
        if (!script) throw new Error("No fake round scripted");
        for (const d of script.deltas ?? []) yield d;
        return script.result;
    },
}));

const { createCoachService } = await import("../../../src/services/coach.service");

// Minimal config stub — the stream path only reads deepseekApiKey.
const testConfig = {
    llmProvider: "deepseek",
    deepseekApiKey: "test-key",
    geminiApiKey: "",
} as unknown as Parameters<typeof createCoachService>[0];

function makeService() {
    const deps = {
        analyticsService: { getVolume: async () => [] },
        nutritionService: { getDates: async () => [], getByDate: async () => [] },
        bodyweightService: { getLogs: async () => [] },
        profileService: {
            get: async () => ({
                protein_target: 160,
                carbs_target: 200,
                fat_target: 70,
                calories_intake: 2100,
                tdee: 2100,
                weight_kg: 70,
            }),
        },
        coachPlanRepo: { getAll: async () => [] },
        coachKnowledgeRepo: { list: async () => [] },
        workoutRepo: {},
    } as unknown as Parameters<typeof createCoachService>[1];
    return createCoachService(testConfig, deps);
}

const PROPOSE_PLAN_ARGS = JSON.stringify({
    day_type: "Push",
    exercises: [
        {
            exercise_name: "Bench Press",
            sets: 3,
            rep_low: 8,
            rep_high: 12,
            target_weight: 60,
            rpe_low: 7,
            rpe_high: 8,
            exercise_role: "compound",
            progression_ladder: "double_12",
            position: 1,
            is_bodyweight: false,
            notes: "",
        },
    ],
});

async function collect(
    gen: AsyncGenerator<{ type: string; text?: string; proposal?: unknown; prescription?: unknown }>,
) {
    const events: Array<{ type: string; text?: string; proposal?: unknown; prescription?: unknown }> = [];
    for await (const evt of gen) events.push(evt);
    return events;
}

describe("coach chatStream — agentic tool loop", () => {
    test("streams reasoning and content deltas, then ends", async () => {
        rounds.length = 0;
        historyCalls.length = 0;
        rounds.push({
            deltas: [
                { type: "reasoning", text: "think" },
                { type: "content", text: "Hello" },
            ],
            result: { content: "Hello" },
        });
        const service = makeService();

        const events = await collect(service.chatStream([{ role: "user", text: "hi" }], 1));

        expect(events.map((e) => `${e.type}:${e.text ?? ""}`)).toEqual(["reasoning:think", "content:Hello"]);
    });

    test("runs a tool round, emits the plan proposal, then streams the final answer", async () => {
        rounds.length = 0;
        historyCalls.length = 0;
        rounds.push({
            deltas: [{ type: "content", text: "Sure" }],
            result: {
                content: "Sure",
                tool_calls: [{ id: "t1", type: "function", function: { name: "propose_plan", arguments: PROPOSE_PLAN_ARGS } }],
            },
        });
        rounds.push({ deltas: [{ type: "content", text: "here you go" }], result: { content: "here you go" } });
        const service = makeService();

        const events = await collect(service.chatStream([{ role: "user", text: "plan please" }], 1));

        const proposal = events.find((e) => e.type === "plan_proposal") as
            | { proposal: { day_type: string; exercises: Array<{ exercise_name: string }> } }
            | undefined;
        expect(proposal?.proposal.day_type).toBe("Push");
        expect(proposal?.proposal.exercises[0]!.exercise_name).toBe("Bench Press");
        expect(events.at(-1)).toMatchObject({ type: "content", text: "here you go" });
        // Round 2's history carries the assistant tool_calls turn + the tool result.
        const round2 = historyCalls[1]!;
        expect(round2.at(-2)?.role).toBe("assistant");
        expect(round2.at(-1)?.role).toBe("tool");
        expect(round2.at(-1)?.tool_call_id).toBe("t1");
    });

    test("a failing tool becomes an error tool result and the loop continues", async () => {
        rounds.length = 0;
        historyCalls.length = 0;
        rounds.push({
            result: {
                content: "",
                tool_calls: [{ id: "t2", type: "function", function: { name: "no_such_tool", arguments: "{}" } }],
            },
        });
        rounds.push({ deltas: [{ type: "content", text: "recovered" }], result: { content: "recovered" } });
        const service = makeService();

        const events = await collect(service.chatStream([{ role: "user", text: "x" }], 1));

        expect(events.at(-1)).toMatchObject({ type: "content", text: "recovered" });
        const round2 = historyCalls[1]!;
        expect(round2.at(-1)?.role).toBe("tool");
        expect(String(round2.at(-1)?.content)).toContain("error");
    });
});
