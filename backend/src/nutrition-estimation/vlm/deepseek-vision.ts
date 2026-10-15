// DeepSeek Vision adapter for Nutrition Estimation V1 (ADR 0025) — one
// provider implementation of the neutral `VisionInterpreter` contract
// (design spec §2, ADR 0017; shared logic in ./contract).
//
// DeepSeek API notes (2026-09): images are accepted only in USER messages as
// image_url data-URL parts of the OpenAI-compatible chat format; JSON output is
// requested via response_format { type: "json_object" }.
import { DEEPSEEK_BASE_URL, DEEPSEEK_VISION_MODEL, DEEPSEEK_TEMPERATURE } from "../../constants";
import {
  buildUserMessageText,
  extractJsonObject,
  outcomeFromModelJson,
  VLM_SYSTEM_PROMPT,
  type InterpretInput,
  type InterpretOutcome,
  type VisionInterpreter,
} from "./contract";

export type {
  InterpretInput,
  InterpretOutcome,
  VlmComponent,
  VlmProposal,
} from "./contract";
export type { VisionInterpreter as DeepSeekVisionInterpreter } from "./contract";

function dataUrl(base64: string, mime = "image/jpeg"): string {
  return `data:${mime};base64,${base64}`;
}

export function createDeepSeekVisionInterpreter(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): VisionInterpreter {
  const apiKey = options.apiKey?.trim();
  const doFetch = options.fetchImpl ?? fetch;

  return {
    async interpret(input: InterpretInput): Promise<InterpretOutcome> {
      if (!apiKey) {
        return { status: "unavailable" };
      }

      const hasAfterImage = Boolean(input.afterImageBase64);

      // Images go ONLY in the user message (DeepSeek vision requirement).
      const userContent: Array<Record<string, unknown>> = [
        { type: "text", text: buildUserMessageText(input, hasAfterImage) },
      ];
      if (input.beforeImageBase64) {
        userContent.push({ type: "image_url", image_url: { url: dataUrl(input.beforeImageBase64) } });
      }
      if (input.afterImageBase64) {
        userContent.push({ type: "image_url", image_url: { url: dataUrl(input.afterImageBase64) } });
      }

      let response: Response;
      try {
        response = await doFetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: DEEPSEEK_VISION_MODEL,
            messages: [
              { role: "system", content: VLM_SYSTEM_PROMPT },
              { role: "user", content: userContent },
            ],
            temperature: DEEPSEEK_TEMPERATURE,
            response_format: { type: "json_object" },
          }),
        });
      } catch {
        // Transport failure — the VLM could not be used at all.
        return { status: "unavailable" };
      }

      if (!response.ok) {
        return { status: "unavailable" };
      }

      let payload: { choices?: { message?: { content?: string } }[] };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        return { status: "failed", reason: "unreadable" };
      }
      const content = payload.choices?.[0]?.message?.content ?? "";
      return outcomeFromModelJson(extractJsonObject(content), hasAfterImage);
    },
  };
}
