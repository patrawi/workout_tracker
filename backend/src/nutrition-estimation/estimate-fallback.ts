// Coarse per-100 g priors per component kind (ADR 0026). A component without
// a usable reference — no lexical/vector match, an ambiguous tie, or a
// zero-composition catalog row — is calculated from its kind prior instead of
// blocking the save, so every observation always produces numbers.
//
// ponytail: provisional priors calibrated by eye against common Thai dishes.
// Upgrade path: learn per-kind and per-dish corrections from the user's own
// logged meals (the VLM few-shot phase 3 never started).
import type { ComponentKind, Macronutrients } from "./types";

export const ESTIMATE_FALLBACK_PER100: Record<ComponentKind, Macronutrients> = {
  // Steamed rice / noodle staple: ~130 kcal, mostly carbohydrate.
  rice: { protein: 3, carbs: 28, fat: 0.5, alcohol: 0, calories: 130 },
  // Protein-led dish: ~200 kcal with a fat share from stir-frying.
  main: { protein: 15, carbs: 6, fat: 13, alcohol: 0, calories: 200 },
  // Vegetable / light side: ~90 kcal.
  side: { protein: 2.5, carbs: 10, fat: 3, alcohol: 0, calories: 90 },
  // Soup / broth: ~50 kcal.
  broth: { protein: 3, carbs: 4, fat: 2, alcohol: 0, calories: 50 },
  // Unclassified: mild middle ground.
  other: { protein: 6, carbs: 15, fat: 7, alcohol: 0, calories: 150 },
};
