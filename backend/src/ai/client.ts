import { GoogleGenAI } from "@google/genai";
import type { WorkoutData } from "../types";
import { WORKOUT_SYSTEM_PROMPT } from "./prompts";
import { normalizeWorkoutItem } from "./normalizers";
import { GEMINI_MODEL_WORKOUT, GEMINI_TEMPERATURE } from "../constants";

export interface AIClient {
  parse(rawText: string): Promise<WorkoutData[]>;
}

/**
 * Create a workout AI client that parses workout text via Gemini.
 */
export function createWorkoutAIClient(
  apiKey: string,
  model: string = GEMINI_MODEL_WORKOUT
): AIClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async parse(rawText: string): Promise<WorkoutData[]> {
      const response = await ai.models.generateContent({
        model,
        contents: rawText,
        config: {
          systemInstruction: WORKOUT_SYSTEM_PROMPT,
          temperature: GEMINI_TEMPERATURE,
        },
      });

      const textContent = response.text ?? "";

      // Clean potential markdown code fences
      const cleaned = textContent
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned);

        // Handle both single object and array responses
        const items: Record<string, unknown>[] = Array.isArray(parsed)
          ? parsed
          : [parsed];

        return items.map(normalizeWorkoutItem);
      } catch {
        throw new Error(
          `Failed to parse LLM response as JSON. Raw response: ${cleaned.slice(0, 500)}`
        );
      }
    },
  };
}
