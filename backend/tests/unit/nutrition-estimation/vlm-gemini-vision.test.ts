import { describe, expect, test } from "bun:test";
import {
  createGeminiVisionInterpreter,
} from "../../../src/nutrition-estimation/vlm/gemini-vision";
import { GEMINI_VISION_MODEL } from "../../../src/constants";

type FetchCall = { url: string; init: RequestInit };

function okModelResponse(content: string) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: content }] } }] }),
    { status: 200 },
  );
}

function createMockFetch(content: string | null, options: { status?: number; throw?: boolean; blocked?: boolean } = {}) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (options.throw) throw new Error("network down");
    if (options.status !== undefined && options.status !== 200) {
      return new Response("boom", { status: options.status });
    }
    if (options.blocked) {
      return new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 });
    }
    return okModelResponse(content ?? "");
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const VALID_PROPOSAL = {
  dish_name: "ข้าวมันไก่ผสม",
  dish_name_confidence: "high",
  components: [
    {
      name: "rice",
      kind: "rice",
      weight_g: { low: 190, central: 200, high: 220 },
      component_confidence: "medium",
    },
  ],
};

function requestBody(call: FetchCall) {
  return JSON.parse(String(call.init.body));
}

describe("createGeminiVisionInterpreter — request shape (ADR 0029)", () => {
  test("posts to the generateContent endpoint with the key header, JSON mime type, and inline images", async () => {
    const { calls, fetchImpl } = createMockFetch(JSON.stringify(VALID_PROPOSAL));
    const interpreter = createGeminiVisionInterpreter({ apiKey: "g-test", fetchImpl });

    await interpreter.interpret({
      menuName: "ข้าวมันไก่ผสม",
      beforeImageBase64: "BEFORE_B64",
      afterImageBase64: "AFTER_B64",
      userNote: "ข้าว ~200 g ไม่มันมาก",
    });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`,
    );
    const headers = call.init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("g-test");

    const body = requestBody(call);
    expect(body.systemInstruction.parts[0].text).toContain("meal photo evidence proposer");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    // System instruction is separate; images travel as inlineData user parts.
    expect(body.contents).toHaveLength(1);
    const parts = body.contents[0].parts;
    expect(parts[0].type).toBeUndefined();
    expect(parts[0].text).toContain('Menu name given by the user: "ข้าวมันไก่ผสม".');
    expect(parts[0].text).toContain("authoritative, override visual estimates");
    const inlineImages = parts.filter((p: any) => p.inlineData !== undefined);
    expect(inlineImages).toHaveLength(2);
    expect(inlineImages[0].inlineData).toEqual({ mimeType: "image/jpeg", data: "BEFORE_B64" });
  });

  test("omits the note line and image parts when not provided", async () => {
    const { calls, fetchImpl } = createMockFetch(JSON.stringify(VALID_PROPOSAL));
    const interpreter = createGeminiVisionInterpreter({ apiKey: "g-test", fetchImpl });

    await interpreter.interpret({ menuName: "ข้าวผัด" });

    const body = requestBody(calls[0]!);
    const parts = body.contents[0].parts;
    expect(parts).toHaveLength(1);
    expect(parts[0].text).not.toContain("Human-provided");
    expect(parts[0].text).toContain("Only a before photo is provided");
  });
});

describe("createGeminiVisionInterpreter — outcomes", () => {
  test("parses a valid proposal", async () => {
    const { fetchImpl } = createMockFetch(JSON.stringify(VALID_PROPOSAL));
    const interpreter = createGeminiVisionInterpreter({ apiKey: "g-test", fetchImpl });

    const outcome = await interpreter.interpret({ menuName: "ข้าวมันไก่", beforeImageBase64: "B" });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.proposal.dish_name).toBe("ข้าวมันไก่ผสม");
    expect(outcome.proposal.components[0]!.weight_g.central).toBe(200);
  });

  test("strips macro fields the model emitted despite the ban", async () => {
    const withMacros = { ...VALID_PROPOSAL, components: [{ ...VALID_PROPOSAL.components[0], calories: 620 }] };
    const { fetchImpl } = createMockFetch(JSON.stringify(withMacros));
    const interpreter = createGeminiVisionInterpreter({ apiKey: "g-test", fetchImpl });

    const outcome = await interpreter.interpret({ menuName: "ข้าวมันไก่", beforeImageBase64: "B" });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect("calories" in outcome.proposal.components[0]!).toBe(false);
  });

  test("non-200 and transport failures return unavailable", async () => {
    const failing = createMockFetch(null, { status: 503 });
    const throwing = createMockFetch(null, { throw: true });
    const interpreterA = createGeminiVisionInterpreter({ apiKey: "g-test", fetchImpl: failing.fetchImpl });
    const interpreterB = createGeminiVisionInterpreter({ apiKey: "g-test", fetchImpl: throwing.fetchImpl });

    expect(await interpreterA.interpret({ menuName: "x" })).toEqual({ status: "unavailable" });
    expect(await interpreterB.interpret({ menuName: "x" })).toEqual({ status: "unavailable" });
  });

  test("blocked candidates and non-JSON text return failed/unreadable", async () => {
    const blocked = createMockFetch(null, { blocked: true });
    const garbage = createMockFetch("not json at all");
    const interpreterA = createGeminiVisionInterpreter({ apiKey: "g-test", fetchImpl: blocked.fetchImpl });
    const interpreterB = createGeminiVisionInterpreter({ apiKey: "g-test", fetchImpl: garbage.fetchImpl });

    expect(await interpreterA.interpret({ menuName: "x" })).toEqual({ status: "failed", reason: "unreadable" });
    expect(await interpreterB.interpret({ menuName: "x" })).toEqual({ status: "failed", reason: "unreadable" });
  });

  test("empty apiKey returns unavailable without calling fetch", async () => {
    const { calls, fetchImpl } = createMockFetch(JSON.stringify(VALID_PROPOSAL));
    const interpreter = createGeminiVisionInterpreter({ apiKey: "  ", fetchImpl });

    expect(await interpreter.interpret({ menuName: "x" })).toEqual({ status: "unavailable" });
    expect(calls).toHaveLength(0);
  });
});
