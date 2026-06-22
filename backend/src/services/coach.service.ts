// src/services/coach.service.ts

import type { ConfigService } from "./config.service";
import type { AnalyticsService } from "./analytics.service";
import type { NutritionService } from "./nutrition.service";
import type { BodyweightService } from "./bodyweight.service";
import type { ProfileService } from "./profile.service";
import { createCoachClient, createDeepSeekCoachClient, type CoachClient, type CoachMessage } from "../coach/client";
import { buildCoachSystemPrompt } from "../coach/prompts";
import { buildCoachTools } from "../coach/tools";
import { deepseekChatStream, type StreamDelta, type DeepSeekMessage } from "../llm/deepseek";
import { ExternalServiceError, ValidationError } from "../lib/errors";
import { createChildLogger } from "../lib/logger";
import { getLocalDateString } from "../lib/date";
import type { createCoachPlanRepository, CoachPlanRow, CoachPlanInput } from "../repositories/coach-plan.repository";
import type { createCoachKnowledgeRepository, CoachKnowledgeRow } from "../repositories/coach-knowledge.repository";
import type { createWorkoutRepository } from "../repositories/workout.repository";
import { COACH_CONTEXT_DAYS, COACH_NUTRITION_DAYS, DEEPSEEK_COACH_MODEL } from "../constants";

const logger = createChildLogger("coach-service");

const MAX_TOOL_ITERS = 5;

export const PLAN_DAY_TYPES = ["Push", "Pull", "Legs"] as const;
export type PlanDayType = (typeof PLAN_DAY_TYPES)[number];

export type CoachPlanGrouped = Record<PlanDayType, CoachPlanRow[]>;

export interface CoachService {
  chat(messages: CoachMessage[]): Promise<{ reply: string; reasoning?: string }>;
  chatStream(messages: CoachMessage[]): AsyncGenerator<StreamDelta>;
  getPlan(): Promise<CoachPlanGrouped>;
  savePlan(dayType: string, exercises: CoachPlanInput[]): Promise<CoachPlanRow[]>;
  listKnowledge(): Promise<CoachKnowledgeRow[]>;
  addKnowledge(title: string, body: string): Promise<CoachKnowledgeRow>;
  updateKnowledge(id: number, data: { title?: string; body?: string }): Promise<CoachKnowledgeRow | null>;
  deleteKnowledge(id: number): Promise<void>;
  reorderKnowledge(ids: number[]): Promise<void>;
}

export interface CoachServiceDeps {
  analyticsService: AnalyticsService;
  nutritionService: NutritionService;
  bodyweightService: BodyweightService;
  profileService: ProfileService;
  coachPlanRepo: ReturnType<typeof createCoachPlanRepository>;
  coachKnowledgeRepo: ReturnType<typeof createCoachKnowledgeRepository>;
  workoutRepo: ReturnType<typeof createWorkoutRepository>;
}

const round = (n: number) => Math.round(n);

/**
 * Assemble a compact, bounded grounding summary from the user's recent logs.
 * Reuses existing services — no new queries. Summarizes, never dumps rows.
 */
async function buildContext(deps: CoachServiceDeps): Promise<string> {
  const { analyticsService, nutritionService, bodyweightService, profileService } = deps;

  const [profile, volume, bodyweightLogs, nutritionDates] = await Promise.all([
    profileService.get(),
    analyticsService.getVolume(COACH_CONTEXT_DAYS),
    bodyweightService.getLogs(COACH_CONTEXT_DAYS),
    nutritionService.getDates(),
  ]);

  // Targets
  const targets =
    `Targets: protein ${profile.protein_target}g, carbs ${profile.carbs_target}g, ` +
    `fat ${profile.fat_target}g, calories ${profile.calories_intake} (TDEE ${profile.tdee}), ` +
    `bodyweight ${profile.weight_kg}kg.`;

  // Training volume by muscle (last COACH_CONTEXT_DAYS)
  const volumeLine = volume.length
    ? "Volume by muscle (last " +
      COACH_CONTEXT_DAYS +
      "d): " +
      volume
        .sort((a, b) => b.sets - a.sets)
        .map((v) => `${v.muscle_group} ${v.sets} sets`)
        .join(", ") +
      "."
    : `No training logged in the last ${COACH_CONTEXT_DAYS} days.`;

  // Nutrition averages over the most recent days with logs
  const recentDates = nutritionDates.slice(0, COACH_NUTRITION_DAYS);
  let nutritionLine = "No nutrition logged recently.";
  if (recentDates.length) {
    const days = await Promise.all(recentDates.map((d) => nutritionService.getByDate(d)));
    const totals = days.map((rows) =>
      rows.reduce(
        (acc, r) => ({
          protein: acc.protein + r.protein,
          carbs: acc.carbs + r.carbs,
          fat: acc.fat + r.fat,
          calories: acc.calories + r.calories,
        }),
        { protein: 0, carbs: 0, fat: 0, calories: 0 }
      )
    );
    const n = totals.length;
    const avg = totals.reduce(
      (a, t) => ({
        protein: a.protein + t.protein / n,
        carbs: a.carbs + t.carbs / n,
        fat: a.fat + t.fat / n,
        calories: a.calories + t.calories / n,
      }),
      { protein: 0, carbs: 0, fat: 0, calories: 0 }
    );
    nutritionLine =
      `Nutrition avg (last ${n} logged day${n > 1 ? "s" : ""}): ` +
      `protein ${round(avg.protein)}g, carbs ${round(avg.carbs)}g, ` +
      `fat ${round(avg.fat)}g, calories ${round(avg.calories)}.`;
  }

  // Bodyweight trend
  let bodyweightLine = "No bodyweight logged recently.";
  const sorted = [...bodyweightLogs].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first && last) {
    const delta = last.weight_kg - first.weight_kg;
    const sign = delta > 0 ? "+" : "";
    bodyweightLine =
      `Bodyweight: ${last.weight_kg}kg now` +
      (sorted.length > 1
        ? ` (${sign}${delta.toFixed(1)}kg over ${sorted.length} logs since ${first.date}).`
        : ".");
  }

  return [targets, volumeLine, nutritionLine, bodyweightLine].join("\n");
}

async function loadCoachKnowledgeFromDB(
  repo: ReturnType<typeof createCoachKnowledgeRepository>,
): Promise<string> {
  const sections = await repo.list();
  return sections.map((s) => `# ${s.title}\n\n${s.body}`).join("\n\n");
}

// ── Plan helpers ────────────────────────────────────────────────────────────

function assertDayType(dayType: string): PlanDayType {
  if (!(PLAN_DAY_TYPES as readonly string[]).includes(dayType)) {
    throw new ValidationError(`day_type must be one of ${PLAN_DAY_TYPES.join(", ")}`);
  }
  return dayType as PlanDayType;
}

/**
 * Create the AI coach service. Mirrors ai.service's apiKey guard.
 */
export function createCoachService(
  config: ConfigService,
  deps: CoachServiceDeps
): CoachService {
  // Pick the coach LLM by provider; fall back to Gemini if DeepSeek isn't configured.
  let client: CoachClient | null = null;
  if (config.llmProvider === "deepseek" && config.deepseekApiKey) {
    client = createDeepSeekCoachClient(config.deepseekApiKey, DEEPSEEK_COACH_MODEL, buildCoachTools(deps));
  } else if (config.geminiApiKey) {
    client = createCoachClient(config.geminiApiKey);
  } else {
    logger.warn("No LLM API key set (GEMINI_API_KEY / DEEPSEEK_API_KEY), coach will throw on use");
  }
  const provider = config.llmProvider === "deepseek" && config.deepseekApiKey ? "DeepSeek" : "Gemini";

  return {
    async chat(messages: CoachMessage[]): Promise<{ reply: string; reasoning?: string }> {
      if (!client) {
        throw new ExternalServiceError(provider, "No LLM API key is set");
      }
      if (!messages.length) {
        throw new ExternalServiceError("Coach", "No messages provided");
      }
      try {
        const [contextSummary, knowledge] = await Promise.all([
          buildContext(deps),
          loadCoachKnowledgeFromDB(deps.coachKnowledgeRepo),
        ]);
        const systemPrompt = buildCoachSystemPrompt({
          contextSummary,
          knowledge,
          today: getLocalDateString(),
        });
        const reply = await client.chat(systemPrompt, messages);
        return { reply: reply.text, reasoning: reply.reasoning };
      } catch (error) {
        logger.error("Coach chat failed", { error: String(error) });
        throw new ExternalServiceError(provider, String(error));
      }
    },

    async *chatStream(messages: CoachMessage[]): AsyncGenerator<StreamDelta> {
      if (!config.deepseekApiKey) {
        throw new ExternalServiceError("DeepSeek", "DEEPSEEK_API_KEY is not set");
      }
      if (!messages.length) {
        throw new ExternalServiceError("Coach", "No messages provided");
      }
      try {
        const [contextSummary, knowledge] = await Promise.all([
          buildContext(deps),
          loadCoachKnowledgeFromDB(deps.coachKnowledgeRepo),
        ]);
        const systemPrompt = buildCoachSystemPrompt({
          contextSummary,
          knowledge,
          today: getLocalDateString(),
        });
        const history: DeepSeekMessage[] = [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({
            role: (m.role === "coach" ? "assistant" : "user") as "assistant" | "user",
            content: m.text,
          })),
        ];
        // Agentic streaming loop: stream a round, and if it ends in tool_calls,
        // run the tools, append the results, and stream the next round. Without
        // this the model's tool-call turn produced no answer and the UI hung.
        const tools = buildCoachTools(deps);
        for (let i = 0; i < MAX_TOOL_ITERS; i++) {
          const result = yield* deepseekChatStream({
            apiKey: config.deepseekApiKey,
            model: DEEPSEEK_COACH_MODEL,
            thinking: true,
            messages: history,
            tools: tools.schemas,
          });
          if (!result.tool_calls?.length) return;

          history.push({
            role: "assistant",
            content: result.content ?? "",
            tool_calls: result.tool_calls,
          });
          for (const tc of result.tool_calls) {
            let toolResult: string;
            try {
              toolResult = await tools.run(tc.function.name, JSON.parse(tc.function.arguments));
            } catch (err) {
              toolResult = JSON.stringify({ error: String(err) });
            }
            history.push({ role: "tool", content: toolResult, tool_call_id: tc.id });
          }
        }
      } catch (error) {
        logger.error("Coach chat stream failed", { error: String(error) });
        throw new ExternalServiceError("DeepSeek", String(error));
      }
    },

    async getPlan(): Promise<CoachPlanGrouped> {
      const rows = await deps.coachPlanRepo.getAll();
      const grouped: CoachPlanGrouped = { Push: [], Pull: [], Legs: [] };
      for (const row of rows) {
        if (row.day_type in grouped) grouped[row.day_type as PlanDayType].push(row);
      }
      return grouped;
    },

    async savePlan(dayType: string, exercises: CoachPlanInput[]): Promise<CoachPlanRow[]> {
      const day = assertDayType(dayType);
      return deps.coachPlanRepo.replaceDayType(day, exercises);
    },

    async listKnowledge() {
      return deps.coachKnowledgeRepo.list();
    },

    async addKnowledge(title: string, body: string) {
      return deps.coachKnowledgeRepo.create(title, body);
    },

    async updateKnowledge(id: number, data: { title?: string; body?: string }) {
      return deps.coachKnowledgeRepo.update(id, data);
    },

    async deleteKnowledge(id: number) {
      await deps.coachKnowledgeRepo.delete(id);
    },

    async reorderKnowledge(ids: number[]) {
      await deps.coachKnowledgeRepo.reorder(ids);
    },
  };
}
