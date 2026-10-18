# Workout Tracker — Nutrition Estimation

Shared language for the meal-photo nutrition estimation flow: a VLM proposes
portion components from a photo, each component is matched against a nutrition
reference catalog, and deterministic code computes kcal/macros (ADR 0001).

## Language

**Reference**:
A catalog row of per-100 g nutrition values used to price a Component. Global rows are shared by all users; Manual References belong to one user.
_Avoid_: food item, catalog entry, nutrition row

**Manual Reference**:
A Reference a user saves from their own correction of an estimated component, owned by that user and matchable only for them.
_Avoid_: custom food, my food, user reference

**Kind Prior**:
A coarse per-100 g fallback value chosen by a Component's kind (rice/main/side/broth/other) when no Reference matches (ADR 0026).
_Avoid_: default value, fallback nutrition

**Component**:
One coarse observable part of a meal as seen in the photo (e.g. rice, curry, broth) that gets its own weight and matched Reference (ADR 0005).
_Avoid_: ingredient, dish item, food

**Consumed Fraction**:
The share of a served Component actually eaten (from an after photo), between 0 and 1.
_Avoid_: leftover, remainder, eaten ratio
