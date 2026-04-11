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
