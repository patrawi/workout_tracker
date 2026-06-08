# Unify Date Pickers on react-day-picker

## Problem

Date UI is inconsistent across the app:

| Surface | Current | Format |
| --- | --- | --- |
| Home — `components/WorkoutInput.tsx` | native `<input type="datetime-local">` | `YYYY-MM-DDTHH:mm` (date **+ time**) |
| `components/RestDayForm.tsx` | native `<input type="date">` | `YYYY-MM-DD` |
| `pages/ProfilePage.tsx` (bodyweight date) | native `<input type="date">` | `YYYY-MM-DD` |
| `pages/NutritionPage.tsx` | **react-day-picker** (inline `DateStrip`) | `YYYY-MM-DD` |

Goal: all surfaces use react-day-picker for a consistent look.

## Decisions (resolved)

- **Home time-of-day:** keep it. Date via the shared react-day-picker + a small
  native `<input type="time">` beside it; recombine into the existing
  `YYYY-MM-DDTHH:mm` timestamp. No data-shape change.
- **Scope:** extract ONE shared `DatePicker` (button trigger + popover calendar)
  and use it in `RestDayForm`, `ProfilePage`, `WorkoutInput`. **Leave
  `NutritionPage` as-is** — it already uses day-picker (its `DateStrip` has a
  week-strip + logged-date dots we don't want to regress).
- **Styling:** Tailwind theme vars (`--foreground`, `--border`, `--card`,
  `--muted-foreground`, `--primary`) to match the newer components
  (CoachPage, KnowledgeEditorDrawer) — NOT NutritionPage's inline-style vars.
- **Implementation:** DeepSeek implements from the prompt; Claude reviews.

## New shared component

`frontend/src/components/DatePicker.tsx`

```tsx
interface DatePickerProps {
  value: string;                 // "YYYY-MM-DD"
  onChange: (ymd: string) => void;
  id?: string;
  className?: string;            // for the trigger button
}
```

Behavior:
- Trigger button shows the formatted date (e.g. `Mon, 8 Jun 2026`), Calendar icon.
- Click → popover with `<DayPicker mode="single" selected={fromYMD(value)}
  defaultMonth={fromYMD(value)} onSelect={d => d && onChange(toYMD(d))} />`,
  then close.
- Close on outside-click + Escape (reuse the pattern from `DateStrip` in
  NutritionPage: `mousedown` listener on a ref + `keydown` Escape).
- `import "react-day-picker/style.css";` (CSS dedupes; already imported by
  NutritionPage). Set the same `--rdp-*` CSS vars DateStrip uses, mapped to the
  Tailwind theme so the calendar matches.
- Popover styled with Tailwind theme vars + absolute positioning + high z-index.

## Date helpers

`frontend/src/lib/date.ts` (new) — exported, **timezone-safe** (avoid the
classic UTC off-by-one):

```ts
export const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromYMD = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);   // LOCAL midnight, not UTC
};
```

(NutritionPage keeps its own local copies — out of scope. Optional later cleanup
to import from here.)

## Per-surface changes

### RestDayForm.tsx
Replace the `<input type="date" value={date} onChange=...>` with
`<DatePicker value={date} onChange={setDate} />`. `date` stays `YYYY-MM-DD`.
No other logic changes; submit still sends `date`.

### ProfilePage.tsx
Replace the bodyweight `<input type="date" value={bodyweightDate} ...>` with
`<DatePicker value={bodyweightDate} onChange={setBodyweightDate} />`.

### WorkoutInput.tsx
`workoutDate` is `YYYY-MM-DDTHH:mm`. Split into date + time:
- date part = `workoutDate.slice(0, 10)`, time part = `workoutDate.slice(11, 16)`.
- Render `<DatePicker value={datePart} onChange={ymd => setWorkoutDate(`${ymd}T${timePart}`)} />`
  beside a `<input type="time" value={timePart}
  onChange={e => setWorkoutDate(`${datePart}T${e.target.value}`)} />`.
- Keep `getLocalDateTimeNow()` for the initial value and the post-submit reset.
- The combined string handed to `onSubmit` stays `YYYY-MM-DDTHH:mm` — backend
  unchanged.

## Out of scope
- NutritionPage `DateStrip` (untouched).
- Backend / data formats (unchanged everywhere).

## Verify
1. `bunx tsc --noEmit` clean (frontend).
2. Home: pick a past date + a time → parse a workout → review modal shows that
   date/time; saved `created_at` matches (no TZ off-by-one).
3. RestDayForm: pick date → submit → correct date stored.
4. ProfilePage: pick bodyweight date → save → correct date.
5. NutritionPage still works unchanged.
6. Calendar visual matches app theme (dark, accent colors).
