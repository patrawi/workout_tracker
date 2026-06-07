# Coach: persist chat history + DeepSeek tool calling

## Context

Two gaps in the AI coach:

1. **Chat history is ephemeral.** `useCoach` keeps messages in React state only (`frontend/src/features/coach/hooks/useCoach.ts:10`). Reload or "New chat" wipes it. No persistence anywhere.

2. **Coach can't see daily data.** `buildContext()` collapses 7 days of nutrition into a single *average* line (`backend/src/services/coach.service.ts:88-117`). The per-day rows exist in the DB (`nutritionService.getByDate`) but never reach the LLM. Result: when the user asked for a per-day deficit breakdown, the coach correctly said it only had the 7-day average — it literally wasn't given the daily numbers. Fix: give the LLM **tools** to fetch daily/range data on demand, so the base prompt stays small and the coach can answer arbitrary drill-downs.

Provider is **DeepSeek V4** (`LLM_PROVIDER=deepseek`, model `deepseek-v4-flash`), which supports tool calls in both thinking and non-thinking modes (confirmed from DeepSeek model docs). Gemini is only the fallback — we do **not** build tools for it (no speculative dual-provider abstraction).

Outcome: history survives reload; coach can pull exact daily nutrition / sessions / bodyweight and compute things like daily deficit.

---

## Part A — Persist chat history (frontend, localStorage)

Single change in `frontend/src/features/coach/hooks/useCoach.ts`. Single-user app, so localStorage is enough; a backend table is deferred until a real cross-device need appears.

- Lazy `useState` initializer reads `localStorage.getItem("coach:msgs")`, JSON-parses, falls back to `[]` on error.
- `useEffect([messages])` writes `JSON.stringify(messages.slice(-50))` (cap so it can't grow unbounded).
- `reset` clears state **and** `localStorage.removeItem("coach:msgs")`.

No other files change. `CoachMessage` type already serializable (`coach.types.ts`).

---

## Part B — DeepSeek tool calling (backend)

### B1. Low-level: teach `deepseekChat` about tools
`backend/src/llm/deepseek.ts`

- Extend `DeepSeekMessage`: allow `role: "tool"`, optional `tool_call_id`, and optional `tool_calls` on assistant messages.
- Add `tools?` to `DeepSeekChatOptions` (OpenAI-compat: `[{type:"function", function:{name, description, parameters}}]`).
- Add a new export `deepseekChatRaw(options)` that returns the **full** assistant message `{ content, tool_calls }` instead of just text. Keep existing `deepseekChat` (text-only) untouched so the plan-proposal path (`coach.service.ts:301`) and any other callers are unaffected.
- Send `tools` in the request body when provided.

### B2. Tool registry mapped to existing services
New file `backend/src/coach/tools.ts`

Export `buildCoachTools(deps: CoachServiceDeps)` returning `{ schemas, run }`:
- `schemas`: the OpenAI-format function declarations.
- `run(name, args)`: dispatch to the service method, return a compact JSON-stringifiable result.

Tools (all read-only, thin wrappers over methods the Explore confirmed exist):

| Tool | Backed by | Returns |
|---|---|---|
| `get_daily_nutrition(days)` | loop `nutritionService.getDates()` → `getByDate(date)`, aggregate per day | `[{date, calories, protein, carbs, fat}]` — **the workhorse for deficit questions** (one round-trip) |
| `get_nutrition_by_date(date)` | `nutritionService.getByDate` | meal-level rows for one day |
| `get_workout_sessions(limit)` | `workoutRepo.getRecentSessionsWithWorkouts` | recent sessions w/ sets |
| `get_bodyweight_logs(daysBack)` | `bodyweightService.getLogs` | `[{date, weight_kg}]` |
| `get_volume(daysBack)` | `analyticsService.getVolume` | `[{muscle_group, sets}]` |

`get_daily_nutrition` aggregation reuses the exact reduce shape already in `coach.service.ts:92-102`. Validate `date` args with `isValidDateString` (`backend/src/lib/date.ts`). Clamp `days`/`limit` to a sane max (e.g. 31) to bound cost.

### B3. Agentic loop in the DeepSeek client
`backend/src/coach/client.ts`

- Change `createDeepSeekCoachClient(apiKey, model?, tools?)` to accept an optional `tools` bundle `{ schemas, run }`.
- In `chat`: if `tools` present, run a loop (cap **5** iterations):
  1. `deepseekChatRaw({ messages, tools: schemas, thinking: true })`
  2. If the assistant message has `tool_calls`: append the assistant message, execute each call via `run(name, JSON.parse(args))`, append `{role:"tool", tool_call_id, content}` for each, loop.
  3. Else return `content`.
- If `tools` absent, behave exactly as today (back-compat).
- Keep `CoachClient` interface (`chat(systemPrompt, messages) => string`) unchanged — tools are injected at construction, not per-call, so callers and the Gemini client are untouched.

### B4. Wire tools in + shrink the prompt
`backend/src/services/coach.service.ts` and `backend/src/coach/prompts.ts`

- In `createCoachService`, when building the DeepSeek client, pass `buildCoachTools(deps)`.
- `buildContext()` stays as the cheap at-a-glance baseline (targets + volume + nutrition avg + bodyweight trend) — still useful, no per-day bloat added.
- In `buildCoachSystemPrompt`, add one line telling the model it can call tools for exact daily/range numbers and **must** do so before quoting per-day figures (so it stops saying "I only have the average"). Keep the existing "never invent" rule.
- Plan path (`proposeNextSession`) is **unchanged** — no tools, still uses `deepseekChat` + `extractJsonItems`.

---

## Files

**Edit**
- `frontend/src/features/coach/hooks/useCoach.ts` — localStorage persist (Part A)
- `backend/src/llm/deepseek.ts` — tools param + `deepseekChatRaw` (B1)
- `backend/src/coach/client.ts` — tool loop in DeepSeek client (B3)
- `backend/src/services/coach.service.ts` — pass tools to client (B4)
- `backend/src/coach/prompts.ts` — prompt line about tools (B4)

**New**
- `backend/src/coach/tools.ts` — tool schemas + executor (B2)

No DB migration, no route change, no Gemini change.

---

## Verification

1. **Persist:** run app, send a coach message, reload page → history still there. Click "New chat" → cleared and gone after reload. Check `localStorage["coach:msgs"]`.
2. **Tool loop (unit/manual):** with `LLM_PROVIDER=deepseek`, ask the coach in chat: *"เฉลี่ย 7 วันที่ผ่านมา deficit เท่าไหร่ และแต่ละวันกินเท่าไหร่"*. Expect it to call `get_daily_nutrition`, then return a **per-day** breakdown + total deficit (vs `profile.tdee`) — no longer "I only have the average".
3. **Tool execution sanity:** add a temporary log of each `tool_calls` name/args in the loop; confirm dates/args are valid and results non-empty for days that have logs.
4. **Back-compat:** confirm plan proposal (`proposeNextSession`) still works (it doesn't use tools), and that switching `LLM_PROVIDER=gemini` still answers (tool-less path).
5. `cd backend && bun test` (and typecheck) green.

## Handoff note (DeepSeek-implements flow)
This doc will be copied to `workout_tracker/docs/coach-tools-and-persist-plan.md` for handoff. Claude reviews the resulting implementation after.
