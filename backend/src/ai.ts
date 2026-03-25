import { GoogleGenAI } from "@google/genai";
import type { WorkoutData } from "./types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are a data extraction bot. Parse the user's workout string (mixed Thai/English) into a JSON array. Each set of an exercise is its own object.

Rules:
- Map abbreviations: 'rdl' -> 'Romanian Deadlift', 'bp' -> 'Bench Press', 'sq' -> 'Squat', 'goblet' -> 'Dumbbell Goblet Squat', 'ohp' -> 'Overhead Press', 'dl' -> 'Deadlift', 'dip' -> 'Dip', 'pullup' or 'pull up' -> 'Pull-Up', 'pushup' or 'push up' -> 'Push-Up', 'chinup' or 'chin up' -> 'Chin-Up'.
- "is_bodyweight" should ONLY be true for exercises where your body IS the primary resistance: pull-ups, dips, push-ups, chin-ups, bodyweight squats (no equipment), etc. For these exercises where the user does NOT specify an external weight, set "is_bodyweight": true, "is_assisted": false and "weight": 0. If the user specifies added weight (e.g., "dip +20kg"), set "is_bodyweight": false, "is_assisted": false and use the added weight.
- For equipment-based exercises (dumbbell goblet squat, bench press, deadlift, etc.), NEVER set "is_bodyweight": true — even if the user does a warm-up set without weight. Instead set "is_bodyweight": false and "weight": 0 for those warm-up sets.
- For ASSISTED MACHINE exercises (assisted pull-up machine, assisted dip machine, etc.) the weight logged is the COUNTERWEIGHT (assistance). Set "is_assisted": true and "weight" to the assistance amount. The higher the weight, the easier the exercise because the machine is helping more.
- Recognize angles like 'แบบ 30' as variant_details.
- Keep introspective thoughts (e.g., 'มันไปทางแสบซะมากกว่า', 'เล่นท่านี้ แล้วตัวไหลออก') in notes_thai. Translate notes_thai to English in notes_english.
- If no notes exist for a set, use empty string "" for notes_thai and notes_english.
- Use null for missing variant_details.
- Categorize the exercise into one of these strict values for "muscle_group": "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Cardio", or "Other".

Output ONLY a valid JSON array with no markdown, no code fences:
[{ "exercise_name": string, "weight": number, "reps": number, "rpe": number, "is_bodyweight": boolean, "is_assisted": boolean, "variant_details": string | null, "notes_thai": string, "notes_english": string, "tags": string[], "muscle_group": string }, ...]`;

function normalizeItem(item: Record<string, unknown>): WorkoutData {
    return {
        exercise_name: String(item.exercise_name || "Unknown Exercise"),
        weight: Number(item.weight) || 0,
        reps: Number(item.reps) || 0,
        rpe: Number(item.rpe) || 0,
        is_bodyweight: Boolean(item.is_bodyweight),
        is_assisted: Boolean(item.is_assisted),
        variant_details: item.variant_details ? String(item.variant_details) : "",
        notes_thai: item.notes_thai ? String(item.notes_thai) : "",
        notes_english: item.notes_english ? String(item.notes_english) : "",
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        muscle_group: item.muscle_group ? String(item.muscle_group) : "Other",
    };
}

/**
 * Send raw workout text to Google Gemini via @google/genai SDK
 * and parse the response into structured data.
 * Always returns an array of WorkoutData (one per set).
 */
export async function parseWorkoutText(rawText: string): Promise<WorkoutData[]> {
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

        // Handle both single object and array responses
        const items: Record<string, unknown>[] = Array.isArray(parsed)
            ? parsed
            : [parsed];

        return items.map(normalizeItem);
    } catch {
        throw new Error(
            `Failed to parse LLM response as JSON. Raw response: ${cleaned.slice(0, 500)}`
        );
    }
}
