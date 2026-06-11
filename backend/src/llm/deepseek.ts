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

/** A streamed delta: either reasoning (thinking) text or final answer text. */
export interface StreamDelta {
    type: "reasoning" | "content";
    text: string;
}

/**
 * Streaming chat via DeepSeek's OpenAI-compatible endpoint.
 * Yields tagged deltas (reasoning_content + content) as they arrive; no tools.
 */
export async function* deepseekChatStream(
    options: Omit<DeepSeekChatOptions, "tools">,
): AsyncGenerator<StreamDelta> {
    const { apiKey, model, messages, thinking = false, temperature } = options;

    const body: Record<string, unknown> = {
        model,
        messages,
        stream: true,
        thinking: { type: thinking ? "enabled" : "disabled" },
    };
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

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") return;
            const json = JSON.parse(payload);
            const d = json.choices?.[0]?.delta;
            if (d?.reasoning_content) yield { type: "reasoning", text: d.reasoning_content };
            if (d?.content) yield { type: "content", text: d.content };
        }
    }
}
