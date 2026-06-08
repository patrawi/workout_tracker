# Editable Coach Knowledge from UI

## Problem

The coach's knowledge base lives in `backend/src/coach/knowledge.md` — a static
markdown file shipped beside the code. `loadCoachKnowledge()` reads it once with
`Bun.file(...)` and caches it forever in memory (`cachedKnowledge`). Editing any
text (e.g. the forearm note at `knowledge.md:213`) requires a code change and a
redeploy.

Goal: edit the knowledge base from the app UI, no redeploy.

## Decisions (resolved via grill-me)

- **Storage:** new `coach_knowledge` DB table (Neon Postgres). Multi-row,
  free-form titled sections. Follows the existing single-user pattern (no auth,
  no `user_id` — same as `coach_plan` / `profile`).
- **Structure:** free-form `{ title, body }` sections the user creates / edits /
  deletes / reorders. `body` is markdown.
- **Cache:** drop the forever in-memory cache. Read the DB on each coach call —
  the doc is tiny (a few KB).
- **Assembly:** concatenate all sections (`title` + `body`) in `position` order
  into the one KNOWLEDGE BASE block the prompt already expects. `prompts.ts`
  prompt-building is unchanged.
- **Editor:** textarea + live `react-markdown` preview. Stores markdown. Zero
  new frontend deps (`react-markdown` + `remark-gfm` already shipped). NOT a
  rich-toolbar WYSIWYG / tiptap.
- **Seed:** one section — title `"Training doc"`, body = the whole current
  `knowledge.md`. User splits/renames into sections in the UI afterward.
- **Access:** none. Single-user app.

## Schema

New table in `backend/src/schema.ts`:

```ts
// ——— Coach Knowledge Table (the user's editable training doc, in sections) ———
export const coachKnowledge = pgTable("coach_knowledge", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").default("").notNull(),     // markdown
    position: integer("position").default(0).notNull(),
    updated_at: timestamp("updated_at", { mode: "string" }).defaultNow(),
}, (table) => [
    index("coach_knowledge_position_idx").on(table.position),
]);
```

## Backend

- **Repository** `backend/src/repositories/coach-knowledge.repository.ts`
  (mirror `coach-plan.repository.ts`): `list()` (order by position), `create()`,
  `update(id, {title, body})`, `delete(id)`, `reorder(orderedIds)`.
- **`loadCoachKnowledge()`** (currently in `prompts.ts`, file-based): replace
  with a DB-backed load. Query all sections by position, build:
  `sections.map(s => \`# ${s.title}\n\n${s.body}\`).join("\n\n")`.
  Remove the `cachedKnowledge` module cache and the `Bun.file` read.
  - The two existing callers in `coach.service.ts` (`chat` ~L246-252, plan
    ~L278-295) keep calling `loadCoachKnowledge()` — only its body changes.
    Easiest: move it to the service/repo and inject, or keep the function name
    but have it query the DB.
- **Routes** in `backend/src/routes/coach.routes.ts`:
  - `GET    /coach/knowledge`        → list sections
  - `POST   /coach/knowledge`        → `{ title, body }` add (append at end)
  - `PUT    /coach/knowledge/:id`    → `{ title, body }` edit
  - `DELETE /coach/knowledge/:id`    → delete
  - `PUT    /coach/knowledge/reorder`→ `{ ids: number[] }` set positions
  - Use the existing `routeHandler` / `routeHandlerCtx` + Elysia `t` validators,
    same style as the `/coach/plan` routes.
- **Service** methods on `coachService` wrapping the repo calls.
- **Seed script** `backend/scripts/seed-coach-knowledge.ts` (mirror
  `seed-coach-plan.ts`): if the table is empty, insert one row
  `{ title: "Training doc", body: <contents of knowledge.md>, position: 0 }`.
  Idempotent — skip if rows already exist.

## Frontend

- **API client** `frontend/src/lib/api/coach.ts`: `listKnowledge`,
  `addKnowledge`, `updateKnowledge`, `deleteKnowledge`, `reorderKnowledge`.
- **New editor surface** on the Coach page — a drawer or page, SEPARATE from the
  existing `KnowledgeDrawer` (that one renders read-only `KB_ARTICLES`, a
  different concern; leave it alone).
  - List of sections (title + collapsed body).
  - Add section, delete section, move up/down (reorder), edit.
  - Editor per section: a `<textarea>` for markdown on one side, a live
    `react-markdown` (+ `remark-gfm`) preview on the other. Save → `PUT`.
  - Use `@tanstack/react-query` (already used) for fetch + mutations +
    invalidation, matching the existing coach data hooks.

## Migration / cleanup

- Run the Drizzle migration to create `coach_knowledge`.
- Run the seed script once.
- `backend/src/coach/knowledge.md` stays in the repo as the seed source, then is
  dead code after first seed. DB is the source of truth from then on.

## Result

Edit the forearm note (or anything) in the UI → Save → the next coach reply uses
the new text. No redeploy.
