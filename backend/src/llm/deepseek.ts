import { DEEPSEEK_BASE_URL } from "../constants";

export interface DeepSeekMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface DeepSeekChatOptions {
    apiKey: string;
    model: string;
    messages: DeepSeekMessage[];
    thinking?: boolean;
    temperature?: number;
}

/**
 * Call DeepSeek's OpenAI-compatible chat completions endpoint via fetch.
 * Thinking mode is toggled with the `thinking` field on V4 models
 * (see https://api-docs.deepseek.com). Returns the final answer text only.
 */
export async function deepseekChat(options: DeepSeekChatOptions): Promise<string> {
    const { apiKey, model, messages, thinking = false, temperature } = options;

    const body: Record<string, unknown> = {
        model,
        messages,
        thinking: { type: thinking ? "enabled" : "disabled" },
    };
    // Thinking mode doesn't accept sampling params; only send temperature otherwise.
    if (!thinking && temperature !== undefined) {
        body.temperature = temperature;
    }

    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`DeepSeek API ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? "";
}
