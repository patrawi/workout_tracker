/**
 * Strip markdown code fences from an LLM text response and parse it into an
 * array of raw items (a bare object is wrapped into a single-element array).
 * Mirrors the inline cleanup the Gemini parser clients do — shared by the
 * DeepSeek parser clients.
 */
export function extractJsonItems(
    textContent: string,
    label: string,
): Record<string, unknown>[] {
    const cleaned = textContent
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

    try {
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        throw new Error(
            `Failed to parse ${label} LLM response as JSON. Raw response: ${cleaned.slice(0, 500)}`,
        );
    }
}
