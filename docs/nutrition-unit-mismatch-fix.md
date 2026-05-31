# Nutrition grounding: separate unit-mismatch from no-match + live gram recompute

## Problem

`grounding.ts` overloads one `uncertain` flag for two unrelated cases:

1. **No confident catalog match** — vector distance > threshold (genuine).
2. **Confident match but unit differs** — e.g. logged "1 slice"/"200g" vs catalog
   per "100g"/"200ml". Match is good, but `unit !== per_unit` flips `uncertain`.

UI (`NutritionReviewModal`) has only one `uncertain` flag, so case 2 shows the
case-1 message **"No confident catalog match"** — misleading. Two observed bugs:

- `200g` milk vs catalog `200ml`: macros are correct (scale 1) yet flagged "no match".
- `1 slice` bread vs catalog per `100g`: old `scale = amount / per_amount = 1/100`
  → 0.1g protein, 2 kcal garbage.

## Decisions (from user)

- **Separate flags.** `uncertain` = no confident match only. New `unit_mismatch`
  = matched but unit incompatible → "verify amount", NOT "no match".
- **g ≈ ml** (food density ≈ 1). Metric mass/volume family is interchangeable;
  no warning when both sides metric.
- **Discrete units** (slice, can, serving, piece): true grams unknown. Seed
  `scale = count` (1 unit ≈ 1 catalog serving), flag `unit_mismatch`. Good for
  John West tuna "1 can" ≈ 100g; over-estimates bread slice, but user edits grams.
- **Live recompute.** Ship catalog basis to client; editing the amount re-scales
  macros linearly so the user fixes "1 slice" → "38 g" and numbers update.

## Plan

1. **`backend/src/food-catalog/grounding.ts`**
   - Add metric unit table (g/kg/ml/l/oz/lb → grams; g≡ml).
   - Scale: both metric → `eatenG / baseG`, `unit_mismatch=false`; same literal
     unit → `amount / per_amount`, false; else discrete → `scale = amount`, true.
   - Keep distance branch as the only setter of `uncertain`.
   - Attach `catalog` basis `{ per_amount, per_unit, protein, carbs, fat }` to
     matched items for client recompute.
   - verify: `bun test grounding`.

2. **`backend/src/types.ts`** — add to `NutritionItem`: `unit_mismatch?`,
   `catalog?: { per_amount; per_unit; protein; carbs; fat }`.

3. **`backend/tests/unit/food-catalog/grounding.test.ts`** — update the
   "unit mismatch" test: expect `unit_mismatch=true`, `uncertain` falsy, macros
   scaled (not zero). Add g-vs-ml compatible case (no flag, scale 1).

4. **`frontend/src/components/NutritionReviewModal.tsx`**
   - Editable amount input; on change, if `item.catalog`, recompute
     `scale = amount / catalog.per_amount`, macros = base × scale, calories.
   - Split caption: `uncertain` → existing red "No confident match"; else
     `unit_mismatch` → amber "✓ From catalog: X — logged {amount}{unit}, catalog
     per {per_amount}{per_unit}. Verify amount."; else green ✓.
   - Warning icon for `uncertain || unit_mismatch || has_missing_macros`.
   - Match existing tokens (glass-input, amber-400, emerald-400, surface-*).

## Follow-up: zero-macro matches from bad sheet parsing

Symptom: "Heck Chicken Chipolatas" matched green ✓ but macros 0/0/0.

Root cause: sheet macro cells carry units ("11g"). Old `num()` did
`Number("11g")` → NaN → fallback 0, stored 0 in pgvector.

Fix:
- **`sheet-source.ts` `num()`** — extract first numeric token via regex, so
  "11g"→11, "2.5 g"→2.5, "200 kcal"→200, "trace"→0.
- **`sync.ts` + route** — add `refresh` flag (`POST /food-catalog/sync?refresh=true`)
  that bypasses `source_row_id` dedup and re-embeds/upserts every row. Needed
  because incremental sync skips already-synced rows, so the bad 0-macro rows
  won't self-heal otherwise.
- **`tests/unit/food-catalog/sheet-source.test.ts`** — covers unit-suffixed cells.

Action required (manual, prod): run `POST /food-catalog/sync?refresh=true` with
`GOOGLE_SHEETS_ID` + `GOOGLE_CREDENTIALS_JSON` set, to rewrite existing rows.

Upstream: the nutrition_ocr bot should also cleanse "11g"→11 at write time;
the parser fix here is defensive.

## Success criteria

- `bun test` green.
- 200g vs 200ml → green ✓, correct macros, no warning.
- 1 slice bread → matched, amber "verify amount", editing to 38g recomputes.
- Genuine no-match (distance > 0.5) → still red "No confident catalog match".
