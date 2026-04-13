import { GoogleGenAI } from "@google/genai";
import type { NutritionItem } from "../types";
import { NUTRITION_SYSTEM_PROMPT } from "./prompts";
import { normalizeNutritionItem } from "./normalizers";
import { GEMINI_MODEL_NUTRITION, GEMINI_TEMPERATURE } from "../constants";

export interface NutritionAIClient {
  parse(rawText: string): Promise<NutritionItem[]>;
}

/**
 * Create a nutrition AI client that parses nutrition text via Gemini.
 */
export function createNutritionAIClient(
  apiKey: string,
  model: string = GEMINI_MODEL_NUTRITION
): NutritionAIClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async parse(rawText: string): Promise<NutritionItem[]> {
      const response = await ai.models.generateContent({
        model,
        contents: rawText,
        config: {
          systemInstruction: NUTRITION_SYSTEM_PROMPT,
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
        const items: Record<string, unknown>[] = Array.isArray(parsed)
          ? parsed
          : [parsed];

        return items.map(normalizeNutritionItem);
      } catch {
        throw new Error(
          `Failed to parse nutrition LLM response as JSON. Raw response: ${cleaned.slice(0, 500)}`
        );
      }
    },
  };
}
