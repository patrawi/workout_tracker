import type { NutritionItem, RawLLMItem } from "../types";
import type { NutritionAIClient } from "./client";
import { NUTRITION_SYSTEM_PROMPT } from "./prompts";
import { normalizeNutritionItem } from "./normalizers";
import { deepseekChat } from "../llm/deepseek";
import { extractJsonItems } from "../llm/extract-json";
import { DEEPSEEK_PARSER_MODEL, DEEPSEEK_TEMPERATURE } from "../constants";

/**
 * Nutrition text parser backed by DeepSeek. Reuses the Gemini prompt + normalizer
 * (all macro math stays deterministic in normalizeNutritionItem). Thinking OFF.
 */
export function createNutritionAIClientDeepSeek(
    apiKey: string,
    model: string = DEEPSEEK_PARSER_MODEL,
): NutritionAIClient {
    return {
        async parse(rawText: string): Promise<NutritionItem[]> {
            const text = await deepseekChat({
                apiKey,
                model,
                messages: [
                    { role: "system", content: NUTRITION_SYSTEM_PROMPT },
                    { role: "user", content: rawText },
                ],
                thinking: false,
                temperature: DEEPSEEK_TEMPERATURE,
            });
            return (extractJsonItems(text, "nutrition") as RawLLMItem[]).map(normalizeNutritionItem);
        },
    };
}
