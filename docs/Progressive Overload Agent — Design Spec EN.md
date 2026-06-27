# Progressive Overload Agent — Design Spec

> **Source of truth.** The system (harness + tool + prompt) must be implemented according to this spec. If implementation conflicts with the spec → the spec is correct, the code must change (not the other way around).
> 
> **Authoring rule for this spec:** All logic comes from the owner's own head — AI/Claude Code's only job is to "write code that follows the spec."
> 
> **Legend:** ✅ = settled · ⚠️ = assumption not yet verified against data (keep an eye on it)
> 
> **Status:** v1 — READY FOR IMPLEMENTATION · **Owner:** Pirawat · **Last updated:** 2026-06-26

---

## 1. Problem & Goal

### 1.1 Problem statement ✅

Right now the system suggests the next plan probabilistically — it pulls %1RM in with no rule (like the Gemini case that used a population-average %1RM table incorrectly, throwing the logic off), and it's blind to confounders like sleep / hydration / form that can't be tracked directly. This spec lays down rules + guardrails for the LLM to follow, so its progressive-overload advice is grounded in the user's own data rather than population averages. It is intentionally **generalised** — not tied to any single phase (lean bulk / cut / maintenance).

### 1.2 Goal — what the agent optimizes ✅

- Goal = **muscle hypertrophy**, not the number on the plate.
- More weight ≠ guaranteed muscle growth — it's not worth trading away good form for it.
- Good hypertrophy = muscle getting mechanical tension in effective reps (RPE 7–10).

### 1.3 Non-goals ✅

- Will NOT **think about / advise on nutrition** (owner handles that + NutriTracker is separate).
- Will NOT **suggest a new weight without referenced data** (no sufficient data → no guessing).
- Will NOT **diagnose injuries** or judge which kind of pain is "safe" (always hand back to user — see §5.2).
- Will NOT **design a new program/split** — it only works on the exercises the user already does.

---

## 2. Core Principles

### 2.1 Decision under uncertainty — Asymmetric Risk ✅

The central principle governing all agent behavior:

- **Error A** (should have increased but held) → only costs opportunity / time → **recoverable** next session.
- **Error B** (shouldn't increase but told to increase) → forced, injury → **possibly irreversible** (long layoff).
- When one side is recoverable and the other irreversible → **when unsure, always lean toward "hold."**

This principle drives every decision in the spec, including schema design (pick the option that's easier to migrate back).

### 2.2 Handling Confounders ✅

|Type|Examples|How to handle|
|---|---|---|
|**A — random**|sleep, water, stress, daily form wobble, temporary exercise swap (gym crowded)|averages out on its own with enough **sample size**|
|**B — systematic**|form drift (cheating more and more as weight goes up), permanent gym change|sample size can't fix it — needs a direct guardrail / reset|

> ⚠️ Most dangerous trap: data can _look like_ beautiful overload while form is actually degrading → an agent that only watches the numbers will cheer you on to keep adding weight until you're hurt → hence §3.3 (session_type) + §5 guardrails are required.

---

## 3. Inputs

### 3.1 Data per set ✅

- weight (kg)
- actual reps completed
- RPE
- exercise (exercise_id) + date + set order
- comment (free text, optional) — see §5.2

### 3.2 Form proxy — accepted as a known limitation ✅

Correct vs. broken form can't be measured numerically (training alone, depends on mind-muscle connection) → **don't try to track rest time / tempo** (that's over-engineering) → compensate with: (1) pain yes/no checkbox + free-text comment, (2) the §5.2 guardrail, (3) §3.3 session_type, letting the user flag it themselves when they suspect their form is off.

### 3.3 `session_type` — enum (5 values) ✅

A new session-level field that addresses §2.2 (form drift) + prevents a strategic retreat from being read as regression.

|Value|Meaning|How the agent treats it|
|---|---|---|
|`working`|normal working set, prime condition|baseline — fully usable for the go-signal|
|`working_compromised`|working set but not in prime shape (sleep <7h, heavy/hard-to-digest meal pre-gym, low water)|counts in history, but **never used to trigger the go-signal** + down-weight its confidence|
|`form_check`|deliberately backing off the weight to check form|**not counted as regression, doesn't trigger the go-signal**|
|`return_from_layoff`|back after a long break (e.g. too busy, no training for 1+ week)|expect numbers to dip temporarily → ramp back, don't panic|
|`return_from_injury`|returning to training after an injury|**extra conservative** (Error B = re-injury = irreversible)|

> **Why enum, not boolean:** a retreat has multiple intents the agent must treat differently. A boolean captures only "abnormal/not" but not the "why" + "how to behave." Chose enum (not enum+note) because a free-text comment already exists per set and can serve as the note.

> ⚠️ **Moral hazard of `working_compromised`:** the user tags it themselves, so there's potential bias (tagging a bad-numbers day as compromised as an excuse) → guard with **honesty discipline**: the user commits to asking themselves before logging in order to _reduce noise_, not to make excuses (accepted as the honesty cost of a self-report system).

### 3.4 `gym_profile` — identifies the gym/setup (Design B) ✅

A session-level field (default comes from the template) that addresses §4.1 continuity when changing gyms.

- 99% of sessions: the template sets it automatically, the user touches nothing.
- On a gym change (rare, e.g. Edinburgh → Bangkok): create a new profile → value changes → **continuity counter resets automatically** (deterministic string compare — see §4.1) → not enough data → agent holds → gradually adapts on the new equipment.

> **Why Design B and not Design A (tick the machine every session):** ticking every session = tiring, abandoned within 2 weeks. The "temporary swap because it's crowded" case (cable fly instead of pec deck) = **confounder A (random)** → sample size absorbs it. Not worth designing a whole system to catch an event that already averages out.
> 
> ⚠️ The assumption "gym changes / exercise swaps aren't frequent" is still **judged from memory, not data** — if the trend gets abnormally noisy in the future, come back and verify this first.

---

## 4. Decision Logic

### 4.1 Data sufficiency gate — check before every decision ✅

Before advising anything, be confident the data is "trustworthy enough" = **consistency + enough sample size**.

- **Minimum data points per exercise:** at least 5 historical points (default) of the same exercise; hard floor 3.
- **Definition of "consistent" (code-checkable):** same exercise_id + same `gym_profile`
    - Comparing gym_profile = **deterministic string compare** (`current === previous`). Changed → reset the continuity counter.
    - **No fuzzy/similarity matching** (= probabilistic, violates §6.1) — prevent typos/inconsistent spelling by sourcing gym_profile from a **template/dropdown**, not freshly typed free text.
    - **Drop the food condition** from consistency (creates confounds too easily, can't be measured stably).

### 4.2 Progress metric ✅

- **Volume Load** = weight × reps × sets → used as a **sanity-check metric only, not a trigger** (because telling "stalled" from "climbing" off the graph is hard — see §4.3, use rep-based instead).
- **Always paired with RPE** — prevents junk volume from lifting light weights for high reps (effective rep zone = RPE 7–10).

### 4.3 Go-signal — criteria for adding weight ✅ (rep-based double progression)

**Primary trigger:** completing the **top of the rep range across all 3 sets** (e.g. 12×3) (heuristic from The Gym Group: hitting 12 reps for 3 sets = ready to progress).

**RPE = the dial that calibrates jump size (not the trigger):**

- Top of range at **RPE 8–10** → weight is right / at the point to move → add **+4%**, then watch reps drop to re-check RPE.
- Top of range at **RPE 6–7** → it's been too light for a while (user was slow) → may add **more than 4%**.

> ⚠️ Logic that must not be flipped: low RPE = too light (should increase / increase more), high RPE at top of range = right (add +4%). Both cases "add weight" — they differ only in _size_ of the jump.

### 4.4 Increment size + expected outcome ✅

- Add **+4%** (≈ ~3% 1RM shift) — expect reps to drop from 12 → **~10–11** (not 6–8, which violates load–rep).
- Then climb reps back up to 12 → loop double progression.
- **Hard limit: never add more than 4% at a time** (except the RPE 6–7 case clearly flagged as too-light-for-long).
- **Dumbbell exercises (2kg jumps):** an exact +4% is impossible → use %1RM to find the closest sensible available increment.
- **Bodyweight exercises (dips/pull-up):** use the same logic as machines via **weighted (belt + hanging plate)**. No separate flag — before adding weight, just climb reps/range as usual; the user adds the belt themselves when ready.

---

## 5. Guardrails

### 5.1 Default behavior ✅

- **Not enough data** or **borderline signal** → **hold the weight**, don't commit to increasing.

### 5.2 Pain — detect then hand back, never classify ✅

- The agent **does not classify severity** of pain (twinge vs. inflammation) — it has no right to say "this pain is safe." (asymmetric risk: a wrong guess = Error B = irreversible)
- On a pain signal in the comment/checkbox → **flag it back for the user to think about and decide.** ("Saw a comment mentioning symptom X — do you still feel it now? Was it just during the set and gone, or still hurting?")
- The LLM is what reads the free-text comment (text → LLM required, an acceptable exception to §6.1).

### 5.3 Guardrail precedence ✅

Priority order when signals conflict (top = wins):

1. **Pain signal** (§5.2) → always overrides the go-signal — even with green data, it becomes hold + ask.
2. **Strategic retreat / session_type ≠ working** → the agent must not argue with a user choosing to be conservative. (A voluntary back-off = recoverable + safe → the agent has no right to forbid it.)
3. **Go-signal** (§4.3) → only fires when neither of the two above is triggered.

### 5.4 Hard limits ✅

- Never recommend more than **4%** per increase (except the RPE 6–7 too-light case noted in §4.3).
- Never suggest when data fails the §4.1 gate.

---

## 6. Architecture (Harness Layout)

### 6.1 Mapping ✅

|Component|Layer|Why|
|---|---|---|
|Goal, guardrails, asymmetric risk, default-hold, precedence|**System Instruction**|constant every session|
|gym data (sessions/reps/RPE/comment from DB)|**Context via Tool Calling**|changes every request + grows over time → LLM calls a tool to fetch it, don't dump the whole thing|
|%1RM table (static lookup)|**Context / reference data**|static data, no logic|
|Volume Load, trend, %1RM check, continuity counter|**Tool (deterministic)**|calculation — LLM must not do the math itself (prevents hallucination), like NutriTracker|

### 6.2 Deterministic-first principle ✅

Every calculation that affects a decision → a tool computes it, the LLM only calls + interprets the result. **Sole exception:** reading the free-text comment to detect a pain signal (§5.2) — text requires the LLM to read it.

### 6.3 Flow ✅

```
1. User asks for feedback / next-session plan (usually after asking for feedback on the current session).
2. LLM calls a tool to pull history (default 5 points, minimum 3) of the same exercise + same gym_profile.
3. Tool computes metrics (volume load, trend, %1RM, continuity counter) — deterministic.
4. LLM reads comments to detect pain signals (§5.2).
5. Check guardrail precedence (§5.3): pain? → hold+ask | retreat? → respect | else → compare go-signal.
6. Check data sufficiency gate (§4.1): insufficient → hold.
7. Output: a table for the next plan + a reason column → ask the user whether to save.
8. User confirms → tool writes to DB | user edits → adjust accordingly.
```

---

## 7. Output Contract ✅

**Format:** a plan table (like the current template) + a **new column = reason** (why increase / hold / decrease).

- High confidence (clear data) → **advise with reasoning** (data as evidence boosts confidence for a user who may be anxious/shy).
- Borderline → **ask back**.
- Not pure Socratic by default — because the user is a human who wants evidence to help decide.

**Example form (Push Day, based on current):**

|Exercise|Weight|Sets × Reps|RPE|**Reason (new column)**|
|---|---|---|---|---|
|Dumbbell Incline Press|20kg|3 × 8–12|8–9|_(agent fills: increase/hold because...)_|
|Shoulder Press Machine|27kg|3 × 8–10|8–9||
|Machine Incline Press|45kg|3 × 10–12|8–9||
|Dips|BW|3 × 10–12|8–9||
|Dumbbell Lateral Raise|6kg|3 × 12–15|8–9||
|Tricep Extension Machine|54kg|3 × 8–10|8–9||

**Case: user declines a valid go-signal** (e.g. dips are ready for weighted but the user doesn't want to yet):

- The agent **surfaces the signal + respects the decision** ("data says you're ready; if you want, weighted is an option — but holding is fine if you're not ready").
- **Doesn't re-cheer every session** (avoids being annoying/pressuring) → lets the user think and act on their own; they'll do it when ready.

---

## Appendix — Assumptions to watch (⚠️ not yet verified against data)

- [ ] §3.4 "gym changes / exercise swaps aren't frequent" — judged from memory; if the trend gets noisy → come back and verify.
- [ ] §3.3 moral hazard of `working_compromised` — accepted as honesty cost; watch whether the trend looks too good to be true.
- [ ] §4.1 the numbers 5 (default) / 3 (min) — still a heuristic; tune once there's enough data.