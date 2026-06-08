import { api } from "../api-client";
import type {
    CoachMessage,
    CoachPlanGrouped,
    PlanExercise,
    PlanProposal,
    PlanRow,
    CoachKnowledgeRow,
} from "@/features/coach/coach.types";

export const coachApi = {
    chat: (messages: CoachMessage[]) =>
        api.post<{ reply: string; reasoning?: string }>("/coach/chat", { messages }),

    getPlan: () => api.get<CoachPlanGrouped>("/coach/plan"),

    proposeNext: (day_type: string) =>
        api.post<PlanProposal>("/coach/plan/next", { day_type }),

    savePlan: (day_type: string, exercises: PlanExercise[]) =>
        api.put<PlanRow[]>("/coach/plan", { day_type, exercises }),

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
};
