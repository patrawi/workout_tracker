# Progressive Overload Agent — Implementation Plan

> Implements `docs/Progressive Overload Agent — Design Spec EN.md`. Spec is source of truth; if code conflicts, spec wins.
> Staged in 4 phases with a review gate between each. Owner: Pirawat. Mode: capture session_type/pain by **both** parser pre-fill + confirm-time override.

## Data model facts (verified)
- One `workouts` row = one **set** (parser: "Each set of an exercise is its own object"). Spec §3.1 maps directly — no new sets table needed.
- Session-level activity already flows through `/confirm` `activity` object → `sessions` row.
- est-1RM (Brzycki) already exists frontend: `weight*reps*0.0333 + weight`.

## Decisions
- session_type + pain: parser pre-fills from text, user overrides at confirm (ReviewModal).
- gym_profile: single named profile = `<GYM_NAME>` (default). Future gym change = new profile string → continuity resets (deterministic compare, §4.1).
- Sequencing: phase-by-phase, review gate between.

---

## Phase 1 — Schema + capture  ✅ DONE (review gate)
Migration `drizzle/0012_tired_medusa.sql` generated (NOT yet applied — run `bun src/migrate.ts` after review).
Note: session_type **parser pre-fill** moved to Phase 4 (it changes the parse-response shape from `WorkoutData[]` to `{items, session_type}`, which the ReviewModal work touches anyway). Phase 1 wires session_type/gym_profile via the confirm `activity` object; pain is parsed per-set now.

### Phase 1 — original detail
**Schema (`backend/src/schema.ts` + drizzle migration)**
- `sessions`: add `session_type` pgEnum `['working','working_compromised','form_check','return_from_layoff','return_from_injury']` default `'working'`; add `gym_profile` text default `'<GYM_NAME>'`.
- `workouts`: add `pain` boolean default false. (§3.2 pain checkbox; free-text comment already = notes_*)

**Backend wiring**
- `WorkoutData` type + normalizers: add optional `pain` (default false).
- Parser prompt (`ai/prompts.ts`): may extract `pain` per set + a session-level `session_type` hint from text keywords (e.g. "compromised", "form check", "back after break/injury", "pain"). Deterministic-first: parser only *suggests*; user confirms.
- `/confirm` route schema: `activity` gains `session_type`, `gym_profile`; `items` gain `pain`.
- `workout.repository.ts createBatch`: persist session_type + gym_profile on session, pain on each workout.
- mappers / withWorkoutDefaults updated.

## Phase 2 — Deterministic overload tool + %1RM  ✅ DONE (review gate)
- `coach/overload.ts` — pure math (epley1RM, repsAtWeight, nextIncrement, assessExercise) + constants. %1RM modelled as Epley (one consistent model, matches existing analytics) rather than a separate hardcoded table that could disagree.
- `workout.repository.ts getExerciseSetsWithContext` — joins workouts↔sessions, groups by session (session_type, gym_profile, pain), most-recent-first.
- `coach/tools.ts get_overload_assessment(exercise_name)` — reads plan target for rep range, runs assessExercise, surfaces pain comments for §5.2 handback.
- `tests/unit/coach/overload.test.ts` — 16 tests (gates, go-signal, too-light, bodyweight, session_type, continuity reset, pain). Full suite 111 pass.

### Phase 2 — original detail
**New `backend/src/coach/overload.ts` — pure, tested (bun test):**
- group sets by (exercise, session) from history rows.
- `volumeLoad` = Σ weight×reps (§4.2, sanity metric only).
- `continuityCounter`: consecutive most-recent sessions with same gym_profile (§4.1, deterministic string compare).
- est-1RM (Brzycki) + small static `%1RM` table (§6.1) for nearest dumbbell/plate increment (§4.4).
- `assessExercise(historyRows, opts)` → `{ dataSufficient, points, continuity, volumeTrend, goSignal, deltaPct, expectedRepDrop, reason }` following §4.1 gate (≥5 default, floor 3), §4.3 go-signal (top-of-range ×3 sets; RPE dials jump size), §4.4 (+4% cap, RPE 6–7 exception), §5 default-hold.
- Only counts `session_type='working'` sets toward the go-signal; `working_compromised`/`form_check` excluded from trigger (§3.3).

**New coach tool `get_overload_assessment(exercise, gym_profile?)`** in `coach/tools.ts`:
- reads `workoutRepo.getByExercise` filtered by gym_profile, returns deterministic assessment JSON. LLM interprets, never does math (§6.2).

## Phase 3 — Prompt guardrails + output contract  ✅ DONE (review gate)
- `coach/prompts.ts` — added PROGRESSIVE OVERLOAD block (goal=hypertrophy, asymmetric risk→default-hold, call get_overload_assessment / never freelance math, precedence pain>retreat>go-signal, ≤4% cap + too-light exception, pain handback never classify, bodyweight optional).
- Planning section now: call get_overload_assessment per exercise → present table `Exercise | Weight | Sets×Reps | RPE | Reason` (§7); advise-with-evidence when clear, ask when borderline, surface declined go-signal once.
- Doc (knowledge.md) explicitly no longer overrides the tool's hold/increase call; it still governs split/execution/swaps. knowledge.md left untouched (user's doc).
- Tool already registered (Phase 2); Phase 3 is the prompt wiring. tsc clean, 111 tests pass.

### Phase 3 — original detail
- `coach/prompts.ts` System Instruction block (§6.1 constants): goal = hypertrophy not plate; asymmetric risk → default-hold; guardrail precedence pain > retreat(session_type≠working) > go-signal (§5.3); never >4% (§5.4); pain = hand-back-never-classify (§5.2); data-gate (§4.1).
- Output contract (§7): plan table + **reason column**; high-confidence → advise w/ evidence, borderline → ask; declined go-signal surfaced once, not re-nagged.
- Wire `get_overload_assessment` into the get_plan → propose → save_plan flow.

## Phase 4 — Logging UI  ✅ DONE (review gate)
- `frontend/src/types.ts` — `SESSION_TYPES`, `SessionType`, `SESSION_TYPE_LABELS`, `DEFAULT_GYM_PROFILE`; `WorkoutData.pain`, `WorkoutRow.pain`, `SessionActivityData.session_type/gym_profile`.
- `ReviewModal.tsx` — per-set ⚠️ pain checkbox; Session Context block (session_type dropdown default `working`, gym_profile field default constant); passed via confirm `activity` (pass-through, no hook/App change).
- `GroupedWorkoutCard.tsx` — ⚠️ badge on pain-flagged sets in history.
- tsc clean (frontend + backend); backend suite 111 pass.

**Deviation from "Both":** session_type is a conscious UI dropdown (default `working`), NOT parser-guessed. Rationale: per-set parsing of a session-level field is a hack, keyword detection unreliable, and it'd ripple a parse-response-shape change across 8 files. Aligns with spec §3.3 honesty-discipline ("ask yourself before logging"). Pain — the high-value flag — IS parser-prefilled (Phase 1) and overridable at confirm.

### Phase 4 — original detail
- `ReviewModal`: session_type dropdown (default working / parser hint), gym_profile (default, editable), pain checkbox per set row.
- Frontend `WorkoutData` type + `/confirm` payload updated.

## Out of scope (spec non-goals §1.3)
nutrition advice, injury diagnosis, new program design, suggesting weight without referenced data.
