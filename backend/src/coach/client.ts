import { GoogleGenAI } from "@google/genai";
import { deepseekChat } from "../llm/deepseek";
import { COACH_MODEL, COACH_TEMPERATURE, DEEPSEEK_COACH_MODEL } from "../constants";

export interface CoachMessage {
  role: "user" | "coach";
  text: string;
}

export interface CoachClient {
  chat(systemPrompt: string, messages: CoachMessage[]): Promise<string>;
}

/**
 * Create a coach chat client backed by Gemini.
 *
 * Provider note: the coach talks to one LLM through this single `chat`
 * function. Swapping to another provider (e.g. DeepSeek) later is a localized
 * change here — the call site in coach.service stays the same.
 */
export function createCoachClient(
  apiKey: string,
  model: string = COACH_MODEL
): CoachClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async chat(systemPrompt: string, messages: CoachMessage[]): Promise<string> {
      const contents = messages.map((m) => ({
        role: m.role === "coach" ? "model" : "user",
        parts: [{ text: m.text }],
      }));

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: COACH_TEMPERATURE,
        },
      });

      return response.text ?? "";
    },
  };
}

/**
 * Coach chat client backed by DeepSeek (thinking mode ON for plan reasoning).
 * Same CoachClient interface — coach.service picks the impl by provider.
 */
export function createDeepSeekCoachClient(
  apiKey: string,
  model: string = DEEPSEEK_COACH_MODEL
): CoachClient {
  return {
    async chat(systemPrompt: string, messages: CoachMessage[]): Promise<string> {
      return deepseekChat({
        apiKey,
        model,
        thinking: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({
            role: (m.role === "coach" ? "assistant" : "user") as "assistant" | "user",
            content: m.text,
          })),
        ],
      });
    },
  };
}
