import { GoogleGenAI } from "@google/genai";
import { deepseekChatRaw, type DeepSeekMessage } from "../llm/deepseek";
import { COACH_MODEL, COACH_TEMPERATURE, DEEPSEEK_COACH_MODEL } from "../constants";

const MAX_TOOL_ITERS = 5;

export interface CoachMessage {
  role: "user" | "coach";
  text: string;
}

export interface CoachReply {
  text: string;
  reasoning?: string;
}

export interface CoachClient {
  chat(systemPrompt: string, messages: CoachMessage[]): Promise<CoachReply>;
}

export interface CoachTools {
  schemas: {
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }[];
  run: (name: string, args: Record<string, unknown>) => Promise<string>;
}

/**
 * Create a coach chat client backed by Gemini.
 */
export function createCoachClient(
  apiKey: string,
  model: string = COACH_MODEL
): CoachClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async chat(systemPrompt: string, messages: CoachMessage[]): Promise<CoachReply> {
      const contents = messages.map((m) => ({
        role: m.role === "coach" ? "model" : "user",
        parts: [{ text: m.text }],
      }));

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: COACH_TEMPERATURE,
        },
      });

      return { text: response.text ?? "" };
    },
  };
}

/**
 * Coach chat client backed by DeepSeek (thinking mode ON for plan reasoning).
 * If `tools` is provided, runs an agentic loop: call the LLM, execute any
 * tool_calls, feed results back, repeat (max 5 iterations). Otherwise behaves
 * as the plain text-only client.
 */
export function createDeepSeekCoachClient(
  apiKey: string,
  model: string = DEEPSEEK_COACH_MODEL,
  tools?: CoachTools
): CoachClient {
  return {
    async chat(systemPrompt: string, messages: CoachMessage[]): Promise<CoachReply> {
      const history: DeepSeekMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: (m.role === "coach" ? "assistant" : "user") as "assistant" | "user",
          content: m.text,
        })),
      ];

      if (!tools) {
        const r = await deepseekChatRaw({ apiKey, model, thinking: true, messages: history });
        return { text: r.content, reasoning: r.reasoning };
      }

      // Accumulate reasoning from each iteration (pre-tool thinking + final).
      const reasonings: string[] = [];
      for (let i = 0; i < MAX_TOOL_ITERS; i++) {
        const result = await deepseekChatRaw({
          apiKey,
          model,
          thinking: true,
          messages: history,
          tools: tools.schemas,
        });
        if (result.reasoning) reasonings.push(result.reasoning);

        if (!result.tool_calls?.length) {
          return { text: result.content, reasoning: reasonings.join("\n\n---\n\n") || undefined };
        }

        // Append the assistant message (content may be empty when tool_calls present)
        history.push({
          role: "assistant",
          content: result.content ?? "",
          tool_calls: result.tool_calls,
        });

        // Execute each tool call and append tool results
        for (const tc of result.tool_calls) {
          let toolResult: string;
          try {
            const args = JSON.parse(tc.function.arguments);
            toolResult = await tools.run(tc.function.name, args);
          } catch (err) {
            toolResult = JSON.stringify({ error: String(err) });
          }
          history.push({
            role: "tool",
            content: toolResult,
            tool_call_id: tc.id,
          });
        }
      }

      // Max iterations reached without a final text reply — ask for one
      history.push({ role: "user", content: "Please answer the user's original question based on the tool results above." });
      const final = await deepseekChatRaw({ apiKey, model, thinking: true, messages: history });
      if (final.reasoning) reasonings.push(final.reasoning);
      return { text: final.content, reasoning: reasonings.join("\n\n---\n\n") || undefined };
    },
  };
}
