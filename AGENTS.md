# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Project Overview

A workout tracking app with AI-powered workout text parsing (mixed Thai/English input). Users enter free-text workout descriptions, Google Gemini parses them into structured data, and the user reviews/confirms before saving. Also tracks nutrition, bodyweight, rest days, and provides analytics.

## Tech Stack

- **Runtime**: Bun (not Node.js)
- **Backend**: Elysia framework on Bun, PostgreSQL via Drizzle ORM (`postgres.js` driver)
- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS v4, React Router v7, Recharts, Radix UI
- **AI**: Google Gemini (`@google/genai`) for parsing workout text
- **Deployment**: Railway via Dockerfile

## Build & Run Commands

### Backend (run from `backend/`)
```bash
bun install                          # Install dependencies
bun run src/index.ts                 # Start the API server (port 3000)
bun run src/migrate.ts               # Run Drizzle migrations
bunx drizzle-kit generate            # Generate new migration from schema changes
bunx drizzle-kit migrate             # Apply migrations
```

### Frontend (run from `frontend/`)
```bash
bun install                          # Install dependencies
bun run dev                          # Start Vite dev server (proxies /api to localhost:3000)
bun run build                        # TypeScript check + Vite production build (tsc -b && vite build)
bun run lint                         # ESLint
```

### Docker (from repo root)
```bash
docker build -t workout-tracker .    # Builds backend + frontend, copies frontend/dist into backend/public
```

## Architecture

### Backend (`backend/src/`)

Layered architecture with clear separation:

- **`index.ts`** - Entry point: loads env, ensures profile row exists, starts Elysia server
- **`app.ts`** - Elysia app setup: CORS, JWT auth, cookie, static file serving, SPA fallback routes, `/api` group with auth guard. All API routes are under `/api` prefix
- **`config.ts`** - Centralized env config (`DATABASE_URL` required; `MASTER_PASSWORD`, `JWT_SECRET`, `GEMINI_API_KEY` optional)
- **`schema.ts`** - Single Drizzle schema file defining all PostgreSQL tables: `sessions`, `workouts`, `profile`, `rest_days`, `bodyweight_logs`, `nutrition_logs`
- **`db.ts`** - Re-exports from `db/client.ts` and all repository functions (acts as a barrel/facade)
- **`db/client.ts`** - Drizzle + postgres.js client initialization
- **`ai.ts`** - Gemini integration for parsing free-text workouts into structured `WorkoutData[]`
- **`nutrition-ai.ts`** - Gemini integration for parsing nutrition text
- **`routes/`** - Elysia route handlers (workouts, analytics, bodyweight, rest-days, profile, nutrition, history)
- **`repositories/`** - Database queries (one file per domain entity)
- **`services/`** - Business logic (`auth.service.ts` handles JWT auth with optional master password, `profile.service.ts`)

**Auth flow**: Authentication is optional. If `MASTER_PASSWORD` env var is set, all `/api` routes (except `/api/auth/*`) require a valid JWT cookie. Login validates against the master password.

**AI parsing flow**: Raw text -> `POST /api/workouts/parse` -> Gemini AI -> structured JSON array -> returned to frontend for human review -> `POST /api/workouts/confirm` saves to DB.

### Frontend (`frontend/src/`)

- **`main.tsx`** - React Router setup with lazy-loaded pages wrapped in `Layout`
- **`App.tsx`** - Home page: workout input, review modal, recent logs, calendar heatmap, rest day form
- **`context/AuthContext.tsx`** - Auth state provider
- **`features/`** - Domain-organized hooks and logic (analytics, nutrition, profile, workouts)
- **`pages/`** - Route pages: AnalyticsPage, DailyWorkoutPage, HistoryPage, NutritionPage, ProfilePage
- **`components/`** - Shared UI components; `ui/` subdirectory has Radix-based primitives
- **`lib/api-client.ts`** - Typed fetch wrapper; all API calls go through `api.get/post/put/patch/del`
- **`lib/api/`** - Per-domain API functions (workouts.ts, nutrition.ts, etc.)

**Path alias**: `@` maps to `frontend/src/` (configured in vite.config.ts)

### Dev proxy

Vite dev server proxies `/api` requests to `http://localhost:3000` with path rewriting (strips `/api` prefix). During development, run both the backend and the Vite dev server.

### Database

PostgreSQL with Drizzle ORM. Schema in `backend/src/schema.ts`, migrations in `backend/drizzle/`. The `profile` table is a singleton (id always = 1, ensured on startup).

### Environment Variables

Required: `DATABASE_URL`
Optional: `PORT` (default 3000), `MASTER_PASSWORD`, `JWT_SECRET`, `GEMINI_API_KEY`

For web push notifications: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`

Bun auto-loads `.env` files, but the project also uses `dotenv/config` imports.

### Security Notes

**Auth model**: Single-user master password + JWT cookie. No user registration or multi-tenancy.
- `MASTER_PASSWORD` — the only credential; set to a strong value in production
- `JWT_SECRET` — must be a random string (min 32 chars); **never use the default fallback**
- JWT cookie is `httpOnly`, `sameSite: lax`, `secure: true` — correct settings, do not weaken
- `/api/notifications/*` and `/cron/*` are public by design (browser subscription + cron health check)
- `/cron/check-notifications` uses `Authorization: Bearer $CRON_SECRET` header for auth
- `backend/.env` is gitignored — never commit secrets

**Deployment checklist**:
- Rotate all secrets: `JWT_SECRET`, `MASTER_PASSWORD`, `CRON_SECRET`, `GEMINI_API_KEY`
- Set `VAPID_SUBJECT` to a real email (required by web push spec)
- Never use default `JWT_SECRET` — the code has a fallback string that is visible in source

## Conventions

- Use `bun` for all runtime/package operations, not `npm`/`node`
- Backend uses Elysia's type-safe route definitions with `t.Object()` schemas
- Frontend uses `@` path alias for imports from `src/`
- The app handles bilingual content (Thai/English) in workout notes

## Performance & Architecture Notes

### React Query patterns
- **No `useMemo`/`useEffect` needed on query dependencies** — React Query automatically refetches when the `queryKey` changes. The query key **is** the dependency array.
- **Avoid `initialData: []`** — it provides cached data immediately and prevents fetches on new query keys. Use `refetchOnMount: "always"` + `?? []` null coalescing instead.
- **`useMemo` on query results** is only for expensive derived computations, not for triggering fetches.

### Vite code splitting
- **Don't use `manualChunks`** for lazy-loaded page dependencies. Vite's default chunking works better — `manualChunks` causes Vite to add `modulepreload` links for ALL chunks in the HTML `<head>`, defeating code splitting.
- Let Vite handle chunking automatically. Only use `manualChunks` if you have a specific CDN caching requirement.

### Static file caching (Elysia + @elysiajs/static)
- The plugin's `maxAge` and `headers` options are **global** — apply to ALL files including `index.html`.
- For per-file cache control, use **two plugin instances**: one for `/assets/` (hashed files, 1-year cache) and one for root files (index.html, no cache).
- `alwaysStatic: true` pre-registers all routes for faster matching.
- SPA fallback routes serving `index.html` via `Bun.file()` need explicit `Cache-Control` headers set via `set.headers`.

### React StrictMode
- StrictMode is conditionally wrapped in `main.tsx` — only active in development (`import.meta.env.DEV`).
- In production, StrictMode is skipped. No double-rendering.

### CLS (Cumulative Layout Shift) prevention
- Loading states should render the **same page skeleton** as the loaded state — same Header, same content area structure, same footer.
- Never render just a centered spinner that gets replaced by a full page layout.
- Skeleton cards should match the height and structure of the real content they replace.

### Database indexes
- Drizzle migrations are applied via `bun run src/migrate.ts` on Railway.
- Add indexes via the third argument of `pgTable` (the callback form): `(table) => [index("name").on(table.column)]`
- Always use regular (unclustered) B-tree indexes — PostgreSQL only allows one clustered index (the primary key).
- Current indexes: `workouts_created_at_idx`, `workouts_exercise_name_idx`, `rest_days_created_at_idx`, `nutrition_logs_date_idx`
