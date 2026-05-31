# Plan: Retrieval-Grounded Nutrition Logging (pgvector RAG over food catalog)

## Context

**Problem / friction.** Daily flow today: eat → know grams/ml/units → **manually look up per-food macros in a Google Sheet** (the Sheet is filled by the separate `nutrition_ocr` Telegram bot: photo → Mistral OCR → Gemini → Sheet row). That manual lookup is the friction.

**Current parse behavior (corrected):** the in-app parse does NOT invent macros — if you give it per-gram/per-serving numbers it builds the JSON from those; otherwise it leaves macros empty. The RAG step fills that gap automatically: instead of you supplying the numbers or leaving them empty, the catalog supplies the real label numbers and the LLM only scales them.

**Goal.** Log a meal by typing only **food + amount** ("2 lidl eggs, 100g miso, 150ml milk"). System embeds the phrase → **pgvector cosine search** against an embedded food catalog → LLM picks the matching food + scales by the eaten amount → writes the diary. No manual Sheet lookup. Macros come from real labels, not guesses.

**Architecture stance (confirmed earlier):** keep `nutrition_ocr` as a **separate capture pipeline**. The catalog lives in workout_tracker's **existing Railway Postgres** with `pgvector` — no new vector DB.

**Decisions (confirmed with user):**
- Embeddings = **Gemini `text-embedding-004`** (768-dim, free tier) via existing `@google/genai`.
- Vector store = **existing Railway Postgres + pgvector** (not Neon, not Chroma).
- Low-confidence match → **flagged "uncertain" in the review modal** (no invented macros).

---

## Verified infra
- DB = Postgres via `postgres` npm + drizzle. Dev `DATABASE_URL` = localhost; prod = **Railway**. `backend/src/db/client.ts`, `backend/drizzle.config.ts`, `backend/src/migrate.ts`.
- **No pgvector yet** — needs `CREATE EXTENSION vector` (enable on BOTH local + Railway).
- `@google/genai` v1.42 supports `embedContent` (unused today; `generateContent` only).
- `nutrition_logs` = diary only (free-text `food_name`, scaled macros). **No catalog table.**
- Reusable experiments (TS, standalone): `nutrition_chroma_sandbox/src/document.ts` (food→doc text), `…/04-rag-prompt.ts` (resolve+scale RAG prompt). Port these, swap Chroma→pgvector + MiniLM→Gemini embeddings.

---

## Architecture

### 1. pgvector + migration
- New migration (`backend/drizzle/0007_*.sql`): `CREATE EXTENSION IF NOT EXISTS vector;`
- Drizzle: `embedding: vector('embedding', { dimensions: 768 })` + HNSW index `vector_cosine_ops`.
- **Prereq/risk:** confirm the Railway Postgres image supports `vector`; if the managed plugin lacks it, switch to a pgvector-enabled Postgres image. Verify before shipping.

### 2. `food_catalog` table (`backend/src/schema.ts`)
Matches the user's catalog record shape (= sandbox `foods.json`):
```
id           text PRIMARY KEY   -- slug, e.g. "personal-kikkoman-teriyaki"
name         text               -- "Kikkoman Sauce teriyaki"
brand        text               -- "Kikkoman"
product_type text               -- "sauce"
per_amount   real               -- 100
per_unit     text               -- "g" | "ml" | "serving" | "piece"
calories     real
protein      real
carbs        real
fat          real
source       text               -- "google_sheet" | "ocr" | "manual"
source_row_id text              -- "row_12"  (dedup / upsert key)
embedding    vector(768)
created_at / updated_at timestamp
```
Upsert key = `id` (slug); `source_row_id` ties back to the Sheet row for dedup. Macros are **per `per_amount` `per_unit`** (e.g. per 100g) — scaling happens at parse time, not stored.

### 3. Embedding client (`backend/src/embeddings/client.ts`, new)
Reuse `@google/genai` + existing API key. `embedText(text): number[768]` via `ai.models.embedContent({ model: 'text-embedding-004', contents })`. Document text mirrors sandbox `document.ts`, built from the record: `name + brand + product_type + "per {per_amount}{per_unit}: {cal}kcal P{p} C{c} F{f}"`.

### 4. Catalog repo + service
`backend/src/repositories/food-catalog.repository.ts` + `backend/src/services/food-catalog.service.ts`, wired in `backend/src/context.ts` + `AppContext`:
- `upsert(food)` — embed document → insert/update with vector.
- `search(query, k=CATALOG_TOPK)` — embed query → `SELECT …, embedding <=> $1 AS distance ORDER BY distance LIMIT k`; return rows + cosine distance.

### 5. Catalog sync — manual button, incremental, idempotent
**Trigger = a "Sync catalog" button in the app** (confirmed). One pull-sync path covers both first load and ongoing updates; re-running is safe.

- **Sheet reader** (`backend/src/food-catalog/sheet-source.ts`): read the Sheet via **Google Sheets API** using a service account (same credentials the `nutrition_ocr` bot already uses — `GOOGLE_CREDENTIALS_JSON` / service account JSON). Map each row → catalog record (`name`←item, `per_amount`/`per_unit`←serving+unit, macros, `source='google_sheet'`, `source_row_id`←sheet row index; `id` = slug from brand+name; `brand`/`product_type` inferred by LLM or null).
- **Sync route** `POST /food-catalog/sync` (`backend/src/routes/food-catalog.routes.ts`): read all Sheet rows → **diff by `source_row_id`** against existing catalog → for each NEW row only: embed document + `upsert`. Returns `{ added, skipped }`. **Idempotent** — already-synced rows are skipped, so embeddings aren't recomputed.
- **No bot change, no Sheets API at scan time.** Catches both bot-written rows AND rows you add to the Sheet by hand. Sheet stays the capture surface; Railway Postgres `food_catalog` is the queryable/embedded mirror.
- First run = the backfill (button just syncs everything since the catalog is empty). Later: cron can call the same route with zero rework if you ever want it automatic.

### 6. Retrieval-grounded parse (extend nutrition flow)
Extend/replace `/nutrition/parse` (`backend/src/routes/nutrition.routes.ts`, `nutrition.service.ts`, `nutrition-ai/`):
1. Split meal note into items (amounts only) — reuse existing parse or a light LLM split.
2. Per item: `foodCatalogService.search(itemPhrase, 3)` → candidates.
3. **LLM resolve + scale** (port `nutrition_chroma_sandbox/04-rag-prompt.ts`): given item + top-3 candidates → choose candidate `id` or `"uncertain"`; scale macros by eaten amount vs candidate `per_amount`/`per_unit` (e.g. ate 150g of a per-100g food → ×1.5); **never invent**. Output per item: `{ food_name, matched_id|null, uncertain, protein, carbs, fat, calories }`.
4. Return to `NutritionReviewModal` → uncertain items highlighted; user confirms/edits → existing confirm path inserts `nutrition_logs`.

### 7. Frontend (`frontend/src/`)
- `features/nutrition/hooks/useNutrition.ts` + `components/NutritionReviewModal.tsx`: carry `uncertain` + `matched` fields; badge + inline edit for uncertain items; optionally show which catalog item matched. Logging input stays a free-form textarea (`NutritionPage.tsx`).
- **"Sync catalog" button** on `NutritionPage.tsx` → `POST /food-catalog/sync`; show `{ added, skipped }` result (e.g. "12 new foods added"). New `coachApi`-style `foodCatalogApi.sync()` in `frontend/src/lib/api/`.

### Constants (`backend/src/constants.ts`)
`EMBED_MODEL = 'text-embedding-004'`, `EMBED_DIM = 768`, `CATALOG_TOPK = 3`, `UNCERTAIN_DISTANCE = 0.35` (cosine, tune).

---

## Reuse (don't reinvent)
- `nutrition_chroma_sandbox/src/document.ts` (doc text), `04-rag-prompt.ts` (resolve+scale prompt) → port to backend.
- Existing nutrition repo/service/route, `NutritionReviewModal`, `useNutrition`, `@google/genai` client config, context.ts wiring pattern.

## Cost / tokens
Embeddings free tier. Catalog embedded once + per new food. Queries embed only short item phrases. LLM resolve sees only top-3 candidates → small prompt.

---

## Implementation order
1. pgvector extension + migration + `food_catalog` schema (local + Railway).
2. Embeddings client + catalog repo/service + context wiring.
3. Sheet reader + `POST /food-catalog/sync` (incremental by `source_row_id`) + "Sync catalog" button.
4. Retrieval-grounded parse endpoint + ported RAG prompt.
5. Frontend uncertain handling in review modal.

## Verification
- Enable `vector`; generate+run migration; confirm `embedding` column + HNSW index on Railway DB (and local).
- Press "Sync catalog" → reads Sheet → `{ added: N, skipped: 0 }` on first run; `SELECT count(*) FROM food_catalog`; spot-check embeddings non-null.
- Press "Sync catalog" **again** → `{ added: 0, skipped: N }` (idempotent, no re-embed). Add a Sheet row → sync → `added: 1`.
- `search('lidl egg')` → egg row top-1, low distance; junk string → high distance (> threshold).
- Parse "2 lidl eggs and 100g miso" → P ≈ 15 (eggs) + 11 (miso) from **catalog** numbers, not LLM guess; an unmatched item flagged `uncertain`.
- Review modal shows uncertain badge; confirm writes `nutrition_logs`.
- No second source-of-truth: catalog reads only from `food_catalog`; Sheet is capture/backup.

---

## Implementation notes (as built)

**Status: built + typechecked + unit-tested locally. 82 backend tests pass; grounding logic has 5 dedicated tests. Full HTTP stack verified (login → `/api/food-catalog/count` → pgvector).**

Deviations from the plan, and why:
- **Resolve step is deterministic, not a per-item LLM call.** Missing-macro items are grounded by nearest catalog vector within `CATALOG_UNCERTAIN_DISTANCE` (0.35 cosine), scaled by `amount / per_amount`. No confident match → `uncertain` flag; unit mismatch → also `uncertain`. Cheaper, no extra LLM round-trip, fully unit-testable. An LLM disambiguation pass over the top-3 can be layered on later if nearest-match proves too blunt.
- **Sheet reader uses `google-auth-library`** (already a transitive dep) for service-account auth + the Sheets REST API via `fetch` — no new heavy dependency, no hand-rolled JWT.
- **Grounding is wired into the existing `/nutrition/parse`** (not a separate endpoint). It's a guarded no-op: if the catalog is empty or grounding throws, it returns the raw parse unchanged, so the existing flow never breaks.

Files added: `backend/src/embeddings/client.ts`, `backend/src/repositories/food-catalog.repository.ts`, `backend/src/services/food-catalog.service.ts`, `backend/src/food-catalog/{sheet-source,sync,grounding}.ts`, `backend/src/routes/food-catalog.routes.ts`, `backend/drizzle/0007_elite_wasp.sql`, `frontend/src/lib/api/food-catalog.ts`. Modified: schema, constants, config, context, app, nutrition service/routes/types, NutritionPage, NutritionReviewModal.

## Deploy checklist (Railway — needs real credentials not present locally)
1. **pgvector on Railway Postgres**: ensure the instance supports the `vector` extension. Migration `0007` runs `CREATE EXTENSION IF NOT EXISTS vector;` first; if the managed image lacks pgvector, switch to a pgvector-enabled Postgres image.
2. **Apply migration**: run the normal migration path against Railway (`bun run src/migrate.ts`). NOTE: the **local** DB was managed via `drizzle-kit push` (empty migration journal), so `0007` was applied directly with `psql`. Confirm Railway's journal is consistent before running migrate, or apply `0007` directly there too.
3. **Backend env vars** (new): `GOOGLE_SHEETS_ID`, `GOOGLE_CREDENTIALS_JSON` (the same service-account JSON the `nutrition_ocr` bot uses). `GEMINI_API_KEY` must be a valid key (local `.env` has a placeholder, so embeddings/search can't be exercised locally).
4. **First sync**: press **Sync catalog** on the Nutrition page → embeds + upserts all Sheet rows. Then test a meal parse with amounts only.
