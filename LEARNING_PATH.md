# LEARNING_PATH.md

Research topics organized by problem type, discovered during code review and migration of this codebase.

## 1. SQL Aggregation Edge Cases

**Problem found**: PostgreSQL `LATERAL` subquery with `SUM()` but no `GROUP BY` always returns exactly 1 row (with NULL values), even when no rows match the `WHERE` clause. This caused `has_nutrition = true` for dates with zero nutrition data.

**Fix applied**: Added `HAVING COUNT(*) > 0` so the subquery returns 0 rows when empty.

**Research topics**:
- PostgreSQL aggregate behavior on empty sets (returns 1 row with NULLs vs 0 rows)
- `LATERAL JOIN` semantics and when they return phantom rows
- `HAVING` clause as a filter on aggregated results
- Difference between `WHERE`, `HAVING`, and `FILTER` in PostgreSQL
- `COALESCE` vs `HAVING` for handling NULL aggregates

**Resources**:
- https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-LATERAL
- https://www.postgresql.org/docs/current/sql-select.html#SQL-HAVING
- Search: "PostgreSQL SUM empty set returns NULL not zero"


## 2. Boolean Logic Bugs in Conditional Expressions

**Problem found**: Using `||` (OR) instead of `&&` (AND) in range checks like `ratio >= 0.75 || ratio <= 1.25` -- this evaluates to `true` for ANY number, making subsequent branches unreachable.

**Fix applied**: Changed `||` to `&&` in macro color logic.

**Research topics**:
- De Morgan's laws and boolean algebra for range conditions
- Common JavaScript/TypeScript boolean logic pitfalls
- How to unit test boundary conditions in range-based logic
- Static analysis tools that detect always-true/always-false expressions (TypeScript ESLint rules)

**Resources**:
- Search: "JavaScript always true boolean expression range check"
- ESLint rule: `no-constant-binary-expression`


## 3. Silent State Discard (UI Input That Goes Nowhere)

**Problem found**: AddModal had an editable exercise name `<input>` with local `name` state, but the parent's `onSave` callback never received the edited name. User edits were silently discarded.

**Fix applied**: Made the input `readOnly` since the parent doesn't consume name changes.

**Research topics**:
- Controlled vs uncontrolled components in React
- Prop drilling and component API design (what data flows up vs down)
- Form state ownership patterns
- Detecting dead state with TypeScript strict mode and ESLint unused-vars

**Resources**:
- https://react.dev/learn/sharing-state-between-components
- Search: "React component prop design unused state pattern"


## 4. Unconditional Side Effects on Save

**Problem found**: `profile.service.ts` called `insertBodyweightLog()` on every profile save, even when the weight value didn't change. This polluted the bodyweight chart with redundant entries.

**Fix applied**: Compare incoming `weight_kg` against current profile value before logging.

**Research topics**:
- Idempotent API design
- Dirty-checking patterns for form saves
- When to use optimistic updates vs server-side diffing
- Event sourcing vs state snapshotting for tracking changes over time

**Resources**:
- Search: "idempotent API update avoid duplicate side effects"
- Search: "dirty checking form data before save"


## 5. Destructive Actions Without Confirmation

**Problem found**: "Clear Day" button in NutritionPage deleted all nutrition entries for a date with no confirmation dialog.

**Fix applied**: Added `window.confirm()` guard before deletion.

**Research topics**:
- UX patterns for destructive actions (confirm dialogs, undo, soft delete)
- `window.confirm()` vs custom modal dialogs (accessibility, styling)
- Optimistic deletion with undo (toast-based pattern)
- WCAG guidelines for destructive actions

**Resources**:
- https://www.nngroup.com/articles/confirmation-dialog/
- Search: "React undo pattern optimistic delete toast"


## 6. Manual Data Fetching Anti-Patterns (Pre-Migration)

**Problem found**: 9 independent data-fetching sites all using manual `useState` + `useEffect` + `useCallback` patterns. Issues included:
- Race conditions when component unmounts mid-fetch
- No request deduplication (profile fetched in 4 separate places)
- Fragile `refreshTrigger` counter pattern for cache invalidation
- No stale data handling or background refetching

**Fix applied**: Migrated to TanStack Query v5 with `useQuery` / `useMutation` / `useQueryClient`.

**Research topics**:
- TanStack Query v5 fundamentals (queryKey, queryFn, staleTime, gcTime)
- Query key factory pattern for organized cache management
- `useMutation` with `onSuccess` invalidation vs optimistic updates
- Race conditions in React data fetching (`AbortController`, query cancellation)
- React 19 `use()` hook and future of data fetching
- Comparison: TanStack Query vs SWR vs React Router loaders

**Resources**:
- https://tanstack.com/query/latest/docs/framework/react/overview
- https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
- https://tanstack.com/query/latest/docs/framework/react/guides/mutations
- https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
- https://tkdodo.eu/blog/practical-react-query (TkDodo's blog - essential reading)
- Search: "TanStack Query v5 migration guide"


## 7. Server State vs Client State

**Problem found**: `useProfile` hook mixes server state (profile data from API) with client state (form edits). The same `profile` object served both as the cached API response and the live form values, making it unclear when data was "dirty".

**Research topics**:
- Server state vs client state distinction
- Form state management in React (React Hook Form, Formik, or manual)
- `initialData` vs `placeholderData` in TanStack Query
- Derived state and keeping state minimal
- Two-way binding pitfalls in React

**Resources**:
- https://tkdodo.eu/blog/react-query-as-a-state-manager
- Search: "React form state vs server state TanStack Query"


## 8. Drizzle ORM and Type-Safe SQL

**Context**: Backend uses Drizzle ORM with raw SQL via `sql` template literals for complex queries (LATERAL joins, window functions).

**Research topics**:
- Drizzle ORM query builder vs `sql` template literals
- Type-safe SQL with `$inferSelect` and `$inferInsert`
- Drizzle migrations workflow (`generate` → `migrate`)
- PostgreSQL-specific features in Drizzle (array types, JSON, intervals)
- Connection pooling with `postgres.js` driver

**Resources**:
- https://orm.drizzle.team/docs/overview
- https://orm.drizzle.team/docs/sql
- Search: "Drizzle ORM LATERAL JOIN postgres"


## 9. Elysia Framework Patterns

**Context**: Backend uses Elysia with type-safe route definitions and JWT auth middleware.

**Research topics**:
- Elysia lifecycle hooks and middleware (beforeHandle, afterHandle)
- Type-safe validation with `t.Object()` (TypeBox)
- Elysia plugin system and dependency injection
- Static file serving and SPA fallback in Elysia
- Bun runtime performance characteristics vs Node.js

**Resources**:
- https://elysiajs.com/introduction.html
- Search: "Elysia JWT authentication middleware pattern"


## 10. Progressive Web App (PWA) with Vite

**Context**: Frontend converted to PWA using `vite-plugin-pwa` with `injectManifest` strategy.

**What was done**:
- Added `vite-plugin-pwa` with `injectManifest` mode (custom `src/service-worker.ts`)
- Service worker handles precaching, runtime caching (API: NetworkFirst, fonts/images: CacheFirst), and push notifications
- App manifest generated with icons, theme color, standalone display
- Apple-specific meta tags added for iOS support
- `registerSW.js` deferred to avoid render-blocking LCP penalty
- Offline detection banner added in `Layout.tsx`

**Research topics**:
- `generateSW` vs `injectManifest` strategies in vite-plugin-pwa
  - `generateSW`: auto-generated SW, zero config, but no custom logic
  - `injectManifest`: you write the SW, plugin injects `__WB_MANIFEST`, full control
- Service Worker lifecycle: `install`, `activate`, `fetch`, `push`, `notificationclick`
- Workbox runtime: `precacheAndRoute`, `registerRoute`, `NavigationRoute`, strategy plugins
- `navigator.onLine` always returns `true` on localhost — use DevTools Network throttling for offline testing
- Chrome bfcache is disabled when a service worker is active (browser limitation, not a code bug)
- PWA icon requirements: PNG needed for actual install (SVG works for manifest but not all platforms)

**Files involved**:
- `frontend/vite.config.ts` — VitePWA plugin config
- `frontend/src/service-worker.ts` — custom SW with caching + push
- `frontend/src/components/PWAInstallPrompt.tsx` — install banner
- `frontend/src/pages/OfflinePage.tsx` — offline fallback
- `frontend/src/components/Layout.tsx` — offline detection banner

**Resources**:
- https://vite-pwa-org.netlify.app/
- https://developers.google.com/web/tools/workbox/
- https://web.dev/progressive-web-apps/
- https://web.dev/articles/service-worker-lifecycle


## 11. Web Push Notifications

**Context**: Added browser push notifications for workout reminders. Uses `web-push` library on backend + Push API on frontend.

**Architecture**:
```
Browser (SW) <--push-- Backend (web-push) <--cron-- Railway Scheduler
```

**What was done**:
- Backend: installed `web-push`, generated VAPID key pair, created `push_subscriptions` table
- Frontend: custom service worker listens for `push` events, shows native notification via `showNotification()`
- Frontend: `PushNotificationToggle` component (Profile page) requests permission, creates subscription, sends to backend
- Backend: `GET /notifications/config` returns VAPID public key (public endpoint)
- Backend: `POST /notifications/subscribe` saves subscription to DB (public endpoint)
- Backend: `GET /cron/check-notifications` sends push to all subscribers (protected by `CRON_SECRET` header)

**Key decisions**:
- Notification routes are **public** (no JWT) — subscription happens from the browser, no user context needed
- Cron route uses **header-based auth** (`Authorization: Bearer $CRON_SECRET`) instead of JWT — Railway sends this automatically
- Single subscription model (delete old, insert new) — personal use, one device at a time
- VAPID keys stored in `.env`, NOT committed to git

**Trade-offs**:
- `injectManifest` vs `importScripts` for push listener in SW: chose `injectManifest` for type safety and single SW output
- Notification payload is simple JSON (title/body/icon) — no deep linking or action buttons yet
- Cron endpoint sends a test notification currently — real scheduling logic (workout time windows) requires extending `cron.ts`

**Environment variables needed**:
```
VAPID_PUBLIC_KEY=<generated>
VAPID_PRIVATE_KEY=<generated>
VAPID_SUBJECT=mailto:your-email@example.com
CRON_SECRET=<strong-random-string>
```

**Railway cron setup**:
```json
{
  "cron": [{
    "path": "/cron/check-notifications",
    "schedule": "0 6,18 * * *",
    "headers": { "Authorization": "Bearer $CRON_SECRET" }
  }]
}
```

**Files involved**:
- `backend/src/routes/notifications.ts` — config + subscribe endpoints
- `backend/src/routes/cron.ts` — cron trigger endpoint
- `backend/src/repositories/push-subscription.repository.ts` — DB operations
- `backend/src/schema.ts` — `push_subscriptions` table
- `backend/src/config.ts` — VAPID + CRON_SECRET config
- `frontend/src/service-worker.ts` — push event listener
- `frontend/src/components/PushNotificationToggle.tsx` — enable/disable UI

**Resources**:
- https://web.dev/articles/codelab-push-notifications
- https://github.com/web-push-libs/web-push
- https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- https://vite-pwa-org.netlify.app/guide/push-notifications.html


### 11a. Service Worker Precache Failures on Railway (Two-Part Bug)

**Problem**: Service worker failed to install on Railway with two alternating errors:

1. `bad-precaching-response: index.html status 500` — Railway returns 500 when `/index.html` is fetched directly (it only serves it as an SPA fallback for navigation requests)
2. `TypeError: Failed to execute 'put' on 'Cache': Vary header contains *` — Railway's proxy adds `Vary: *` to responses, which causes the browser's native `cache.put()` to throw

**Root cause analysis**:
- Railway's reverse proxy serves static files from the `dist` directory, but `/index.html` returns 500 because Railway's backend (Elysia) intercepts the request first. The SPA fallback only works for navigation requests (Accept: text/html headers), not direct file fetches.
- Railway's proxy layer adds `Vary: *` to responses (likely for CDN cache-busting). The browser's Cache API specification explicitly forbids storing responses with `Vary: *` because they're uncacheable by definition. This is a **hard browser error**, not a warning.
- Workbox's `cacheWillUpdate` plugin hooks run **during** the strategy's `handle()` method, but the precache strategy (`_handleInstall`) calls `cache.put()` on the raw fetch response before the plugin pipeline can modify it. This is a known limitation in workbox-precaching.

**Failed approaches** (what NOT to do):
- `cacheWillUpdate` plugin on precache — runs too late, `cache.put()` already called
- Monkey-patching `Cache.prototype.put` — workbox uses internal caching paths that bypass the prototype
- Filtering `index.html` in the service worker at runtime with `.filter()` on `self.__WB_MANIFEST` — the manifest is already baked in at build time, runtime filtering doesn't prevent the fetch
- Using `workbox.manifestTransforms` in VitePWA config — that property only works with `generateSW` strategy, not `injectManifest`

**Fix — Part 1: Exclude index.html from precache at build time**
```typescript
// vite.config.ts — inside VitePWA config
injectManifest: {
  manifestTransforms: [
    (manifest: any[]) => ({
      manifest: manifest.filter((e) => !e.url.endsWith('index.html')),
      warnings: [],
    }),
  ],
},
```
This removes `index.html` from the precache manifest **before** it reaches the service worker. The `NavigationRoute` with `NetworkFirst` strategy handles it at runtime instead.

**Fix — Part 2: Wrap `self.fetch` to strip `Vary: *`**
```typescript
// service-worker.ts — at the top, before any workbox imports are used
const _originalFetch = self.fetch
self.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return _originalFetch.call(self, input, init).then(async (response) => {
    if (response.headers.get('Vary') === '*') {
      const headers = new Headers(response.headers)
      headers.delete('Vary')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    return response
  })
}
```
This intercepts **every** `fetch()` call in the service worker (including workbox's internal ones) and strips `Vary: *` from responses before they reach `cache.put()`. This is the only approach that works because:
- It runs before workbox sees the response
- It runs before `cache.put()` is called
- It's global — covers precache, runtime caching, and any future fetch calls

**Key lessons**:
- `injectManifest.manifestTransforms` is the correct config path for `injectManifest` strategy (not `workbox.manifestTransforms`)
- `cacheWillUpdate` is useless for `Vary: *` on precache — the error happens at the native Cache API level before the plugin runs
- `self.fetch` wrapping is the nuclear option but the only one that works for this Railway-specific issue
- Always test PWA on the actual deployment platform, not just `npm run preview` — Railway's proxy behavior is unique

**Resources**:
- https://developer.mozilla.org/en-US/docs/Web/API/Cache/put (Vary: * restriction)
- https://github.com/GoogleChrome/workbox/issues/2685 (Vary: * issue in workbox)
- https://vite-pwa-org.netlify.app/guide/inject-manifest.html
- Search: "Railway Vary header service worker cache"


## 12. Auth Security for Single-User Apps (CIA Assessment)

**Context**: Backend uses a single master password + JWT cookie for authentication. No user registration, no multi-tenancy, no role-based access.

**Auth flow**:
1. User enters `MASTER_PASSWORD` on login page
2. Backend validates against env var, signs a JWT with `JWT_SECRET`, sets as `httpOnly` cookie
3. All subsequent `/api` requests require a valid JWT cookie (checked via `onBeforeHandle`)
4. Public routes: `/api/auth/*`, `/notifications/*`, `/cron/*`, static assets, SPA fallback pages

**CIA assessment for personal use**:

| Principle | Status | Notes |
|---|---|---|
| Confidentiality | Adequate | Single password, no data exfiltration vector beyond the API itself |
| Integrity | Adequate | JWT prevents tampering; `httpOnly` cookie prevents XSS token theft |
| Availability | Adequate | No rate limiting (acceptable for single user); password stored in `.env` so recovery is easy |

**Cookie security settings** (correct, do not weaken):
- `httpOnly: true` — JavaScript cannot read the cookie (XSS protection)
- `sameSite: lax` — CSRF protection (only sent on same-site navigation)
- `secure: true` — only sent over HTTPS (production)
- `maxAge: 7 days` — reasonable session duration

**Critical deployment rule**: `JWT_SECRET` must be a random string (32+ chars). The code has a default fallback `"frictionless-tracker-secret-change-me"` in `config.ts` — this is visible in source and **must be overridden** in `.env` for any deployed instance. Never use the default.

**What's NOT needed for personal use**:
- Password hashing (bcrypt) — the password is compared in-memory, never stored
- OAuth / social login — no multi-user context
- 2FA / TOTP — threat model doesn't justify the complexity
- Session rotation / token refresh — 7-day expiry is fine for single user
- Rate limiting — only you can brute-force your own password

**What WAS done**:
- Generated 256-bit `JWT_SECRET` via `openssl rand -hex 32`
- Documented security requirements in `AGENTS.md` under "Security Notes"
- Verified cookie settings are correct

**Files involved**:
- `backend/src/services/auth.service.ts` — login, logout, verify, auth guard
- `backend/src/config.ts` — `masterPassword`, `jwtSecret`, `isAuthEnabled`
- `backend/src/app.ts` — JWT plugin setup, auth guard via `onBeforeHandle`

**Resources**:
- https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#security_considerations
- Search: "OWASP session management cheat sheet"


## 13. React Re-Render Performance (Vercel Best Practices Audit)

**Context**: Applied Vercel React best practices skill to audit the codebase for performance anti-patterns. Found 5 fixable issues across re-render stability, computation memoization, and JS performance.

### 13a. Unstable `useCallback` from `useMutation` Dependencies

**Problem found**: `useWorkoutTracker` and `useNutrition` hooks wrapped mutation calls in `useCallback` with the mutation object as a dependency (e.g., `useCallback(async () => { await parseMutation.mutateAsync(...) }, [parseMutation])`). `useMutation` returns a **new object every render**, so the dependency changes every time — the callback is recreated every render, and every component receiving it as a prop also re-renders.

**Fix applied**: Replaced `useCallback([mutation])` with `useRef` pattern:
```typescript
const parseRef = useRef(parseMutation.mutateAsync);
parseRef.current = parseMutation.mutateAsync;
const parseWorkout = useCallback(async (rawText: string) => {
    return await parseRef.current(rawText);
}, []);  // stable — no dependencies
```
The ref holds the latest `mutateAsync` function, and `useCallback` with `[]` deps produces a stable reference.

**Vercel rules**: `rerender-functional-setstate`, `rerender-memo`

### 13b. Expensive Computation Running on Every Render

**Problem found**: `RecentLogs.tsx` rebuilt the entire workout grouping/sorting logic (Map construction, 3 nested sorts, `new Date()` calls per set) on **every render**, not just when `workouts` changed. With 100+ sets, this creates hundreds of `Date` objects per render.

**Fix applied**: Wrapped the entire computation in `useMemo(() => { ... }, [workouts])` and pre-computed timestamps before sorting instead of calling `new Date()` inside sort comparators:
```typescript
// Before: new Date() called O(n log n) times per sort
.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

// After: timestamp computed once per item
const setsWithTime = sets.map(s => ({ ...s, _ts: new Date(s.created_at).getTime() }));
setsWithTime.sort((a, b) => a._ts === b._ts ? a.id - b.id : a._ts - b._ts);
```

**Vercel rules**: `rerender-derived-state-no-effect`, `js-min-max-loop`, `js-cache-property-access`

### 13c. `useQuery.select` Used for Side Effects

**Problem found**: `useProfile` hook used `useQuery`'s `select` option to call `setProfile()` and `setInitialized(true)` — side effects inside a function that should be pure. `select` runs during render and can cause unexpected re-renders.

**Fix applied**: Moved the state sync into a `useEffect` that watches the query data:
```typescript
// Before: side effect inside select
select: (data) => { if (data && !initialized) { setProfile(...); setInitialized(true); } return data; }

// After: pure query + separate effect
const { data: profileData } = useQuery({ ... });
useEffect(() => {
    if (profileData) setProfile({ ...profileData });
}, [profileData]);
```

**Vercel rules**: `rerender-move-effect-to-event`, `server-serialization`

### 13d. Duplicate `.find()` in JSX Render

**Problem found**: `CalendarHeatmap.tsx` called `monthLabels.find()` twice per week cell (53 cells total): once to check existence, once to read the value.

**Fix applied**: Capture the result in an IIFE:
```typescript
// Before: find() called twice
{monthLabels.find(m => m.col === weekIdx) && (
    <span>{monthLabels.find(m => m.col === weekIdx)!.label}</span>
)}

// After: find() called once
{(() => {
    const found = monthLabels.find(m => m.col === weekIdx);
    return found && <span>{found.label}</span>;
})()}
```

**Vercel rules**: `js-cache-property-access`

### 13e. Date Formatting Without Validation

**Problem found**: All date utility functions (`formatDate`, `formatDateTime`, `formatFullDate`, etc.) called `new Intl.DateTimeFormat().format(new Date(dateStr))` without checking if `dateStr` is valid. When `created_at` is `undefined` or empty, `new Date("")` produces `Invalid Date` (a finite-but-NaN date object), causing `RangeError: date value is not finite in DateTimeFormat format()`.

**Fix applied**: Added guard clauses to every date utility function:
```typescript
export function formatDate(dateStr: string): string {
    if (!dateStr) return "Unknown date";
    const d = new Date(dateStr + "Z");
    if (isNaN(d.getTime())) return "Unknown date";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}
```

### 13f. Service Worker `cacheWillSave` Hook Does Not Exist

**Problem found**: `service-worker.ts` used `cacheWillSave` as a Workbox plugin hook to strip `Vary: *` headers. This is **not a valid Workbox lifecycle hook** — the correct hook is `cacheWillUpdate`. The plugin was never called, causing `Cache.put()` to reject responses with `Vary: *` from Railway's proxy.

**Fix applied**: Renamed `cacheWillSave` to `cacheWillUpdate`.

### 13g. PWA `registerType: 'prompt'` Causing Update Spam

**Problem found**: `registerType: 'prompt'` told Vite PWA to check for service worker updates on every page load, but no prompt UI component consumed the update event. Result: a new service worker installed silently on every refresh.

**Fix applied**: Changed to `registerType: 'autoUpdate'` — the browser's standard HTTP caching controls when the SW updates.

### 13h. Bundle Optimization with `manualChunks`

**Problem found**: A single shared async chunk (`constants-*.js`) bundled recharts (~250 KiB), radix-ui (~150 KiB), and react-query (~50 KiB) together at 496 KiB, all lumped by Vite's default chunking.

**Fix applied**: Added explicit `manualChunks` in `vite.config.ts`:
```typescript
manualChunks: {
    recharts: ['recharts'],
    'radix-select': ['radix-ui'],
    'react-query': ['@tanstack/react-query'],
}
```
Result: 5 independently cacheable vendor chunks (largest: recharts at 112 KiB gzipped).

### 13i. Render-Blocking Google Fonts

**Problem found**: `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` blocked initial render, adding ~780ms to LCP.

**Fix applied**: Changed to non-blocking preload + media swap pattern:
```html
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" as="style" />
<link rel="stylesheet" href="..." media="print" onload="this.media='all'; this.onload=null" />
<noscript><link rel="stylesheet" href="..." /></noscript>
```

### 13j. Static Assets Cache Lifetime Set to 1 Day

**Problem found**: Elysia's `staticPlugin` served content-hashed JS/CSS bundles with only 1-day `Cache-Control`, wasting bandwidth on repeat visits.

**Fix applied**: Added `maxAge: 365 * 24 * 60 * 60` (1 year) to the static plugin config.

**Files involved**:
- `frontend/src/features/workouts/hooks/useWorkoutTracker.ts` — ref-based stable callbacks
- `frontend/src/features/nutrition/hooks/useNutrition.ts` — ref-based stable callbacks
- `frontend/src/features/profile/hooks/useProfile.ts` — useEffect instead of select side-effect
- `frontend/src/components/RecentLogs.tsx` — useMemo + pre-computed timestamps
- `frontend/src/components/CalendarHeatmap.tsx` — single find() call
- `frontend/src/lib/date-utils.ts` — validation guards
- `frontend/src/components/GroupedWorkoutCard.tsx` — validation guard
- `frontend/src/service-worker.ts` — cacheWillUpdate fix
- `frontend/vite.config.ts` — autoUpdate, manualChunks
- `frontend/index.html` — non-blocking fonts
- `backend/src/app.ts` — 1-year maxAge on static files

**Resources**:
- https://vercel.com/docs/concepts/nextjs/optimization (Vercel React best practices)
- https://tanstack.com/query/latest/docs/react/guides/mutations (stable mutation callbacks)
- https://tkdodo.eu/blog/status-and-errors-in-react-query (pure select pattern)
- https://developers.google.com/web/tools/workbox/modules/workbox-build (cacheWillUpdate lifecycle)


## 14. Backend SOLID Principles Refactoring (6-Phase Clean Architecture)

**Context**: Backend code was analyzed for SOLID principle alignment and found to score 6/10. Six major improvement areas were identified: magic values extraction, duplication removal, coupling reduction, testability improvement, error handling enhancement, and comprehensive testing.

**Design approach**: Option A (design first) with phase-by-phase implementation using task-executor for each subtask. Total: 60 tasks across 6 phases, 74 unit tests created.

### 14a. Phase 1 - Foundation (8 tasks, 34 tests)

**What was done**:
- Created `src/constants.ts` — centralized magic values (DEFAULT_WORKOUT_LIMIT=20, ANALYTICS_DEFAULT_DAYS_BACK=7, AUTH_COOKIE_MAX_AGE_SECONDS, etc.)
- Created `src/lib/defaults.ts` — `withWorkoutDefaults()` utility eliminates duplicated `?? 0`, `?? ""`, `?? []`, `?? false` patterns
- Created `src/lib/errors.ts` — type-safe error hierarchy (ValidationError, NotFoundError, UnauthorizedError, ConflictError, ExternalServiceError) with `getErrorMessage()` and `getErrorStatusCode()`
- Created `src/lib/logger.ts` — structured JSON logging with LogLevel enum and `createChildLogger(source)` for contextual logging
- Created `src/lib/route-handler.ts` — `routeHandler` and `routeHandlerCtx` wrappers eliminate repetitive try/catch/ok/fail boilerplate
- Created `src/services/config.service.ts` — injectable config with `ConfigService.fromEnv()` and `ConfigService.forTest()` for testability
- Refactored `src/db/client.ts` — replaced singleton with `createDatabaseClient(databaseUrl)` factory

**Key pattern**: Factory Pattern throughout — no singletons, all dependencies injectable.

**Research topics**:
- Factory pattern vs Singleton for testability
- Dependency Injection without a framework (manual composition root)
- Structured logging vs console.log (JSON output, log levels, context propagation)
- Error type hierarchies in TypeScript (discriminated unions vs class inheritance)

### 14b. Phase 2 - Repository Layer (10 tasks, 12 new tests, total 46)

**What was done**:
- Refactored all 8 repositories to factory pattern: `createXxxRepository(dbInstance)`
  - workout.repository.ts (11 methods: getRecent, getByDate, getDates, create, update, delete, createBatch, getDistinctExercises, getByExercise, getRecentNotes)
  - analytics.repository.ts (2 methods: getHeatmap, getVolume)
  - bodyweight.repository.ts (2 methods: insert, getAll)
  - rest-day.repository.ts (2 methods: upsert, delete)
  - profile.repository.ts (3 methods: ensure, get, update)
  - nutrition.repository.ts (6 methods: insertBatch, update, getByDate, getDates, deleteItem, deleteByDate)
  - history.repository.ts (1 method: getDates)
  - push-subscription.repository.ts (3 methods: save, getAll, delete)
- Updated `src/db/mappers.ts` to use `defaultNumber()`, `defaultString()`, `defaultBoolean()`, `defaultArray()` from defaults.ts
- Added backward-compatible deprecated exports with JSDoc `@deprecated` tags

**Key pattern**: Repositories accept `PostgresJsDatabase` instance, return typed methods. No direct `db` import inside repository files.

### 14c. Phase 3 - AI Layer (8 tasks, 15 new tests, total 59)

**What was done**:
- Split `src/ai.ts` (4.5 KB monolith) into modular files:
  - `src/ai/prompts.ts` — `WORKOUT_SYSTEM_PROMPT` extracted as constant
  - `src/ai/normalizers.ts` — `normalizeWorkoutItem()` using `withWorkoutDefaults()`
  - `src/ai/client.ts` — `createWorkoutAIClient()` factory with `AIClient` interface
- Split `src/nutrition-ai.ts` (4.3 KB monolith) into modular files:
  - `src/nutrition-ai/prompts.ts` — `NUTRITION_SYSTEM_PROMPT` extracted
  - `src/nutrition-ai/normalizers.ts` — `normalizeNutritionItem()`, `normalizeMeal()`, `roundTo1()`
  - `src/nutrition-ai/client.ts` — `createNutritionAIClient()` factory
- Created `src/services/ai.service.ts` — `AIService` facade that wraps GoogleGenAI with `ExternalServiceError` handling and API key validation

**Key pattern**: AI clients are pure factories. Service facade handles error translation and logging.

**Files deleted**: `src/ai.ts`, `src/nutrition-ai.ts` (replaced by modular directories)

### 14d. Phase 4 - Service Layer (9 tasks, 15 new tests, total 74)

**What was done**:
- Created 7 domain services, each with factory pattern:
  - `src/services/workout.service.ts` — 11 methods: create, createBatch, parse, confirmSession, update, delete, getRecent, getByDate, getDates, getByExercise, getRecentNotes. Includes validation and AI integration.
  - `src/services/analytics.service.ts` — getHeatmap, getVolume. Uses constants for defaults (DEFAULT_WORKOUT_LIMIT, ANALYTICS_DEFAULT_DAYS_BACK).
  - `src/services/bodyweight.service.ts` — log, getAll. Structured logging via `createChildLogger("bodyweight-service")`.
  - `src/services/rest-day.service.ts` — upsert, delete. Logging included.
  - `src/services/nutrition.service.ts` — parse, log, getByDate, getDates, update, deleteItem, deleteByDate.
  - `src/services/history.service.ts` — getDates query.
  - `src/services/profile.service.ts` — get, update, auto-log bodyweight on weight change.
- **Critical fix**: `ProfileService` accepts `BodyweightService` as dependency instead of importing bodyweight repository directly — eliminates cross-domain coupling.
- Refactored `src/services/auth.service.ts` to use `ConfigService` instead of direct config import. Added `authLoginBodySchema` to interface.

**Key pattern**: Services accept their repositories + cross-service dependencies as constructor/factory parameters. Single Responsibility per service.

### 14e. Phase 5 - Route Layer (9 tasks)

**What was done**:
- Refactored all 9 route files to use `routeHandler`/`routeHandlerCtx` wrappers:
  - `src/routes/workouts.routes.ts` — 315→114 lines (64% reduction)
  - `src/routes/analytics.routes.ts` — uses `ctx.analyticsService`
  - `src/routes/bodyweight.routes.ts` — uses `ctx.bodyweightService`
  - `src/routes/rest-days.routes.ts` — uses `ctx.restDayService`
  - `src/routes/profile.routes.ts` — uses `ctx.profileService` from context
  - `src/routes/nutrition.routes.ts` — uses `ctx.nutritionService`, includes update endpoint
  - `src/routes/history.routes.ts` — uses `ctx.historyService`
  - `src/routes/notifications.ts` — structured logging, factory pattern
  - `src/routes/cron.ts` — structured logging, factory pattern
- Replaced all direct repo imports with service calls from `AppContext`
- Replaced scattered `console.log` with structured JSON logging
- Used constants instead of magic values throughout
- Created `src/context.ts` with `AppContext` interface

**Key pattern**: Routes receive `AppContext` with all services. No direct repo access from routes. Route handlers are pure functions wrapped by `routeHandlerCtx`.

### 14f. Phase 6 - Wiring, Bootstrap & Cleanup (8 tasks)

**What was done**:
- Created `createAppContext(db, config)` factory in `src/context.ts` — builds entire dependency graph (repos → AI service → domain services → AppContext)
- Simplified `src/app.ts` to accept `AppContext` parameter — removed inline service creation (120+ lines eliminated)
- Updated `src/index.ts` with new bootstrap pattern:
  ```typescript
  const config = ConfigService.fromEnv();
  const db = createDatabaseClient(config.databaseUrl);
  await createProfileRepository(db).ensure();
  const ctx = createAppContext(db, config);
  const app = createApp(ctx).listen(config.port);
  ```
- Updated `src/config.ts` to re-export from ConfigService (backward compatibility with `@deprecated` tags)
- **Removed deprecated `src/db.ts` barrel file** (67 lines of re-exports)
- **Cleaned up 28 deprecated functions** across 8 repository files (getRecentWorkouts, insertWorkouts, ensureProfileRow, etc.)
- **Deleted legacy files**: `src/ai.ts`, `src/nutrition-ai.ts`
- Removed unused `db` imports from all repository files
- Fixed `seed_bodyweight.ts` to use factory pattern
- Added `authLoginBodySchema` to AuthService interface

**Final state**:
- **74 unit tests pass** across 18 test files
- **TypeScript compiles cleanly** (no errors)
- **App boots successfully** — health endpoint responds, auth protects API routes
- **Zero deprecated exports remaining** — all backward compat code removed
- **Factory pattern throughout** — no singletons, all dependencies injectable

### 14g. Architecture Improvements Summary

| Principle | Before | After |
|---|---|---|
| **Single Responsibility** | ai.ts handled prompts, parsing, normalization | Split into prompts.ts, normalizers.ts, client.ts |
| **Open/Closed** | Hardcoded magic values, required editing functions | Constants.ts + defaults, extendable via config |
| **Liskov Substitution** | No interfaces, concrete types only | Service interfaces (AuthService, etc.) for mocking |
| **Interface Segregation** | Monolithic route handlers | routeHandler/routeHandlerCtx wrappers |
| **Dependency Inversion** | Direct `db` imports, global state | Factory injection via AppContext |
| **Testability** | Singletons, global state, console.log | Factory pattern, structured logging, 74 tests |
| **Error Handling** | `as ApiError` type assertions | Type-safe error hierarchy with getErrorMessage() |
| **Magic Values** | Scattered literals (50, 7, "", 0, []) | Centralized in constants.ts |
| **Code Duplication** | `?? 0`, `?? ""`, `?? []` in 20+ places | withWorkoutDefaults() utility |
| **Cross-Domain Coupling** | ProfileService imported bodyweight repo | ProfileService uses BodyweightService |

**Files created**: 25+ new files (constants, defaults, errors, logger, route-handler, 7 services, 6 AI modules, context, config.service)
**Files refactored**: 17 files (8 repos, 9 routes, app.ts, index.ts, config.ts, db/client.ts, mappers.ts, auth.service.ts)
**Files deleted**: 3 files (db.ts barrel, ai.ts, nutrition-ai.ts)
**Lines reduced**: workouts.routes.ts 315→114, app.ts reduced by 120+ lines, 28 deprecated functions removed
**Tests added**: 74 unit tests across 18 files (0 → 74)


## 15. React Query `initialData` Preventing Refetches on Query Key Change

**Problem found**: In `useAnalyticsData.ts`, changing `selectedExercise` via the dropdown did not trigger a React Query refetch. The query key changed correctly (confirmed via `queryKeys.analytics.exerciseData(exercise, range)`), but no network request was made.

**Root cause**: `initialData: []` on both `exerciseData` and `notes` queries. When a new query key is created (new exercise selection), `initialData` immediately provides `[]` as cached data. React Query sees "I already have data for this query" and doesn't fetch from the server (within the `staleTime: 30_000` window).

**Key insight**: `enabled: !!effectiveExercise` was working correctly — the query was enabled. The bug was that `initialData` tricked React Query into thinking it already had fresh data. The `useMemo` on `analyticsData` was for computation optimization, not for triggering fetches — React Query handles everything through the query key alone (no `useEffect` or `useMemo` on `selectedExercise` needed).

**Fix applied**:
```typescript
// Before: initialData prevented fetches
const { data: analyticsData } = useQuery({
    queryKey: queryKeys.analytics.exerciseData(effectiveExercise, selectedRange),
    enabled: !!effectiveExercise,
    initialData: [],  // ← BUG: provides cached [] immediately
});

// After: always fetch on mount
const { data: analyticsData } = useQuery({
    queryKey: queryKeys.analytics.exerciseData(effectiveExercise, selectedRange),
    enabled: !!effectiveExercise,
    refetchOnMount: "always",  // ← ensures fetch every time component mounts
});
const workouts = analyticsData ?? [];  // null coalescing for type safety
```

Also added `key={selectedExercise}` to the exercise `<Select>` component in `AnalyticsPage.tsx` to force React to re-mount the controlled component on exercise change.

**Files involved**:
- `frontend/src/features/analytics/hooks/useAnalyticsData.ts` — removed initialData, added refetchOnMount
- `frontend/src/pages/AnalyticsPage.tsx` — added key prop to Select

**Resources**:
- https://tanstack.com/query/latest/docs/framework/react/guides/initial-query-data
- https://tkdodo.eu/blog/react-query-and-type-script (initialData typing)
- Search: "React Query initialData prevents fetch on new query key"


## 16. React StrictMode Double-Rendering in Production

**Problem found**: Editing `HistoryPage.tsx` caused duplicate API requests (visible in Network tab as both `service-worker` and `index-BrVGB` requests). This was React StrictMode's intentional double-mount behavior.

**Root cause**: `main.tsx` wrapped the entire app in `<StrictMode>` unconditionally — it was rendered in both development and production. In development, StrictMode mounts→unmounts→remounts to catch side effects. In production, React strips the double-rendering side effects, so StrictMode becomes a no-op. However, keeping StrictMode in production is unnecessary overhead.

**Fix applied**: Conditional wrapping based on environment:
```typescript
const app = (<QueryClientProvider>...</QueryClientProvider>)

if (import.meta.env.DEV) {
  createRoot(document.getElementById('root')!).render(<StrictMode>{app}</StrictMode>)
} else {
  createRoot(document.getElementById('root')!).render(app)
}
```

Railway automatically sets `NODE_ENV=production`, which Vite translates to `import.meta.env.DEV = false`.

**Files involved**:
- `frontend/src/main.tsx` — conditional StrictMode

**Resources**:
- https://react.dev/reference/react/StrictMode
- Search: "React StrictMode production overhead"


## 17. Vite `manualChunks` Causing Unnecessary Module Preloading

**Problem found**: First Contentful Paint was 5.6s. Build output showed `recharts` (420 KB), `react-query` (44 KB), and `radix-select` (72 KB) as separate chunks via `manualChunks`. The generated `index.html` included `<link rel="modulepreload">` for ALL of them in the `<head>`, forcing the browser to download ~536 KB before rendering anything.

**Root cause**: When you define `manualChunks`, Vite creates separate chunks AND adds `modulepreload` links for them in the HTML `<head>` on every page load, even if the chunks are only used by lazy-loaded pages. This defeats the purpose of code splitting.

**Fix applied**: Removed `manualChunks` entirely. Let Vite handle code splitting automatically. Vite's default behavior only loads chunks when the lazy-loaded page is actually visited — no `modulepreload` in the HTML.

**Before** (with manualChunks):
```html
<script src="/assets/index.js"></script>
<link rel="modulepreload" href="/assets/recharts.js">     ← 420 KB, downloaded immediately
<link rel="modulepreload" href="/assets/react-query.js">   ← 44 KB, downloaded immediately
<link rel="modulepreload" href="/assets/radix-select.js">  ← 72 KB, downloaded immediately
```

**After** (without manualChunks):
```html
<script src="/assets/index.js"></script>
<!-- recharts/react-query loaded only when Analytics/Profile page is visited -->
```

~139 KB saved on initial load.

**Files involved**:
- `frontend/vite.config.ts` — removed manualChunks

**Resources**:
- https://vitejs.dev/guide/build#chunking-strategy
- Search: "Vite manualChunks modulepreload LCP impact"


## 18. Static File Cache Headers for FCP/LCP Optimization

**Problem found**: Lighthouse reported 389 KiB of wasted cache potential — JS/CSS files had no `Cache-Control` headers, causing browsers to re-download them on every visit.

**Root cause**: Elysia's `@elysiajs/static` plugin was configured with `maxAge: 0` (no caching), justified as "so service worker updates are always detected."

**Important caveat**: The static plugin's `maxAge` and `headers` options are **global** — they apply to ALL files, including `index.html`. Caching `index.html` for 1 year would be disastrous (users would never see new JS/CSS references). The solution requires per-file-type cache control.

**@elysiajs/static v1.4.7 limitations**: No `cacheControl` callback exists in this version. Available options: `maxAge` (global seconds), `directive` (global Cache-Control directive), `headers` (static record).

**Fix applied — two static plugin instances**:
```typescript
// Hashed assets (JS/CSS) — 1-year cache, filenames change when content changes
.use(staticPlugin({
  assets: "./public/assets",
  prefix: "/assets",
  maxAge: 60 * 60 * 24 * 365,
  directive: "immutable",
  etag: true,
  alwaysStatic: true,
}))
// Root files (index.html, manifest, icons) — no cache
.use(staticPlugin({
  assets: "./public",
  prefix: "/",
  maxAge: 0,
  etag: true,
  ignorePatterns: ["assets/**"],
}))
```

SPA fallback routes (`/analytics`, `/profile`, etc.) serve `index.html` via `Bun.file()` with explicit `Cache-Control: public, max-age=0, must-revalidate` headers.

**On repeat visits**: Browser uses cached JS/CSS → 750ms CSS blocking becomes 0ms.

**Files involved**:
- `backend/src/app.ts` — two static plugin instances + SPA fallback cache headers

**Resources**:
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
- https://elysiajs.com/plugins/static


## 19. Cumulative Layout Shift (CLS) from Auth Loading State

**Problem found**: CLS score of 0.577 (good is < 0.1). The main culprit (0.481) was the auth check loading spinner — `Layout.tsx` rendered just a centered spinner during `isCheckingAuth`, then replaced it with the full page (Header + content + PWAInstallPrompt) when auth completed.

**Root cause**: The page structure changed dramatically between the loading state (tiny spinner, most of screen empty) and the authenticated state (full layout). This caused a massive layout shift.

**Fix applied**: Render the full page skeleton during auth check — same structure (Header, content area, PWAInstallPrompt, background glow) with just the spinner centered in the content area. The page layout is already in place before auth completes, so there's no shift.

**Secondary fix**: `CalendarHeatmap.tsx` loading skeleton only had a title placeholder, while the real version has header + stats row (current streak, longest streak, total days). Updated the skeleton to include stat placeholders matching the real header's height.

**Files involved**:
- `frontend/src/components/Layout.tsx` — full skeleton during auth check
- `frontend/src/components/CalendarHeatmap.tsx` — enhanced loading skeleton with stats placeholders

**Resources**:
- https://web.dev/articles/cls
- Search: "React loading skeleton CLS layout shift"


## 20. Database Indexes Missing for Time-Range Queries

**Problem found**: API response times were 2-3 seconds: `/api/heatmap` at 2,778ms, `/api/workouts` at 2,425ms. Lighthouse showed these as the longest critical path latency.

**Root cause**: Missing database indexes on `workouts.created_at` and `rest_days.created_at`. Both queries performed full table scans:
- `/api/heatmap`: `WHERE created_at >= now() - interval '365 days'` + `GROUP BY DATE(created_at)` — no index, scans entire workouts table
- `/api/workouts`: `ORDER BY created_at DESC` — no index, requires filesort

**Fix applied**: Added 3 B-tree (unclustered) indexes via Drizzle schema:
```typescript
// schema.ts
export const workouts = pgTable("workouts", { ... }, (table) => [
    index("workouts_created_at_idx").on(table.created_at),       // speeds up heatmap + list
    index("workouts_exercise_name_idx").on(table.exercise_name), // speeds up analytics
]);
export const restDays = pgTable("rest_days", { ... }, (table) => [
    index("rest_days_created_at_idx").on(table.created_at),     // speeds up heatmap
]);
```

Generated migration: `drizzle/0005_sweet_whirlwind.sql`

**Expected impact**: 2,778ms → ~50-100ms for heatmap and workouts queries.

**Why unclustered (regular) indexes**: PostgreSQL only allows ONE clustered index (the primary key). Regular B-tree indexes are separate structures that point to rows — perfect for time-range queries without reordering the table. Drizzle's `index()` creates unclustered B-tree indexes by default.

**To apply on Railway**: Run `bun run src/migrate.ts` in the deployed environment.

**Files involved**:
- `backend/src/schema.ts` — added index definitions
- `backend/drizzle/0005_sweet_whirlwind.sql` — generated migration

**Resources**:
- https://orm.drizzle.team/docs/indexes
- https://www.postgresql.org/docs/current/indexes.html
- Search: "PostgreSQL index created_at timestamp range query performance"
