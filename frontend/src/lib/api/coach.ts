import { api } from "../api-client";
import type {
    CoachMessage,
    CoachPlanGrouped,
    CoachKnowledgeRow,
    CoachStreamEvent,
    PlanExercise,
} from "@/features/coach/coach.types";

export const coachApi = {
    chat: (messages: CoachMessage[]) =>
        api.post<{ reply: string; reasoning?: string; proposal?: { day_type: string; exercises: PlanExercise[] } }>("/coach/chat", { messages }),

    getPlan: () => api.get<CoachPlanGrouped>("/coach/plan"),

    savePlan: (dayType: string, exercises: PlanExercise[]) =>
        api.put("/coach/plan", { day_type: dayType, exercises }),

    listKnowledge: () =>
        api.get<CoachKnowledgeRow[]>("/coach/knowledge"),

    addKnowledge: (title: string, body: string) =>
        api.post<CoachKnowledgeRow>("/coach/knowledge", { title, body }),

    updateKnowledge: (id: number, data: { title?: string; body?: string }) =>
        api.put<CoachKnowledgeRow>(`/coach/knowledge/${id}`, data),

    deleteKnowledge: (id: number) =>
        api.del(`/coach/knowledge/${id}`),

    reorderKnowledge: (ids: number[]) =>
        api.put("/coach/knowledge/reorder", { ids }),

    chatStream: async (
        messages: CoachMessage[],
        onEvent: (evt: CoachStreamEvent) => void,
    ): Promise<void> => {
        const res = await fetch("/api/coach/chat/stream", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages }),
        });
        if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);

        const reader = res.body.getReader();
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
                const evt = JSON.parse(line.slice(5).trim());
                if (evt.error) throw new Error(evt.error);
                if (evt.done) return;
                if (evt.type === "plan_proposal" && evt.proposal) {
                    onEvent({ type: "plan_proposal", proposal: evt.proposal });
                } else if (evt.type && evt.text) {
                    onEvent({ type: evt.type, text: evt.text });
                }
            }
        }
    },
};
