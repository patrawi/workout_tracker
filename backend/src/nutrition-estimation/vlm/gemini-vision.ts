// Gemini Vision adapter for Nutrition Estimation V1 (ADR 0029) — a second
// provider implementation of the neutral `VisionInterpreter` contract
// (ADR 0025; shared logic in ./contract). Selected via VLM_PROVIDER=gemini.
//
// Gemini API notes (2026-10): images travel as inlineData parts of the user
// content; JSON output is requested via generationConfig.responseMimeType.
// Called over REST with an injected fetch so tests mirror the DeepSeek
// adapter's mock pattern exactly.
import { GEMINI_BASE_URL, GEMINI_TEMPERATURE, GEMINI_VISION_MODEL } from "../../constants";
import {
  buildUserMessageText,
  extractJsonObject,
  outcomeFromModelJson,
  VLM_SYSTEM_PROMPT,
  type InterpretInput,
  type InterpretOutcome,
  type VisionInterpreter,
} from "./contract";

export type { InterpretInput, InterpretOutcome, VlmComponent, VlmProposal } from "./contract";

export function createGeminiVisionInterpreter(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): VisionInterpreter {
  const apiKey = options.apiKey?.trim();
  const model = options.model?.trim() || GEMINI_VISION_MODEL;
  const doFetch = options.fetchImpl ?? fetch;

  return {
    async interpret(input: InterpretInput): Promise<InterpretOutcome> {
      if (!apiKey) {
        return { status: "unavailable" };
      }

      const hasAfterImage = Boolean(input.afterImageBase64);

      const parts: Array<Record<string, unknown>> = [
        { text: buildUserMessageText(input, hasAfterImage) },
      ];
      if (input.beforeImageBase64) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: input.beforeImageBase64 } });
      }
      if (input.afterImageBase64) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: input.afterImageBase64 } });
      }

      let response: Response;
      try {
        response = await doFetch(
          `${GEMINI_BASE_URL}/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: VLM_SYSTEM_PROMPT }] },
              contents: [{ role: "user", parts }],
              generationConfig: {
                temperature: GEMINI_TEMPERATURE,
                responseMimeType: "application/json",
              },
            }),
          },
        );
      } catch {
        // Transport failure — the VLM could not be used at all.
        return { status: "unavailable" };
      }

      if (!response.ok) {
        return { status: "unavailable" };
      }

      let payload: {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        return { status: "failed", reason: "unreadable" };
      }
      const text = (payload.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
      return outcomeFromModelJson(extractJsonObject(text), hasAfterImage);
    },
  };
}
