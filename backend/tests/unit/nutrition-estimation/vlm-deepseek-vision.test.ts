import { describe, expect, test } from "bun:test";
import {
  createDeepSeekVisionInterpreter,
  type InterpretOutcome,
} from "../../../src/nutrition-estimation/vlm/deepseek-vision";
import { DEEPSEEK_VISION_MODEL } from "../../../src/constants";

type FetchCall = { url: string; init: RequestInit };

function okModelResponse(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200 },
  );
}

function createMockFetch(content: string | null, options: { status?: number; throw?: boolean } = {}) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (options.throw) throw new Error("network down");
    if (options.status !== undefined && options.status !== 200) {
      return new Response("boom", { status: options.status });
    }
    return okModelResponse(content ?? "");
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const VALID_PROPOSAL = {
  dish_name: "ผัดกะเพราหมูไข่ดาว",
  dish_name_confidence: "high",
  components: [
    {
      name: "rice",
      kind: "rice",
      weight_g: { low: 180, central: 200, high: 220 },
      component_confidence: "medium",
      latent_hints: [{ kind: "dryness", level: "low" }],
    },
    {
      name: "stir fried pork",
      kind: "main",
      weight_g: { low: 120, central: 150, high: 180 },
      consumed_fraction: 0.75,
      component_confidence: "high",
      latent_hints: [{ kind: "visible_oil", level: "medium" }],
    },
  ],
};

describe("createDeepSeekVisionInterpreter — request shape", () => {
  test("uses the vision model, json_object response format, and puts images only in the user message", async () => {
    const { calls, fetchImpl } = createMockFetch(JSON.stringify(VALID_PROPOSAL));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "sk-test", fetchImpl });

    await interpreter.interpret({
      menuName: "ผัดกะเพรา",
      beforeImageBase64: "BEFORE_B64",
      afterImageBase64: "AFTER_B64",
    });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.deepseek.com/chat/completions");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");

    const body = JSON.parse(String(call.init.body));
    expect(body.model).toBe(DEEPSEEK_VISION_MODEL);
    expect(body.response_format).toEqual({ type: "json_object" });

    // Images only in the user message: system content is plain text.
    const [system, user] = body.messages;
    expect(system.role).toBe("system");
    expect(typeof system.content).toBe("string");
    expect(system.content).not.toContain("image_url");
    expect(user.role).toBe("user");
    const imageParts = user.content.filter((p: any) => p.type === "image_url");
    expect(imageParts).toHaveLength(2);
    expect(imageParts[0].image_url.url).toBe("data:image/jpeg;base64,BEFORE_B64");
    expect(imageParts[1].image_url.url).toBe("data:image/jpeg;base64,AFTER_B64");
  });

  test("omits image parts when no images are provided", async () => {
    const { calls, fetchImpl } = createMockFetch(JSON.stringify(VALID_PROPOSAL));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "sk-test", fetchImpl });

    await interpreter.interpret({ menuName: "ข้าวผัด" });

    const body = JSON.parse(String(calls[0]!.init.body));
    const user = body.messages[1];
    expect(user.content.every((p: any) => p.type === "text")).toBe(true);
  });
});

describe("createDeepSeekVisionInterpreter — ok path", () => {
  test("parses the contract into a validated proposal", async () => {
    const { fetchImpl } = createMockFetch(JSON.stringify(VALID_PROPOSAL));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "sk-test", fetchImpl });

    const outcome = await interpreter.interpret({
      menuName: "ผัดกะเพราหมู",
      afterImageBase64: "AFTER",
    });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.proposal.dish_name).toBe("ผัดกะเพราหมูไข่ดาว");
    expect(outcome.proposal.dish_name_confidence).toBe("high");
    expect(outcome.proposal.components).toHaveLength(2);
    expect(outcome.proposal.components[0]!.weight_g).toEqual({ low: 180, central: 200, high: 220 });
    expect(outcome.proposal.components[1]!.consumed_fraction).toBe(0.75);
    expect(outcome.proposal.components[1]!.latent_hints).toEqual([
      { kind: "visible_oil", level: "medium" },
    ]);
  });

  test("strips consumed_fraction when no after image was provided", async () => {
    const { fetchImpl } = createMockFetch(JSON.stringify(VALID_PROPOSAL));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "sk-test", fetchImpl });

    const outcome = await interpreter.interpret({ menuName: "ผัดกะเพราหมู" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    for (const component of outcome.proposal.components) {
      expect(component.consumed_fraction).toBeUndefined();
    }
  });

  test("tolerates markdown-fenced JSON", async () => {
    const { fetchImpl } = createMockFetch("```json\n" + JSON.stringify(VALID_PROPOSAL) + "\n```");
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "sk-test", fetchImpl });
    const outcome: InterpretOutcome = await interpreter.interpret({ menuName: "x" });
    expect(outcome.status).toBe("ok");
  });
});

describe("createDeepSeekVisionInterpreter — anti-anchoring guards (ADR 0017)", () => {
  test("drops low-confidence components and blanks a low-confidence dish name", async () => {
    const model = {
      dish_name: "probably some curry",
      dish_name_confidence: "low",
      components: [
        { name: "rice", kind: "rice", weight_g: { low: 100, central: 150, high: 200 }, component_confidence: "low" },
        { name: "curry", kind: "main", weight_g: { low: 100, central: 150, high: 200 }, component_confidence: "high" },
      ],
    };
    const { fetchImpl } = createMockFetch(JSON.stringify(model));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "sk-test", fetchImpl });

    const outcome = await interpreter.interpret({ menuName: "x" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.proposal.dish_name).toBe(""); // hidden, user fills manually
    expect(outcome.proposal.components.map((c) => c.name)).toEqual(["curry"]);
  });

  test("strips macronutrient-like fields the model emitted", async () => {
    const model = {
      dish_name: "fried rice",
      dish_name_confidence: "high",
      protein: 30,
      calories: 800,
      nutrition: { protein: 30, fat: 10 },
      components: [
        {
          name: "rice",
          kind: "rice",
          weight_g: { low: 100, central: 150, high: 200 },
          protein: 12,
          carbs: 40,
          fat: 5,
          calories: 250,
          per100: { protein: 8, carbs: 28, fat: 3, calories: 180 },
          component_confidence: "high",
        },
      ],
    };
    const { fetchImpl } = createMockFetch(JSON.stringify(model));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "sk-test", fetchImpl });

    const outcome = await interpreter.interpret({ menuName: "x" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    const raw = outcome.proposal as unknown as Record<string, unknown>;
    expect(raw["protein"]).toBeUndefined();
    expect(raw["calories"]).toBeUndefined();
    expect(raw["nutrition"]).toBeUndefined();
    const component = outcome.proposal.components[0] as unknown as Record<string, unknown>;
    expect(component["protein"]).toBeUndefined();
    expect(component["carbs"]).toBeUndefined();
    expect(component["fat"]).toBeUndefined();
    expect(component["calories"]).toBeUndefined();
    expect(component["per100"]).toBeUndefined();
    expect(component["weight_g"]).toEqual({ low: 100, central: 150, high: 200 });
  });

  test("drops components with invalid weight ranges; drops invalid fraction fields only", async () => {
    const model = {
      dish_name: "dish",
      dish_name_confidence: "high",
      components: [
        { name: "inverted", kind: "rice", weight_g: { low: 300, central: 150, high: 200 }, component_confidence: "high" },
        { name: "negative", kind: "main", weight_g: { low: -5, central: 100, high: 200 }, component_confidence: "high" },
        { name: "zero_low", kind: "main", weight_g: { low: 0, central: 100, high: 200 }, component_confidence: "high" },
        { name: "unknown_kind", kind: "mystery", weight_g: { low: 10, central: 20, high: 30 }, component_confidence: "high" },
        { name: "bad_fraction", kind: "side", weight_g: { low: 10, central: 20, high: 30 }, consumed_fraction: 1.5, component_confidence: "high" },
        { name: "good", kind: "broth", weight_g: { low: 10, central: 20, high: 30 }, component_confidence: "medium" },
      ],
    };
    const { fetchImpl } = createMockFetch(JSON.stringify(model));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "sk-test", fetchImpl });

    const outcome = await interpreter.interpret({ menuName: "x", afterImageBase64: "A" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    // Invalid weight ranges / kinds drop the whole component; an invalid
    // consumed_fraction only drops the fraction field (weight stays valid).
    expect(outcome.proposal.components.map((c) => c.name)).toEqual(["bad_fraction", "good"]);
    expect(outcome.proposal.components[0]!.consumed_fraction).toBeUndefined();
    expect(outcome.proposal.components[1]!.consumed_fraction).toBeUndefined();
  });

  test("drops low-confidence and malformed latent hints", async () => {
    const model = {
      dish_name: "dish",
      dish_name_confidence: "high",
      components: [
        {
          name: "main",
          kind: "main",
          weight_g: { low: 10, central: 20, high: 30 },
          component_confidence: "high",
          latent_hints: [
            { kind: "visible_oil", level: "high" },
            { kind: "dryness", level: "medium", confidence: "low" },
            { kind: "made_up_kind", level: "high" },
            { kind: "remaining_broth", level: "extreme" },
          ],
        },
      ],
    };
    const { fetchImpl } = createMockFetch(JSON.stringify(model));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "sk-test", fetchImpl });

    const outcome = await interpreter.interpret({ menuName: "x" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.proposal.components[0]!.latent_hints).toEqual([
      { kind: "visible_oil", level: "high" },
    ]);
  });
});

describe("createDeepSeekVisionInterpreter — per-field confidence (spec §2)", () => {
  const model = {
    dish_name: "dish",
    dish_name_confidence: "high",
    components: [
      // Low-confidence weight → the whole component is dropped (weight is
      // required evidence; a hidden weight would anchor the user).
      {
        name: "unweighed",
        kind: "rice",
        weight_g: { low: 100, central: 150, high: 200 },
        weight_confidence: "low",
        component_confidence: "high",
      },
      // Low-confidence consumed_fraction → only the fraction is dropped.
      {
        name: "half_eaten",
        kind: "main",
        weight_g: { low: 100, central: 150, high: 200 },
        weight_confidence: "medium",
        consumed_fraction: 0.5,
        consumed_fraction_confidence: "low",
        component_confidence: "high",
      },
      // Medium/high per-field confidence survives intact.
      {
        name: "good",
        kind: "side",
        weight_g: { low: 10, central: 20, high: 30 },
        weight_confidence: "medium",
        consumed_fraction: 0.25,
        consumed_fraction_confidence: "high",
        component_confidence: "high",
      },
    ],
  };

  test("prompt contract asks for weight_confidence and consumed_fraction_confidence", async () => {
    const { calls, fetchImpl } = createMockFetch(JSON.stringify(VALID_PROPOSAL));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "k", fetchImpl });
    await interpreter.interpret({ menuName: "x", afterImageBase64: "A" });
    const body = JSON.parse(String(calls[0]!.init.body));
    const system = body.messages[0].content as string;
    expect(system).toContain("weight_confidence");
    expect(system).toContain("consumed_fraction_confidence");
  });

  test("drops a component whose weight is low-confidence, keeps medium/high", async () => {
    const { fetchImpl } = createMockFetch(JSON.stringify(model));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "k", fetchImpl });

    const outcome = await interpreter.interpret({ menuName: "x", afterImageBase64: "A" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.proposal.components.map((c) => c.name)).toEqual(["half_eaten", "good"]);
    expect(outcome.proposal.components[1]!.weight_confidence).toBe("medium");
  });

  test("drops only the consumed_fraction when its confidence is low", async () => {
    const { fetchImpl } = createMockFetch(JSON.stringify(model));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "k", fetchImpl });

    const outcome = await interpreter.interpret({ menuName: "x", afterImageBase64: "A" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    const [halfEaten, good] = outcome.proposal.components;
    expect(halfEaten!.consumed_fraction).toBeUndefined();
    expect(halfEaten!.consumed_fraction_confidence).toBeUndefined();
    expect(good!.consumed_fraction).toBe(0.25);
    expect(good!.consumed_fraction_confidence).toBe("high");
  });

  test("components without explicit per-field confidence still parse", async () => {
    const { fetchImpl } = createMockFetch(JSON.stringify(VALID_PROPOSAL));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "k", fetchImpl });

    const outcome = await interpreter.interpret({ menuName: "x", afterImageBase64: "A" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.proposal.components).toHaveLength(2);
    expect(outcome.proposal.components[0]!.weight_confidence).toBeUndefined();
    expect(outcome.proposal.components[1]!.consumed_fraction).toBe(0.75);
  });
});

describe("createDeepSeekVisionInterpreter — failure states", () => {
  test("maps model-signalled no_food and unreadable", async () => {
    const noFood = createMockFetch(JSON.stringify({ status: "no_food" }));
    const interpreterNoFood = createDeepSeekVisionInterpreter({ apiKey: "k", fetchImpl: noFood.fetchImpl });
    expect(await interpreterNoFood.interpret({ menuName: "x" })).toEqual({
      status: "failed",
      reason: "no_food",
    });

    const unreadable = createMockFetch(JSON.stringify({ status: "unreadable" }));
    const interpreterUnreadable = createDeepSeekVisionInterpreter({ apiKey: "k", fetchImpl: unreadable.fetchImpl });
    expect(await interpreterUnreadable.interpret({ menuName: "x" })).toEqual({
      status: "failed",
      reason: "unreadable",
    });
  });

  test("maps malformed JSON to unreadable", async () => {
    const { fetchImpl } = createMockFetch("this is not json {");
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "k", fetchImpl });
    expect(await interpreter.interpret({ menuName: "x" })).toEqual({
      status: "failed",
      reason: "unreadable",
    });
  });

  test("maps a structurally invalid proposal to unreadable", async () => {
    const { fetchImpl } = createMockFetch(JSON.stringify({ foo: "bar" }));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "k", fetchImpl });
    expect(await interpreter.interpret({ menuName: "x" })).toEqual({
      status: "failed",
      reason: "unreadable",
    });
  });

  test("unavailable when no API key is configured (fetch never called)", async () => {
    const { calls, fetchImpl } = createMockFetch(JSON.stringify(VALID_PROPOSAL));
    const interpreter = createDeepSeekVisionInterpreter({ apiKey: "", fetchImpl });
    const outcome = await interpreter.interpret({ menuName: "x", beforeImageBase64: "B" });
    expect(outcome).toEqual({ status: "unavailable" });
    expect(calls).toHaveLength(0);
  });

  test("unavailable on HTTP error or transport failure (logging never blocked)", async () => {
    const httpError = createMockFetch("", { status: 503 });
    const interpreterHttp = createDeepSeekVisionInterpreter({ apiKey: "k", fetchImpl: httpError.fetchImpl });
    expect(await interpreterHttp.interpret({ menuName: "x" })).toEqual({ status: "unavailable" });

    const transport = createMockFetch("", { throw: true });
    const interpreterTransport = createDeepSeekVisionInterpreter({ apiKey: "k", fetchImpl: transport.fetchImpl });
    expect(await interpreterTransport.interpret({ menuName: "x" })).toEqual({ status: "unavailable" });
  });
});
