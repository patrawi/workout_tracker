# Plan: Coach Progression Loop (human-in-the-loop)

## Context

The coach is currently stateless chat: it reads logs + `knowledge.md` and replies in text. A prescription ("increase to 47kg next session") is never captured, confirmed, or persisted — on the next ask it re-derives from the *static* doc. There is no loop, no human-in-the-loop, and `knowledge.md` never updates. Also, `buildContext` feeds only set-counts by muscle group, not actual per-exercise weights/reps — so the coach can't truly compare unless the user types numbers.

This adds the loop the user's old Gemini Gem did by hand: log session → coach compares actuals vs current plan using the doc's rules → proposes the next session's targets → **user reviews/edits/accepts** → saved as the new plan → repeat.

### Decisions (locked)
- **Day-type (Push/Pull/Legs): derived in code at query time** from each session's `muscle_group`s. No DB column, no manual flagging, no Railway backfill — works on all existing history.
- **Progression state: new `coach_plan` table.** `knowledge.md` stays rules/philosophy.
- **Capture: dedicated "Plan next session" action** returning structured data. Free chat stays text.
- **Plan view: a tab inside the Coach page.**
- **Seed `coach_plan` from the doc's Pull/Push/Leg tables** (hand-authored seed, not a markdown parser).
- **Feed actual per-exercise sets** of the latest same-day-type session into the proposal context.

---

## Backend

### 1. Day-type classification (no schema change)
`backend/src/coach/classify.ts` → `classifySession(muscleGroups: string[]): "Push" | "Pull" | "Legs" | "Other"` by majority:
- Push: Chest, Shoulders, Triceps
- Pull: Back, Biceps (Core counts toward Pull per the doc's split, or ignored)
- Legs: Quads, Hamstrings, Glutes, Calves
Pure function, unit-testable.

### 2. `coach_plan` table (Drizzle migration)
`backend/src/schema.ts` + `bun run` drizzle generate:
```
coach_plan: id, day_type, position, exercise_name,
  is_bodyweight (bool), target_weight (real, nullable),
  sets (int), rep_low (int), rep_high (int),
  rpe_low (int), rpe_high (int), notes (text), updated_at
```
Repository `coach-plan.repository.ts`: `getByDayType(dayType)`, `getAll()`, `replaceDayType(dayType, rows)` (delete + insert in a transaction).

### 3. Seed
`backend/scripts/seed-coach-plan.ts` — hand-authored from the doc's three tables (Pull 8, Push B 7, Legs 6 exercises with their weights/sets/reps/RPE). Run once: `bun scripts/seed-coach-plan.ts`.

### 4. Latest actuals
`workout.repository` (or a small new method): `getLatestSessionByDayType(dayType)` — pull recent sessions + their workouts, `classifySession`, return the newest match with its `{exercise_name, weight, reps, rpe}` rows.

### 5. Structured prescription (provider-agnostic)
`coach.service`:
- `getPlan()` → all `coach_plan` rows grouped by day-type (for the Plan tab).
- `proposeNextSession(dayType)` → builds a prompt from: `knowledge.md` rules + current `plan[dayType]` + latest actual `dayType` session. Demands a JSON array; calls the existing coach client (`client.chat`, Gemini or DeepSeek), parses with `extractJsonItems`. Returns proposed rows + per-exercise `change: "hold"|"increase"|"decrease"` + `rationale`. **Not saved.**
- `savePlan(dayType, rows)` → `replaceDayType`.

`coach/prompts.ts` → `buildPlanPrompt(...)` with a strict JSON schema instruction.

### 6. Routes (`coach.routes.ts`)
- `GET  /api/coach/plan` → grouped plan.
- `POST /api/coach/plan/next` `{ day_type }` → proposed prescription (review payload).
- `PUT  /api/coach/plan` `{ day_type, exercises }` → save confirmed plan.

---

## Frontend (`features/coach/`)

- **Coach page gets a tab switch:** `Chat | Plan` (local state, no route change).
- `PlanView.tsx` — fetches `GET /coach/plan`; renders Push/Pull/Legs target tables (reuse the markdown table styling). Each day-type has a **"Plan next [day]"** button.
- `PlanReviewModal.tsx` — on "Plan next", call `POST /coach/plan/next`, show proposed rows in an **editable table** with the `change`/`rationale` per row and **Accept / Edit / Reject** (mirror `ReviewModal.tsx` human-in-the-loop). Accept → `PUT /coach/plan` → invalidate the plan query.
- `lib/api/coach.ts` — add `getPlan`, `proposeNext(dayType)`, `savePlan(dayType, rows)`.
- TanStack Query keys for the plan; invalidate on save.

**Reused:** `ReviewModal` pattern, markdown table styles, existing coach client + `extractJsonItems`, TanStack Query.

---

## The closed loop
1. Log a Pull session (existing flow) → auto-classified "Pull".
2. Coach → Plan tab → "Plan next Pull".
3. Backend compares latest actual Pull sets vs `plan[Pull]` under the doc's deficit/progression rules → proposes updated targets.
4. Editable review card → Accept/Edit/Reject.
5. Accept → `plan[Pull]` saved → that's what you train next.
6. Repeat. `knowledge.md` only changes when *you* edit the rules.

---

## Verification
1. `bun scripts/seed-coach-plan.ts` → `GET /api/coach/plan` returns 3 day-types with seeded targets.
2. Log a Pull session, then `POST /api/coach/plan/next {"day_type":"Pull"}` → structured JSON: each exercise with hold/increase/decrease + rationale citing your actual vs target.
3. `PUT /api/coach/plan` → `GET` reflects the saved change.
4. Frontend: Coach → Plan tab shows tables; "Plan next Pull" → editable card → Accept → table updates.
5. `bunx tsc --noEmit` (backend), `bunx tsc -b` + `bun run build` (frontend), `bun test` green.
6. Classification unit test: sample muscle-group sets → correct day-type.
