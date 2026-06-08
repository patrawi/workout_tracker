import { DEEPSEEK_BASE_URL } from "../constants";

export interface DeepSeekToolCall {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
}

export interface DeepSeekMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    tool_calls?: DeepSeekToolCall[];
}

export interface DeepSeekChatOptions {
    apiKey: string;
    model: string;
    messages: DeepSeekMessage[];
    thinking?: boolean;
    temperature?: number;
    tools?: { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }[];
}

export interface DeepSeekAssistantMessage {
    content: string;
    reasoning?: string;
    tool_calls?: DeepSeekToolCall[];
}

async function doChat(options: DeepSeekChatOptions): Promise<DeepSeekAssistantMessage> {
    const { apiKey, model, messages, thinking = false, temperature, tools } = options;

    const body: Record<string, unknown> = {
        model,
        messages,
        thinking: { type: thinking ? "enabled" : "disabled" },
    };
    // Thinking mode doesn't accept sampling params; only send temperature otherwise.
    if (!thinking && temperature !== undefined) {
        body.temperature = temperature;
    }
    if (tools?.length) {
        body.tools = tools;
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
        choices?: { message?: { content?: string; reasoning_content?: string; tool_calls?: DeepSeekToolCall[] } }[];
    };
    const msg = data.choices?.[0]?.message;
    return { content: msg?.content ?? "", reasoning: msg?.reasoning_content, tool_calls: msg?.tool_calls };
}

/**
 * Call DeepSeek's OpenAI-compatible chat completions endpoint via fetch.
 * Thinking mode is toggled with the `thinking` field on V4 models
 * (see https://api-docs.deepseek.com). Returns the final answer text only.
 */
export async function deepseekChat(options: DeepSeekChatOptions): Promise<string> {
    const result = await doChat(options);
    return result.content;
}

/**
 * Raw variant: returns the full assistant message (content + tool_calls)
 * so callers can run an agentic tool-calling loop.
 */
export async function deepseekChatRaw(options: DeepSeekChatOptions): Promise<DeepSeekAssistantMessage> {
    return doChat(options);
}
