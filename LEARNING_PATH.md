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
