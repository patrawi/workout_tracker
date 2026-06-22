// src/services/coach.service.ts

import type { ConfigService } from "./config.service";
import type { AnalyticsService } from "./analytics.service";
import type { NutritionService } from "./nutrition.service";
import type { BodyweightService } from "./bodyweight.service";
import type { ProfileService } from "./profile.service";
import { createCoachClient, createDeepSeekCoachClient, type CoachClient, type CoachMessage } from "../coach/client";
import { buildCoachSystemPrompt, buildPlanSystemPrompt } from "../coach/prompts";
import { buildCoachTools } from "../coach/tools";
import { deepseekChatStream, type StreamDelta, type DeepSeekMessage } from "../llm/deepseek";
import { ExternalServiceError, ValidationError } from "../lib/errors";
import { createChildLogger } from "../lib/logger";
import { getLocalDateString } from "../lib/date";
import { classifySession } from "../coach/classify";
import { extractJsonItems } from "../llm/extract-json";
import type { createCoachPlanRepository, CoachPlanRow, CoachPlanInput } from "../repositories/coach-plan.repository";
import type { createCoachKnowledgeRepository, CoachKnowledgeRow } from "../repositories/coach-knowledge.repository";
import type { createWorkoutRepository, SessionWithWorkouts } from "../repositories/workout.repository";
import { COACH_CONTEXT_DAYS, COACH_NUTRITION_DAYS, DEEPSEEK_COACH_MODEL } from "../constants";

const logger = createChildLogger("coach-service");

const MAX_TOOL_ITERS = 5;

export const PLAN_DAY_TYPES = ["Push", "Pull", "Legs"] as const;
export type PlanDayType = (typeof PLAN_DAY_TYPES)[number];

export interface ProposedExercise extends CoachPlanInput {
  change: "increase" | "hold" | "decrease";
  rationale: string;
}

export interface PlanProposal {
  day_type: PlanDayType;
  based_on_date: string | null;
  exercises: ProposedExercise[];
}

export type CoachPlanGrouped = Record<PlanDayType, CoachPlanRow[]>;

export interface CoachService {
  chat(messages: CoachMessage[]): Promise<{ reply: string; reasoning?: string }>;
  chatStream(messages: CoachMessage[]): AsyncGenerator<StreamDelta>;
  getPlan(): Promise<CoachPlanGrouped>;
  proposeNextSession(dayType: string): Promise<PlanProposal>;
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

const toNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const toStr = (v: unknown): string => (typeof v === "string" ? v : "");

function planToText(rows: CoachPlanRow[]): string {
  return rows
    .map((p) => {
      const w = p.is_bodyweight ? "Bodyweight" : `${p.target_weight ?? "?"}kg`;
      const note = p.notes ? ` — ${p.notes}` : "";
      return `${p.position}. ${p.exercise_name} — ${w} ${p.sets}x${p.rep_low}-${p.rep_high} RPE ${p.rpe_low}-${p.rpe_high}${note}`;
    })
    .join("\n");
}

function daysAgo(createdAt: string | null, today: string): string {
  if (!createdAt) return "";
  const then = new Date(`${createdAt.slice(0, 10)}T00:00:00.000Z`).getTime();
  const now = new Date(`${today}T00:00:00.000Z`).getTime();
  const d = Math.round((now - then) / 86_400_000);
  return d <= 0 ? "today" : `${d}d ago`;
}

/**
 * Render last-3 matching sessions as per-exercise history lines for the plan prompt.
 * sessions must be pre-filtered to the target day-type, newest first, max 3.
 */
export function buildHistoryText(
  sessions: SessionWithWorkouts[],
  plan: CoachPlanRow[],
  today: string,
): string {
  const norm = (s: string) => s.trim().toLowerCase();
  return plan
    .map((p) => {
      const lines = sessions
        .map((s) => {
          const sets = s.workouts.filter((w) => norm(w.exercise_name) === norm(p.exercise_name));
          if (!sets.length) return null;
          const setStr = sets
            .map((w) => `${w.is_bodyweight ? "BW" : `${w.weight}kg`} x${w.reps}@${w.rpe}`)
            .join(", ");
          return `  ${daysAgo(s.created_at, today)}: ${setStr}`;
        })
        .filter(Boolean);
      const target = p.is_bodyweight ? "BW" : `${p.target_weight ?? "?"}kg`;
      const body = lines.length ? lines.join("\n") : "  (no recent data)";
      return `${p.exercise_name} — target ${target}:\n${body}`;
    })
    .join("\n");
}

/**
 * Render every exercise actually logged across the matching sessions, with its
 * muscle group, so the model can substitute when a plan exercise has no
 * exact-name match (e.g. the gym lacks that machine and the user logged an
 * equivalent one). sessions must be pre-filtered to the day-type, newest first.
 */
export function buildLoggedHistoryText(
  sessions: SessionWithWorkouts[],
  today: string,
): string {
  const blocks = sessions.map((s) => {
    const when = daysAgo(s.created_at, today) || "session";
    const lines = s.workouts.map((w) => {
      const load = w.is_bodyweight ? "BW" : `${w.weight}kg`;
      return `  ${w.exercise_name} [${w.muscle_group}]: ${load} x${w.reps}@${w.rpe}`;
    });
    return `${when}:\n${lines.join("\n")}`;
  });
  return blocks.length ? blocks.join("\n") : "(no recent sessions)";
}

function coerceProposed(raw: Record<string, unknown>, index: number): ProposedExercise {
  const change = toStr(raw.change);
  const is_bodyweight = raw.is_bodyweight === true;
  return {
    position: toNum(raw.position, index + 1),
    exercise_name: toStr(raw.exercise_name) || `Exercise ${index + 1}`,
    is_bodyweight,
    target_weight: is_bodyweight ? null : (raw.target_weight == null ? null : toNum(raw.target_weight)),
    sets: toNum(raw.sets, 3),
    rep_low: toNum(raw.rep_low),
    rep_high: toNum(raw.rep_high),
    rpe_low: toNum(raw.rpe_low),
    rpe_high: toNum(raw.rpe_high),
    notes: toStr(raw.notes),
    change: change === "increase" || change === "decrease" ? change : "hold",
    rationale: toStr(raw.rationale),
  };
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

    async proposeNextSession(dayType: string): Promise<PlanProposal> {
      const day = assertDayType(dayType);
      if (!client) {
        throw new ExternalServiceError(provider, "No LLM API key is set");
      }
      try {
        const [plan, knowledge, sessions] = await Promise.all([
          deps.coachPlanRepo.getByDayType(day),
          loadCoachKnowledgeFromDB(deps.coachKnowledgeRepo),
          deps.workoutRepo.getRecentSessionsWithWorkouts(40),
        ]);

        // Last 3 sessions classified as this day type, newest first.
        const matching = sessions
          .filter(
            (s) =>
              classifySession(s.workouts.map((w) => w.muscle_group)) === day,
          )
          .slice(0, 3);

        const historyText = buildHistoryText(matching, plan, getLocalDateString());
        const loggedText = buildLoggedHistoryText(matching, getLocalDateString());

        const systemPrompt = buildPlanSystemPrompt({
          knowledge,
          dayType: day,
          planText: planToText(plan),
          historyText,
          loggedText,
          today: getLocalDateString(),
        });

        const { text } = await client.chat(
          systemPrompt,
          [{ role: "user", text: `Generate the next ${day} session as a JSON object.` }],
          { jsonObject: true },
        );
        const exercises = extractJsonItems(text, "coach plan")
          .map(coerceProposed)
          .sort((a, b) => a.position - b.position);

        return { day_type: day, based_on_date: matching[0]?.created_at ?? null, exercises };
      } catch (error) {
        if (error instanceof ValidationError) throw error;
        logger.error("Coach plan proposal failed", { error: String(error) });
        throw new ExternalServiceError(provider, String(error));
      }
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
