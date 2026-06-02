# Plan: Port "Frictionless AI Coach" UI into workout_tracker

## Context

The user has a standalone React artifact (`~/Downloads/Coach & Knowledge Base (standalone).html`) — a polished "AI Coach + Knowledge Base" prototype. It is **not functional**: chat replies come from a hardcoded keyword script (`buildReply`), KB articles are hardcoded, and it ships its own duplicate top-nav. The goal is to turn it into a **real feature** inside the existing workout_tracker app: a Coach chat page wired to a real LLM that reads the user's actual logs, plus a Knowledge Base drawer.

Decisions locked during grilling:
- `/grill-me` + `/andrej-skill` = how I work (interview + surgical changes), **not** product features. Coach persona stays "Coach Mali".
- Chat = **real AI over the user's logs** (new backend endpoint).
- LLM provider **not finalized** (Gemini now, likely DeepSeek later for cost) → design **provider-agnostic**.
- Grounding = **rich but bounded** summary (last 7–14d).
- History = **ephemeral** (frontend-held, last N turns sent each request). DB persistence later.
- Delivery = **single JSON** response. SSE later.
- KB = **build the structure/UI**; user fills static article content later. No RAG citations in v1.
- Persona hero = **static placeholder** v1 (TODO for real daily insight).
- Frontend code lives under `features/coach/`; page in `pages/`.

Provider/persistence/streaming/citations are all explicitly deferred — the design must keep each swappable without rework.

---

## Backend

Keep it minimal — match the existing `ai/client.ts` factory style, no new abstraction layer. The DeepSeek swap later is a localized edit to one `chat()` function, so no provider interface is built now (would be speculative).

### 1. Coach client + prompt
New dir `backend/src/coach/`:
- `client.ts` — `createCoachClient(apiKey, model)` returning `{ chat(systemPrompt, messages): Promise<string> }`, using the existing `GoogleGenAI` call shape from `backend/src/ai/client.ts`. (When DeepSeek lands, this one function changes — same call site.)
- `prompts.ts` — `COACH_SYSTEM_PROMPT`: "Coach Mali" persona + bilingual rule (reply in the user's language) + a slot for the context summary.
- Add `COACH_MODEL` (default `gemini-3-flash-preview`) + `COACH_TEMPERATURE` (~0.6) to `backend/src/constants.ts`.

### 2. Context assembly (the "rich summary")
`backend/src/services/coach.service.ts` → `buildContext()`, reusing existing services (no new queries):
- `analytics.service.getVolume(14)` → volume-by-muscle.
- `nutrition.service.getDates()` + `getByDate()` over the last 7 dates → macro averages.
- `bodyweight.service.getLogs(14)` → trend.
- `profile.service.get()` → targets.
Render a compact, bounded text block (summarize, don't dump rows). `chat(messages)` = buildContext → system prompt → `coachClient.chat()` → `{ reply }`.

### 3. Route + wiring
- `backend/src/routes/coach.routes.ts` → `POST /api/coach/chat`, body `{ messages: {role, text}[] }` → `{ reply }`. Follow `route-handler.ts` + `lib/validation.ts` pattern.
- Register in `backend/src/app.ts`; instantiate alongside `ai.service` with the same `geminiApiKey` guard.

**Reused:** `ai/client.ts` call shape, `config.service`, `route-handler.ts`, `lib/validation.ts`, `lib/errors.ts`, the four data services above.

---

## Frontend

Port the artifact's React (in-browser Babel, inline styles, custom SVG icons) into the app stack: **React 19 + TS + Tailwind v4 tokens + lucide-react + TanStack Query**. The app is already dark + teal (`--primary` oklch hue 160 ≈ artifact's `#18c08a`), so map the artifact's teal vars → app tokens (`--primary`, `--card`, `--border`, `--muted-foreground`, surface tokens). Use Inter (app font); drop the Newsreader serif or keep only as a small persona accent.

### Files
- `frontend/src/pages/CoachPage.tsx` — top-level (was `directionA.jsx` `DirectionA`): empty-state hero + suggestions + KB entry, or active chat thread.
- `frontend/src/features/coach/`:
  - `components/CoachPersona.tsx` — hero card, **static placeholder** stats (TODO: real insight).
  - `components/ChatThread.tsx`, `ChatInput.tsx`, `Bubble.tsx`, `TypingDots.tsx` (from `coachEngine.jsx`).
  - `components/KnowledgeDrawer.tsx` + `ArticleBody.tsx` (from `directionA.jsx` / `knowledge.jsx`).
  - `data/knowledge.ts` — KB category/article **shape** + a couple seed entries; user fills the rest later.
  - `hooks/useCoach.ts` — replaces faked `useCoach`. Holds messages in React state, sends last N turns via a TanStack Query mutation to `POST /api/coach/chat`, appends the reply. Drop the fake 850ms timer + `buildReply` entirely.
  - `coach.utils.ts` — `isThai` detection (mirror backend), suggestion list.
- `frontend/src/lib/api/coach.ts` — `sendCoachMessage(messages)` using the existing `api-client.ts`; export from `lib/api/index.ts`.

### Integration
- `frontend/src/main.tsx` — add lazy `CoachPage` + `<Route path="/coach" ...>` inside the `<Layout>` block (same Suspense pattern as the other pages).
- `frontend/src/components/Header.tsx` — add `{ name: "Coach", path: "/coach", icon: <lucide, e.g. Sparkles/MessageCircle> }` to `NAV_LINKS`. Desktop + mobile nav pick it up automatically.
- **Discard** the artifact's `TopNav`, `Logo`, `shell.jsx` icon set, and self-rehydrating bundle loader — the app already provides all of this.

**Reused:** `Header.tsx` `NAV_LINKS`, `main.tsx` routing/Suspense pattern, `lib/api-client.ts`, `components/ui/card.tsx`, lucide-react, app theme tokens in `index.css`.

---

## Out of scope (deferred, design stays swappable)
DeepSeek provider impl · DB persistence of conversations · SSE streaming · KB RAG/source citations · real generated daily insight on the persona hero.

---

## Verification
1. Backend: `cd backend && bun run dev`. `curl -X POST localhost:3000/api/coach/chat -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","text":"Am I eating enough protein?"}]}'` → grounded reply referencing real macro/target numbers. Test a Thai prompt → reply in Thai. Test with `GEMINI_API_KEY` unset → clean error, no crash.
2. Frontend: `cd frontend && bun run dev`. Nav shows **Coach**; `/coach` renders hero + suggestions + KB drawer. Send a message → typing dots → real reply. KB drawer opens/browses seed articles. Verify dark/teal styling matches the rest of the app on mobile + desktop.
3. `bun run build` (frontend) + lint pass; backend type-check.
4. On approval, copy this plan to `workout_tracker/docs/` per project convention before implementing.
