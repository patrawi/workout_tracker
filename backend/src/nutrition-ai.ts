import { GoogleGenAI } from "@google/genai";
import type { NutritionItem, MealType } from "./types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are a nutrition data extraction bot. Parse the user's food log (mixed Thai/English) into a JSON array. Each food item is its own object.

Rules:
- Group items by meal: "BREAKFAST", "LUNCH", "DINNER", "SNACK". Map Thai terms: "มื้อเช้า" → Breakfast, "มื้อกลางวัน"/"มื้อเที่ยง" → Lunch, "มื้อเย็น" → Dinner, "ของว่าง"/"ขนม" → Snack.
- If meal labels are not specified, infer from context or default to "Snack".
- Parse food names in both Thai and English. Keep the original name if recognizable, capitalize properly.
- **Serving-size scaling**: When users write "50g cereal, for 40g" or "50g of X (label per 40g)", compute scale_factor = actual_amount / label_amount (e.g., 50/40 = 1.25) and multiply all macros by this factor.
- Handle various macro formats: "0.9g of fat", "FAT: 0.2g", "ไขมัน 21 กรัม", "protein 26g", "โปรตีน 30g".
- Handle "<0.5g" → treat as 0.25g for that macro.
- Compute calories as: (protein × 4) + (carbs × 4) + (fat × 9)
- If the user provides explicit macros (from a nutrition label), parse exactly what's given after scaling.
- If the user does NOT provide macros for an item (e.g., "2 eggs", "chicken breast 200g"), try to estimate reasonable macros from common food knowledge. Set "has_missing_macros": true for these items so the user can verify during review.
- If the user provides partial macros (e.g., only protein), estimate the missing ones and set "has_missing_macros": true.
- Round all numbers to 1 decimal place.

Output ONLY a valid JSON array with no markdown, no code fences:
[{ "food_name": string, "meal": "Breakfast" | "Lunch" | "Dinner" | "Snack", "protein": number, "carbs": number, "fat": number, "calories": number, "has_missing_macros": boolean }, ...]`;

function normalizeItem(item: Record<string, unknown>): NutritionItem {
    return {
        food_name: String(item.food_name || "Unknown Food"),
        meal: normalizeMeal(String(item.meal || "Snack")),
        protein: roundTo1(Number(item.protein) || 0),
        carbs: roundTo1(Number(item.carbs) || 0),
        fat: roundTo1(Number(item.fat) || 0),
        calories: roundTo1(Number(item.calories) || 0),
        has_missing_macros: Boolean(item.has_missing_macros),
    };
}

function normalizeMeal(meal: string): MealType {
    const lower = meal.toLowerCase().trim();
    if (lower.includes("breakfast") || lower.includes("มื้อเช้า")) return "Breakfast";
    if (lower.includes("lunch") || lower.includes("มื้อกลางวัน") || lower.includes("มื้อเที่ยง")) return "Lunch";
    if (lower.includes("dinner") || lower.includes("มื้อเย็น")) return "Dinner";
    if (lower.includes("snack") || lower.includes("ของว่าง") || lower.includes("ขนม")) return "Snack";
    return "Snack";
}

function roundTo1(n: number): number {
    return Math.round(n * 10) / 10;
}

/**
 * Send raw food log text to Gemini and parse into structured nutrition items.
 */
export async function parseNutritionText(rawText: string): Promise<NutritionItem[]> {
    if (!GEMINI_API_KEY) {
        throw new Error(
            "GEMINI_API_KEY is not set. Please add it to your .env file."
        );
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: rawText,
        config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.1,
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

        return items.map(normalizeItem);
    } catch {
        throw new Error(
            `Failed to parse nutrition LLM response as JSON. Raw response: ${cleaned.slice(0, 500)}`
        );
    }
}
