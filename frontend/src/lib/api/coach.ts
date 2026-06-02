import { api } from "../api-client";
import type {
    CoachMessage,
    CoachPlanGrouped,
    PlanExercise,
    PlanProposal,
    PlanRow,
} from "@/features/coach/coach.types";

export const coachApi = {
    chat: (messages: CoachMessage[]) =>
        api.post<{ reply: string }>("/coach/chat", { messages }),

    getPlan: () => api.get<CoachPlanGrouped>("/coach/plan"),

    proposeNext: (day_type: string) =>
        api.post<PlanProposal>("/coach/plan/next", { day_type }),

    savePlan: (day_type: string, exercises: PlanExercise[]) =>
        api.put<PlanRow[]>("/coach/plan", { day_type, exercises }),
};
