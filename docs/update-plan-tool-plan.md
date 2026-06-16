# Plan: `update_plan` Coach Tool

Conversational plan-write tool. Coach edits the training plan mid-chat; commit only on
user's verbal confirm (HITL). This is the coach's **first write tool** — every read tool
today is safe-by-default, so this is where harness discipline starts to matter.

Status: not started. Owner: patrawi. (DeepSeek may implement, Claude reviews.)

---

## 1. Why this doc references Agent Harness

Background read: `PARA2/3. Resources/AI_ML/Agent Harness.md`. Our coach chat is already a
small agent harness. This task makes it a **write-capable** harness, which pulls in the
components we currently skip. Mapping below grounds each decision in real files.

### What we already overlap (have)

| Harness component (doc) | Our code | Status |
|---|---|---|
| While Loop / ReAct | `backend/src/coach/client.ts:87` `for i<MAX_TOOL_ITERS` (5) | have |
| Skills & Tools registry | `backend/src/coach/tools.ts` schema + runner | have |
| Loop cap + fallback | `MAX_TOOL_ITERS=5`, fallback prompt `client.ts:126` | have |
| Error catch → feed back | tool try/catch → error JSON `client.ts:114` | partial (catch, no retry) |
| System prompt assembly | `coach/prompts.ts` + `coach/knowledge.md` RAG | have |
| Streaming (`item/delta`) | SSE reasoning+content tokens (shipped) | have |
| Input truncation | param caps `MAX_DAYS=31`, `MAX_LIMIT=20` `tools.ts` | partial |

### What the doc has that we miss — fold into this task

| Gap (doc) | Where it bites `update_plan` | Action in this plan |
|---|---|---|
| Permission Layer / HITL (doc l.125-128) | write tool must not auto-commit | §3 confirm gate |
| Validation Loops (doc l.66) | bad plan rows must not reach DB | §4 validate before write |
| Permission tiers Read→Workspace (doc l.126) | read tools vs write tool | §5 tier flag on schema |
| Lifecycle hooks pre/post-tool (doc l.121-124) | check args before run, result after | §4 post-tool check |
| Context Mgmt / compaction (doc l.92-96) | long chat → Context Rot, stale plan refs | §6 sliding window (separate, noted) |
| Session Persistence (doc l.112-115) | no audit of who changed plan when | §6 deferred |

---

## 2. What exists to build on (don't rebuild)

- `coachPlanRepo.replaceDayType(dayType, rows)` — atomic delete+insert, already
  transactional. `backend/src/repositories/coach-plan.repository.ts:42`
- `coachService.savePlan(dayType, exercises)` — service wrapper. `coach.service.ts:45`
- `coachService.proposeNextSession(dayType)` → `PlanProposal` (LLM proposes, human saves).
  `coach.service.ts:44`
- `PLAN_DAY_TYPES = ["Push","Pull","Legs"]`, `CoachPlanInput` type. `coach.service.ts:24`

So persistence + validation-of-shape primitives already exist. This task wires them as a
**tool the coach calls inside chat**, with a confirm gate — not a new save path.

---

## 3. Confirm gate (HITL) — the core of the task

The coach must NOT write on its own turn. Two-phase:

1. **Propose** — coach calls `update_plan` tool with a draft (day_type + exercises). Tool
   does NOT write. It returns a structured diff (old rows vs proposed rows) back into the
   loop. Coach renders the diff to the user and asks "commit?".
2. **Confirm** — only after the user replies yes (verbal confirm) does a `commit_plan`
   call (or a `confirmed:true` arg) reach `savePlan` → `replaceDayType`.

Decision needed: one tool with a `confirmed` flag, vs two tools (`propose_plan` /
`commit_plan`). Two tools is clearer for the model and matches the existing
propose/save split. Default: **two tools** unless review says otherwise.

Verbal confirm detection: keep it dumb — the confirm step is a separate user turn, coach
decides intent. No regex gate. (Matches memory: "commit on verbal confirm".)

---

## 4. Validation + post-tool check (doc: validation loops, hooks)

Before `replaceDayType` runs, validate proposed rows:

- `day_type ∈ PLAN_DAY_TYPES`
- each row: `sets ≥ 1`, `rep_low ≤ rep_high`, `rpe_low ≤ rpe_high`, `position` unique/ordered
- `is_bodyweight` ⇒ `target_weight` null; else `target_weight ≥ 0`

On fail: return error JSON into the loop (like `tools.ts:159` unknown-tool path) so the
coach self-corrects — this IS the doc's validation loop. Do not throw to the user.

Post-tool check: after write, re-read the day's rows and return them as confirmation so the
coach reports actual saved state, not its own guess (doc: live verification, anti-hallucination).

---

## 5. Permission tier on the schema

Tag tools so the harness knows which mutate:

- read tools (`get_*`) = tier `read`
- `propose_plan` = tier `read` (no write)
- `commit_plan` = tier `write` — gated, only runs post-confirm

Minimal: add a `tier` field where tools are built (`tools.ts buildCoachTools`). Loop in
`client.ts` refuses `write`-tier calls unless the confirm flag/turn is set. Keep it one
field + one check; no permission framework.

---

## 6. Deferred (note, don't build now)

- **Context Management** (sliding window in `client.ts` history) — real Context Rot risk,
  but separate change; do after this lands. Tracked here so it's not lost.
- **Session Persistence** — append-only log of plan changes for audit/resume. Nice-to-have.
- **Sub-agent** for plan generation — overkill at current size.

---

## 7. Build order

1. Add `tier` to tool schemas + `write`-tier guard in `client.ts` loop. (§5)
2. Add `propose_plan` tool: build diff vs current `getByDayType`, return, no write. (§3)
3. Add `commit_plan` tool: validate (§4) → `savePlan` → re-read → return saved rows.
4. Prompt update (`coach/prompts.ts`): teach coach the propose→confirm→commit flow.
5. Test: propose shows diff; commit only after yes; bad rows bounce back; DB unchanged on
   reject. `bun test`.

## 8. Success criteria

- Coach can edit Push/Pull/Legs plan through chat.
- No DB write without an explicit user yes on a following turn.
- Invalid plan never reaches DB; coach gets the error and retries.
- Coach reports saved state from re-read, not from its draft.
