# Plan: In-App AI Coach (port the Gemini "gem" into the app, wired to history)

## Context

**Problem.** Today's flow: hit gym → jot session (type/reps/RPE/feeling) → paste into an external Gemini gem → get feedback → ask it to update. The gem knows persona + age/goal + plan definitions (e.g. "Push Day = incline DB press…"), but it is **blind to full training history** — it sees only the one session pasted. Feedback can't reference progression, trends, or last week's numbers. Then the text gets manually copied back into this app.

**Goal.** Bring the coach **inside** the app as a chat, give it the **history DB + the context the gem expects**, and keep the loop in one place. Compared to the competitor's "Fit Doctor" screen, the user explicitly does **NOT** want the gamification economy (coins/shop/quests/streak multiplier) — solo app, self-disciplined. Only the **AI coach persona** is wanted.

**Decisions (confirmed with user):**
- Interaction = **chat** (feedback → reply → "update"), not one-shot.
- Backfill = **all missing context**: plans, profile age+goal, per-session feeling.
- Cadence = **daily, cached + manual refresh**.
- Placement = **top of `DailyWorkoutPage`**.
- Design = **our** system (teal `oklch(0.72 0.19 160)` accent + glassmorphism), NOT the competitor's orange.
- **Token concern (user-raised):** bound history sent to the LLM via a summarized, configurable window — never dump all rows.

**Required input from user before/at implementation:** paste the gem's **system instruction** — drops verbatim into the coach client as `systemInstruction`. Plan is built to accept it as-is.

---

## What's missing today (verified)
- Plans/programs: **absent** (no plan/program/split table).
- Profile `age`, `goal`: **absent** (profile = weight/height/tdee/macros only).
- Per-session `feeling`: **absent** (only per-exercise `rpe`, `notes_thai/english`, session `notes`).
- History: **present** — `sessions` table + `workoutService.getByDate`, `getDates`, `getByExercise(name, 0)` (all-time).

---

## Architecture

### A. Data backfill (Drizzle migrations + types)
Files: `backend/src/schema.ts`, `backend/src/types.ts`, `frontend/src/types.ts`, new migration in `backend/drizzle/`.

1. **Plans** — two tables:
   - `plans`: `id`, `name` (e.g. "Push Day"), `notes`, `created_at`.
   - `plan_exercises`: `id`, `plan_id` (FK), `exercise_name`, `target_sets`, `target_reps`, `order_index`.
   - Add nullable `plan_id` FK to `sessions` so a logged session maps to its prescribed plan (lets coach compare actual vs prescribed).
2. **Profile** — add `age` (integer) and `goal` (text; free-form e.g. "lean bulk to 75kg" — simplest, no enum). Update `ProfileData`/`ProfileRow`/`ProfileUpdateInput` in `backend/src/types.ts`, `backend/src/repositories/profile.repository.ts`, `frontend/src/types.ts`.
3. **Session feeling** — add `feeling` (text) to `sessions`.

### B. Coach context builder (the token-bounded core)
File: `backend/src/services/coach.service.ts` (new). Inject existing `workoutService`, `nutritionService`, `profileService` + new `planService`.

`buildContext(date)` produces a **compact text block**, not raw rows:
- **Profile**: age, goal, weight, TDEE, macro targets.
- **Today's session**: plan name + prescribed exercises, actual exercises (weight×reps×rpe), session `feeling`, session `notes`.
- **Progression**: for **only the exercises in today's session**, last ~5 data points each via `getByExercise(name, COACH_PROGRESSION_DAYS)` → "Incline DB: 22.5×8@8 (May30) ← 20×9@7 (May26)…".
- **Recent digest**: last `COACH_MAX_SESSIONS` sessions summarized to one line each (date · plan · top sets · feeling), bounded by `COACH_HISTORY_DAYS`.
- **Nutrition**: today + short recent-average line.

New constants in `backend/src/constants.ts`: `COACH_HISTORY_DAYS = 30`, `COACH_MAX_SESSIONS = 10`, `COACH_PROGRESSION_DAYS = 0` (all-time, capped to ~5 points in formatting), `COACH_MAX_THREAD_MESSAGES = 20`, `COACH_MODEL = gemini-3-flash-preview`, `COACH_TEMPERATURE = 0.7`.

### C. Coach LLM client
File: `backend/src/coach/client.ts` (new) — mirrors `backend/src/nutrition-ai/client.ts` (`GoogleGenAI`, same API key/config service) but:
- `systemInstruction` = **user's gem instruction** (stored as a constant/config string).
- `temperature` = `COACH_TEMPERATURE` (coaching tone, not 0.1 extraction).
- **Free-text** output — no JSON parse / no normalizer.
- Accepts a message array (system context + thread) for multi-turn chat.

### D. Coach persistence + service (chat)
- Table `coach_messages`: `id`, `date` (YYYY-MM-DD, the thread key), `role` ('coach'|'user'), `content`, `created_at`. (Thread-per-day → satisfies "daily cached".)
- `coach.service.ts` methods:
  - `getThread(date)` — return stored messages; if none, generate the initial feedback (build context → call client → persist) and return it. = **daily cache**.
  - `reply(date, userText)` — persist user msg, call client with `[context + last COACH_MAX_THREAD_MESSAGES]`, persist + return coach msg.
  - `refresh(date)` — clear the day's thread, regenerate initial. = **manual refresh**.

### E. Routes
File: `backend/src/routes/coach.routes.ts` (new), registered in `backend/src/app.ts` via `registerCoachRoutes(app, ctx)` (same registrar pattern as `registerWorkoutRoutes`). Elysia `t` validation.
- `GET  /coach/:date` → thread (generates initial if empty)
- `POST /coach/:date/message` `{ text }` → coach reply
- `POST /coach/:date/refresh` → regenerated initial
Plus plan CRUD: `backend/src/routes/plans.routes.ts` — `GET/POST/PATCH/DELETE /plans`, and assign `plan_id` on session create/update.

### F. Frontend
- `frontend/src/lib/api/coach.ts` — `coachApi.getThread(date)`, `.sendMessage(date, text)`, `.refresh(date)`; add `queryKeys.coach.byDate(date)`.
- `frontend/src/features/coach/hooks/useCoach.ts` — react-query (thread query + sendMessage mutation w/ optimistic append + refresh mutation), modeled on `features/nutrition/hooks/useNutrition.ts`.
- `frontend/src/components/CoachCard.tsx` — top of `DailyWorkoutPage.tsx`. Persona avatar + name (from gem), scrollable message thread, reply input, refresh button. Style = existing tokens: `bg-white/[0.02] border border-white/5 rounded-2xl backdrop-blur-md`, teal primary accent, `lucide-react` icons (e.g. `Sparkles`, `Send`, `RotateCw`). Follows `GroupedWorkoutCard.tsx`.
- Backfill UI: age+goal fields on `ProfilePage.tsx`; `feeling` input in session logging/review (`ReviewModal.tsx`); a Plans manager (new `PlansPage.tsx` + plan picker on logging) — minimal CRUD.

---

## Token strategy (explicit, per user concern)
- History is **summarized**, never raw-dumped: ≤ `COACH_MAX_SESSIONS` one-line session digests within `COACH_HISTORY_DAYS`.
- Per-exercise progression only for **today's** exercises, ~5 points each.
- Chat thread capped to last `COACH_MAX_THREAD_MESSAGES`; context block built once per day and reused across turns.
- Model = `gemini-3-flash-preview` (already used, cheap). All windows are constants → tune freely.

---

## Implementation order
1. Migrations + types: plans/plan_exercises, sessions.plan_id, sessions.feeling, profile.age/goal.
2. `planService` + plan routes + frontend Plans CRUD + plan picker.
3. Profile age/goal + session feeling UI.
4. Coach client (drop in system instruction) + context builder + constants.
5. Coach persistence + service + routes + register in app.ts.
6. Frontend coachApi + useCoach + CoachCard on DailyWorkoutPage.

---

## Verification
- **Migrations**: run drizzle migrate; confirm new columns/tables (`backend/drizzle/`), no data loss on existing rows.
- **Context size**: log the built context string length for a real day; confirm it stays bounded as history grows (add more sessions, re-check).
- **Coach initial**: `GET /coach/2026-05-30` returns a persona feedback message referencing today's session + progression; second call returns the **cached** thread (no new LLM call).
- **Chat**: `POST /coach/2026-05-30/message {text:"swap incline for flat next week?"}` returns a context-aware reply; thread persists across reloads.
- **Refresh**: `POST /coach/2026-05-30/refresh` regenerates.
- **Backfill**: set age/goal on ProfilePage, add a Push Day plan, log a session with feeling + plan → confirm all three appear inside the coach context (visible in coach's reply).
- **UI**: CoachCard renders at top of DailyWorkoutPage in app theme (teal/glass), thread scrolls, input + refresh work.
- **No gamification** introduced anywhere (no coins/shop/quests).
