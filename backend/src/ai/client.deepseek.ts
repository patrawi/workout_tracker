import type { WorkoutData } from "../types";
import type { AIClient } from "./client";
import { WORKOUT_SYSTEM_PROMPT } from "./prompts";
import { normalizeWorkoutItem } from "./normalizers";
import { deepseekChat } from "../llm/deepseek";
import { extractJsonItems } from "../llm/extract-json";
import { DEEPSEEK_PARSER_MODEL, DEEPSEEK_TEMPERATURE } from "../constants";

/**
 * Workout text parser backed by DeepSeek. Reuses the Gemini prompt + normalizer;
 * only the LLM call differs. Thinking mode OFF (structured extraction task).
 */
export function createWorkoutAIClientDeepSeek(
    apiKey: string,
    model: string = DEEPSEEK_PARSER_MODEL,
): AIClient {
    return {
        async parse(rawText: string): Promise<WorkoutData[]> {
            const text = await deepseekChat({
                apiKey,
                model,
                messages: [
                    { role: "system", content: WORKOUT_SYSTEM_PROMPT },
                    { role: "user", content: rawText },
                ],
                thinking: false,
                temperature: DEEPSEEK_TEMPERATURE,
            });
            return extractJsonItems(text, "workout").map(normalizeWorkoutItem);
        },
    };
}
