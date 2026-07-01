# Nutrition Alcohol Domain Notes

## Context

The nutrition model currently stores protein, carbs, fat, and calories. Calories are treated as derivable from protein, carbs, and fat:

```text
calories = protein_g * 4 + carbs_g * 4 + fat_g * 9
```

Beer and other alcoholic drinks can have label calories that are not explained by protein, carbs, and fat because alcohol contributes energy.

## Decision 1: Alcohol Is A First-Class Macro

Alcohol intake should be represented as grams of alcohol alongside protein, carbs, fat, and calories.

```text
calories = protein_g * 4 + carbs_g * 4 + fat_g * 9 + alcohol_g * 7
```

Example: Birra Moretti Premium Lager

```text
label calories = 167 kcal
protein ~= 1 g
carbs ~= 13 g
fat = 0 g
alcohol ~= 16 g

1 * 4 + 13 * 4 + 0 * 9 + 16 * 7 = 168 kcal
```

## Decision 2: Alcohol Is Visible But Has No Goal

Alcohol should be shown as a normal consumed macro in nutrition item rows and daily totals.

Alcohol should not have a target or goal in the profile. It is tracked as intake, not optimized as a daily objective.

## Decision 3: Infer Alcohol From Calorie Gap For Alcoholic Drinks

When a nutrition label gives total calories but does not give alcohol grams, the parser should estimate alcohol grams from the unexplained calorie gap if the item is clearly alcoholic.

```text
alcohol_g = (label_calories - (protein_g * 4 + carbs_g * 4 + fat_g * 9)) / 7
```

This reflects common beer labels in the UK and many other countries: carbohydrate may be listed, while alcohol grams are not.

The inference should be guarded by item identity. A normal food with mismatched label calories should not automatically gain alcohol grams.

## Decision 4: Preserve Label Calories When Provided

When a label provides total calories, saved `calories` should preserve the label calories after scaling to the consumed amount.

Macro-derived calories should be used only when label calories are missing.

For example, a 440 ml beer label with per-100-ml values should be processed as:

```text
label calories = 38 kcal * 4.4 = 167.2 kcal
known calories = protein_g * 4 + carbs_g * 4 + fat_g * 9
alcohol_g = (167.2 - known calories) / 7
saved calories = 167.2 kcal
```

The LLM should extract raw label facts and consumed amount. Deterministic code should scale the facts and infer alcohol from the calorie gap.

## Decision 5: Treat Trace Alcohol-Drink Macros As Zero

For alcoholic drinks, bounded tiny label values such as `<0.1 g fat`, `<0.01 g saturates`, or `<0.1 g sugars` should be treated as `0` for calorie-gap inference.

This avoids creating fake macro calories from label threshold notation and keeps inferred alcohol closer to the real product.

## Decision 6: Detect Alcohol With A Deterministic Word Pool

The system should decide whether an item is alcoholic using a deterministic word pool matched against extracted item text, not probabilistic LLM reasoning and not calorie gap alone.

Initial matching terms should include common English and Thai alcohol words such as:

```text
beer, lager, ale, cider, stout, ipa, wine, prosecco, champagne,
vodka, gin, whisky, whiskey, rum, tequila, cocktail,
เบียร์, ไวน์, เหล้า
```

For example, `เบียร์ Birra Moretti Premium Lager` should trigger alcohol inference through both `เบียร์` and `lager`.

Normal foods should not gain alcohol grams simply because their label calories do not exactly match protein, carbs, and fat.

## Decision 7: Persist Alcohol Grams

The `nutrition_logs` table should store alcohol as grams, alongside protein, carbs, fat, and calories.

This preserves the explanation for label calories that are not represented by protein, carbs, and fat, and allows daily totals, history views, edits, and future analytics to show alcohol consistently.

```text
nutrition_logs:
protein
carbs
fat
alcohol
calories
```

## Decision 8: LLM Extracts, Code Computes

The existing AI pipeline already separates probabilistic extraction from deterministic normalization:

- `backend/src/ai/*` extracts workout JSON and normalizes it locally.
- `backend/src/nutrition-ai/*` extracts nutrition JSON and normalizes/scales it locally.

Alcohol support should follow the same pattern.

The LLM may extract label calories when printed on the label, but it should not calculate totals, scale servings, infer alcohol, or reconcile calorie gaps. Deterministic code should:

1. Scale label calories and macros to the consumed amount.
2. Detect alcoholic drinks with the word pool.
3. Treat trace alcohol-drink macro values as zero.
4. Infer alcohol grams from the calorie gap.
5. Preserve label calories when supplied.

## Decision 9: Implement One Minimal Vertical Slice

Alcohol support should be implemented across the existing nutrition workflow in one pass:

- parse nutrition text
- review parsed items
- save nutrition rows
- manually add/edit nutrition rows
- display item rows and daily totals

The first pass should not add profile alcohol goals, alcohol limits, new analytics, or broader coaching behavior.

## Decision 10: Existing Rows Default To Zero Alcohol

The migration should default existing nutrition rows to `alcohol = 0`.

Old rows should not be backfilled because they do not preserve the original label text or enough evidence to infer alcohol safely.

## Glossary

- **Alcohol macro**: grams of ethanol tracked as a calorie-bearing nutrition field.
- **Calorie gap**: label calories minus calories explained by protein, carbs, and fat.
- **Label calories**: calories printed by the food or drink producer.
- **Macro-derived calories**: calories computed from stored nutrition grams.
- **Alcohol goal**: a daily target or limit for alcohol grams. This is intentionally out of scope for now.

## Open Questions

- Should calorie totals use label calories when supplied, or always recompute from macros plus alcohol?
- Should alcohol have a daily target/limit, or only be logged as consumed grams and calories?
