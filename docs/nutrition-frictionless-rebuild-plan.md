# Nutrition Page — Frictionless Rebuild Plan

Rebuild `frontend/src/pages/NutritionPage.tsx` to match the **Frictionless**
design (`Nutrition.html` handoff bundle from claude.ai/design), wired to the
real backend. Adds **water tracking** as a new feature.

Design source extracted to `/tmp/design/workout-tracker/project/coach/`
(`nutritionApp.jsx`, `nutritionParts.jsx`, `nutritionMeals.jsx`,
`nutritionData.jsx`, `shell.jsx`). Recreate the visuals; do not copy the
mock's fake data layer.

## Decisions locked (via grill-me)

- **Scope:** full visual rebuild, but keep all real features the mock omits
  (AI parse → review modal, item edit, catalog sync, delta-vs-yesterday badges).
- **Water rules:** follow the design — glasses capped at goal, draft + explicit
  Save button (dirty state), slider + glass icons + `+`/`−` steppers.
- **Water goal:** new Profile field `water_target_glasses`, default **10** (2.5L).
- **Calorie ring goal:** `profile.calories_intake`.
- **Macro recolor:** scoped to this page only — protein green (unchanged),
  carb `#36b9d6` (blue), fat `#ef6f5e` (coral). Water teal `#2dd4bf`.
- **No serif font** (design used Newsreader on the date-strip month label — use
  regular weight instead).
- **Drop the design's "Frictionless" TopNav/Logo** — keep the app's existing
  `Layout`/`Header`.

## Backend (Elysia + Drizzle)

1. `src/schema.ts`:
   - New `waterLogs` table: `id serial pk`, `date text notNull unique` ("YYYY-MM-DD"),
     `glasses integer default 0 notNull`, `created_at timestamp defaultNow`.
   - Add to `profile`: `water_target_glasses integer default 10`.
2. `drizzle-kit generate` → migration `0009`.
3. New `src/repositories/water.repository.ts` — `getByDate(date)`, `upsert(date, glasses)`.
4. New `src/services/water.service.ts` — get/set, validation (glasses ≥ 0).
5. New `src/routes/water.routes.ts` — `GET /water?date=`, `POST /water {date, glasses}`.
   Register in `src/context.ts` + route index (mirror nutrition wiring).
6. Profile service/route validation + `ProfilePage.tsx`: editable
   `water_target_glasses` field alongside macro targets.

## Frontend

- **Types** (`src/types`): water response type; extend profile type with
  `water_target_glasses`.
- **API** (`src/lib/api.ts`): `waterApi.getByDate(date)`, `waterApi.set(date, glasses)`.
- **Hook**: `useWater(date)` (or extend `useNutrition`) — query by date + save mutation
  with React Query invalidation.
- **Rebuild `NutritionPage.tsx`** to the design layout:
  - `PageHeader` — h1 "Nutrition" + subtitle + real Sync-catalog button.
  - `DateStrip` — 7-day strip, prev/next week, date-picker popover, "Jump to today";
    drives `selectedDate`. Regular weight month label (no serif).
  - **Summary row** (2-col grid):
    - Card: `CalorieRing` (tick gauge; goal = `calories_intake`,
      consumed = `summary.totalCalories`, center shows kcal left/over) +
      `MacroBars` (recolored; keep `DeltaBadge` vs yesterday).
    - `WaterCard` — design exact; goal from `profile.water_target_glasses`.
  - `AIInput` — textarea + send → real `parseText` → `NutritionReviewModal`;
    "Add a food manually" → `AddFoodModal` → real `confirmItems`.
  - **Food log** — `MealSection` cards (`ColHead` + `FoodRow`, hover-remove);
    keep item **edit**; keep Clear-day.
  - `Toast` for save feedback.
  - New macro/teal colors scoped to this page (local CSS vars or inline hex),
    not global tokens.

## Out of scope

- App-wide theme/token changes (recolor is nutrition-page only).
- Serif font, design's TopNav/branding, the design's tweaks panel.
