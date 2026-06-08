# DeepSeek Implementation Prompt — Editable Coach Knowledge

> Companion to `editable-coach-knowledge-plan.md`. Paste the block below to
> DeepSeek to implement. After it implements, hand the diff back to Claude to
> review.

---

```
You are implementing a feature in an existing TypeScript monorepo (backend: Bun
+ Elysia + Drizzle ORM on Neon Postgres; frontend: React 19 + Vite + TanStack
Query + Tailwind). Single-user app, no auth. Follow the existing code style and
patterns exactly — match the neighboring files, do not introduce new
abstractions or dependencies.

GOAL
Make the AI coach's knowledge base editable from the UI (currently a static
markdown file requiring a redeploy to change). Store it as free-form titled
markdown sections in the DB; read fresh on every coach call.

CONTEXT (read these first)
- backend/src/coach/knowledge.md      — current static doc (becomes seed data)
- backend/src/coach/prompts.ts        — loadCoachKnowledge() reads the file +
                                        caches forever; buildCoachSystemPrompt /
                                        buildPlanSystemPrompt consume `knowledge`
- backend/src/services/coach.service.ts — calls loadCoachKnowledge() in chat
                                        (~L246) and plan (~L278)
- backend/src/repositories/coach-plan.repository.ts — repo pattern to mirror
- backend/src/routes/coach.routes.ts  — route pattern (routeHandler /
                                        routeHandlerCtx + Elysia `t` validators)
- backend/src/schema.ts               — Drizzle tables (see coach_plan, profile)
- backend/scripts/seed-coach-plan.ts  — seed-script pattern to mirror
- frontend/src/lib/api/coach.ts       — API client
- frontend/src/pages/CoachPage.tsx and frontend/src/features/coach/* — UI
- NOTE: frontend already ships react-markdown + remark-gfm. Use them. Do NOT add
  tiptap or any rich-text editor dependency.
- LEAVE the existing KnowledgeDrawer.tsx / data/knowledge.ts ALONE — that is a
  separate read-only KB-articles feature, unrelated to this work.

TASKS

1. Schema — add to backend/src/schema.ts:
   coach_knowledge table: id serial pk, title text notNull, body text default ''
   notNull (markdown), position integer default 0 notNull, updated_at timestamp
   defaultNow. Add an index on position. Generate + run the Drizzle migration.

2. Repository — backend/src/repositories/coach-knowledge.repository.ts mirroring
   coach-plan.repository.ts:
   list() ordered by position asc; create({title, body}) appends at end
   (position = max+1 or count); update(id, {title, body}); delete(id);
   reorder(ids: number[]) sets position by array index.

3. Knowledge load — replace loadCoachKnowledge() so it reads from the DB instead
   of the file, and REMOVE the cachedKnowledge module cache + Bun.file read.
   Build the string as: sections.map(s => `# ${s.title}\n\n${s.body}`).join("\n\n").
   Keep buildCoachSystemPrompt / buildPlanSystemPrompt unchanged. The two callers
   in coach.service.ts keep working (just inject the DB-backed loader — move the
   function to the service or repo if cleaner, but keep behavior identical).

4. Routes — add to backend/src/routes/coach.routes.ts, same style as /coach/plan:
   GET    /coach/knowledge          -> list sections
   POST   /coach/knowledge          -> body { title, body } add
   PUT    /coach/knowledge/:id      -> body { title, body } edit
   DELETE /coach/knowledge/:id      -> delete
   PUT    /coach/knowledge/reorder  -> body { ids: number[] } reorder
   Add matching coachService methods wrapping the repo.

5. Seed — backend/scripts/seed-coach-knowledge.ts mirroring seed-coach-plan.ts.
   Idempotent: if coach_knowledge is empty, insert one row
   { title: "Training doc", body: <full contents of knowledge.md>, position: 0 }.
   Skip if rows already exist.

6. Frontend API — add to frontend/src/lib/api/coach.ts: listKnowledge,
   addKnowledge, updateKnowledge, deleteKnowledge, reorderKnowledge.

7. Frontend UI — a new editor surface (drawer or page) reachable from CoachPage,
   SEPARATE from KnowledgeDrawer. It:
   - lists sections (title, collapsible body),
   - add / delete / reorder (move up/down) sections,
   - per-section editor: a <textarea> for markdown beside a live preview rendered
     with react-markdown + remark-gfm; Save calls update.
   - uses TanStack Query for fetch + mutations + cache invalidation, matching the
     existing coach hooks.

CONSTRAINTS
- Simplest code that works. No speculative abstraction. Match existing patterns.
- No new npm dependencies.
- Do not break the existing coach chat / plan flows.
- Keep knowledge.md in the repo as the seed source (it becomes dead after seeding).

DELIVERABLE
The migration, seed script, backend repo/routes/service changes, frontend API +
editor UI. Then: editing a section in the UI and saving means the next coach
reply uses the new text — no redeploy.
```
