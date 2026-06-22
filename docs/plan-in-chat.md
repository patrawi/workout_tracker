# Plan-in-chat: move session planning into the coach chat

## Goal
Replace the dedicated "Plan next" button with a conversational flow in the coach
chat. The coach reads past sessions via tools, proposes a plan, takes the user's
post-workout feedback, and — only on explicit confirmation — saves the next
session's plan via a tool. The Plan page becomes a read-only view of the saved
plan.

## Target flow
1. User asks in chat for a day's plan (e.g. "ขอแพลน Push").
2. LLM calls `get_day_type_history` (+ `get_plan`) → analyses last Push session(s) → proposes today's plan in chat (not saved).
3. User trains, returns, gives feedback in the same chat.
4. LLM analyses feedback → proposes the next matching session's plan.
5. User confirms ("โอเค บันทึก") → LLM calls `save_plan` → writes DB.
6. Plan page shows the saved plan, read-only, with its updated date.

## Backend
New tools in `backend/src/coach/tools.ts` (chat already runs tools agentically in
`coach.service.chatStream`):
- `get_plan({ day_type? })` — current saved plan; all day-types or one. → `coachPlanRepo.getAll/getByDayType`.
- `get_day_type_history({ day_type, limit? })` — last N (default 3) sessions classified as that day type with per-exercise sets + muscle group. Reuse `classifySession` + `workoutRepo.getRecentSessionsWithWorkouts(40)`.
- `save_plan({ day_type, exercises[] })` — validate + `coachPlanRepo.replaceDayType`. Called only after explicit user confirmation.

`COACH_PERSONA` (prompts.ts): add the planning workflow + the rule that
`save_plan` runs ONLY on explicit user confirmation, never speculatively.

## Delete (old button path — confirmed remove)
- backend: `proposeNextSession` (service + interface), route `POST /coach/plan/next`, `buildPlanSystemPrompt`, `buildHistoryText`, `buildLoggedHistoryText`, `planToText`, `daysAgo`, `coerceProposed`, `toNum`/`toStr`, `ProposedExercise`/`PlanProposal` types, now-unused imports (`extractJsonItems`, `classifySession` moves to tools.ts).
- frontend: `PlanReviewModal.tsx`, `coachApi.proposeNext`, `coachApi.savePlan` (orphaned with modal), `ProposedExercise`/`PlanProposal` types, the "Plan next" button + `propose` mutation in `PlanView.tsx`.
- delete `tests/unit/coach/buildHistoryText.test.ts` (functions gone).
- Keep backend `savePlan` service method + `PUT /coach/plan` route? No frontend caller remains; the tool writes via repo directly. Leave the route in place only if cheap; otherwise remove. (Decision: tool calls repo directly; remove the orphaned PUT chain if clean.)

## Frontend — Plan page
Read-only. No generate/edit buttons. Show each day's exercises + the plan's
`updated_at` so the user knows when it was created / which upcoming session it is.

## Verify
- `bunx tsc --noEmit` (backend) clean.
- `bun test` green (after removing stale test).
- Frontend typecheck/build clean.
- Manual: ask for a plan in chat → proposal appears; confirm save → Plan page reflects it with date.
