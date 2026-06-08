# DeepSeek Implementation Prompt — Unify Date Pickers

> Companion to `unify-date-picker-plan.md`. Paste the block below to DeepSeek.
> After it implements, hand the diff back to Claude to review.

---

```
You are implementing a frontend refactor in an existing React 19 + Vite +
Tailwind v4 app (TypeScript, strict). Follow existing code style; match the
newer components (src/pages/CoachPage.tsx,
src/features/coach/components/KnowledgeEditorDrawer.tsx) which use Tailwind
theme CSS vars. react-day-picker is already a dependency.

GOAL
Unify date selection on react-day-picker. Create ONE shared DatePicker
component and use it on the three surfaces that currently use native date
inputs. Do NOT touch NutritionPage.

CONTEXT (read first)
- src/pages/NutritionPage.tsx — reference: `DateStrip` (~line 81) uses
  <DayPicker mode="single"> in a popover with outside-click/Escape close and
  --rdp-* CSS vars. Local helpers toYMD (~line 43), fromYMD, shiftYMD. Imports
  `react-day-picker/style.css`. LEAVE THIS FILE UNCHANGED — reference only.
- src/components/WorkoutInput.tsx — home. State `workoutDate` is a
  datetime-local string "YYYY-MM-DDTHH:mm" (see getLocalDateTimeNow). The date
  input is `<input type="datetime-local" ...>` (~line 74).
- src/components/RestDayForm.tsx — `<input type="date" value={date}>` (~line 47),
  `date` is "YYYY-MM-DD".
- src/pages/ProfilePage.tsx — `<input type="date" value={bodyweightDate}>`
  (~line 146).
- Theme vars to use: var(--foreground), var(--border), var(--card),
  var(--muted-foreground), var(--primary).

TASKS

1. New helper file src/lib/date.ts — timezone-safe (avoid UTC off-by-one):
   export const toYMD = (d: Date) =>
     `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
   export const fromYMD = (s: string) => {
     const [y,m,d] = s.split("-").map(Number);
     return new Date(y, m-1, d);   // LOCAL midnight
   };

2. New component src/components/DatePicker.tsx:
   Props: { value: string /* "YYYY-MM-DD" */, onChange: (ymd: string) => void,
            id?: string, className?: string }
   - A trigger button (Tailwind themed, calendar icon from lucide-react) showing
     the formatted date, e.g. fromYMD(value).toLocaleDateString("en-US",
     { weekday:"short", day:"numeric", month:"short", year:"numeric" }).
   - On click, toggle a popover (absolute, high z-index, themed with var(--card)/
     var(--border)) containing:
       <DayPicker mode="single" selected={fromYMD(value)}
         defaultMonth={fromYMD(value)}
         onSelect={(d) => { if (d) { onChange(toYMD(d)); setOpen(false); } }} />
   - Close on outside mousedown (ref) and Escape — mirror DateStrip's effect.
   - import "react-day-picker/style.css"; and set the same --rdp-* CSS vars
     DateStrip uses, mapped to the theme so the calendar matches (dark + accent).

3. RestDayForm.tsx — replace the native date input with:
   <DatePicker value={date} onChange={setDate} />
   Keep everything else (date stays "YYYY-MM-DD"; submit unchanged).

4. ProfilePage.tsx — replace the bodyweight native date input with:
   <DatePicker value={bodyweightDate} onChange={setBodyweightDate} />

5. WorkoutInput.tsx — keep the date+time value "YYYY-MM-DDTHH:mm":
   - derive datePart = workoutDate.slice(0,10), timePart = workoutDate.slice(11,16).
   - Render side by side:
       <DatePicker value={datePart}
         onChange={(ymd) => setWorkoutDate(`${ymd}T${timePart}`)} />
       <input type="time" value={timePart}
         onChange={(e) => setWorkoutDate(`${datePart}T${e.target.value}`)}
         className={/* themed, small, matching the old date input */} />
   - Keep getLocalDateTimeNow() for initial state and post-submit reset.
   - onSubmit still receives the combined "YYYY-MM-DDTHH:mm" — backend unchanged.

CONSTRAINTS
- Do NOT modify NutritionPage.tsx or any backend code/data format.
- Simplest code that works; match existing patterns; no new dependencies.
- Strict TS, timezone-safe date handling (no off-by-one on selected day).

DELIVERABLE
src/lib/date.ts, src/components/DatePicker.tsx, and the three edited files.
Run `bunx tsc --noEmit` (frontend) — must be clean.
```
