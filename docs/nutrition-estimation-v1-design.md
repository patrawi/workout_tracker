# Weight-Constrained Nutrition Estimation — V1 Design Spec

Consolidated from design grill questions Q28–Q42 (2026-09-13). Vocabulary follows `CONTEXT.md` (Nutrition Estimation Language); each decision's rationale lives in `docs/adr/0001`–`0025`. Nothing here is implemented yet.

## 1. V1 user journey and minimum input

Two modes, chosen per Meal Observation:

- **Estimated mode (default)** — minimum input: user-provided menu name + one `before` image. The VLM proposes Portion Components with approximate weights; the user confirms/edits. Optional: `after` image (enables per-component consumed-fraction proposals), `label_or_menu` evidence image, Meal Source, Known Ingredient Evidence.
- **Measured mode** — minimum input: menu name + at least one scale-measured component weight. The `before` image is optional (recommended) because calculation runs on measured masses.

Capture roles stay as decided in ADR 0013: `before`, `after`, `label_or_menu`. No detail-photo role.

Logging is never blocked by a VLM failure or an image-upload failure (ADR 0017, 0023).

## 2. VLM structured-output contract (ADR 0017)

The VLM is an evidence proposer, not a calculator. It returns structured JSON:

1. `proposed_dish_name` — one suggestion; candidate ranking belongs to retrieval, not the VLM.
2. `components[]` — name, coarse kind (rice / main / side / broth / other), before-weight as `{low, central, high}` grams.
3. `consumed_fraction` per component — only when an `after` image exists.
4. `latent_factor_hints[]` — coarse levels, e.g. visible oil sheen, dryness, remaining broth.
5. `confidence` — high / medium / low, evaluated per field.

Failure states: `no_food`, `unreadable`, plus per-field low confidence. Behavior:

- Low-confidence fields are **hidden** from the review UI (anti-anchoring); the user fills them manually.
- Unusable output → manual component-entry screen; calculation proceeds identically.
- Medium/high-confidence fields render as editable proposals.

**Model (ADR 0025):** V1 baseline is DeepSeek vision behind a thin provider-neutral adapter implementing this contract. Notes from the DeepSeek API docs (2026-09): images are accepted only in user messages; formats JPEG/PNG/GIF/WebP; base64/URL/Files-API input; JSON output is a separate supported mode; an image costs roughly ≤1024 tokens (upscaled toward ~544×544 or downscaled to ~1300×1300 equivalent pixels). The interpreter ablation uses the same model in both roles (ADR 0010, 0024).

## 3. Consumed fraction flow (ADR 0015)

- Both images present: VLM proposes a fraction per component; user confirms/corrects each.
- No `after` image: user picks from fixed choices — all / ¾ / ½ / ¼.
- A user-confirmed fraction is a point value (see §4).

## 4. Calculation model (ADR 0008, 0018)

Nutrient total = Σ over components of consumed-mass contributions from the reference per-100 g baseline, adjusted by Known Ingredient Evidence allocations and latent-factor masses, computed under mass-balance constraints (ingredient masses and latent-factor masses live **inside** their component's mass, per ADR 0006).

**Intervals (mass-side only):**

- Estimated component weights (user may narrow bounds; defaults kept).
- Latent-factor masses implied by hints (see table below).
- Known Ingredient Evidence that is declared, user-estimated, or unknown-basis.

**Points:**

- Measured Portion Weights.
- User-confirmed consumed fractions.
- Reference per-100 g composition.

Low / central / high = constrained minimum / central / maximum of the nutrient total. No percentile claims (ADR 0007).

**Provisional evidence widening factors (uncalibrated defaults — listed with §12):**

- Declared Known Ingredient Evidence widens ±5% around the given value.
- User-estimated evidence widens ±25% around the given value.
- Unknown weight basis applies an additional ×1.5 widening of the interval (never applied to measured quantities, which stay points).

**Provisional latent-factor hint table (heuristic defaults, marked provisional until calibration data exists):**

| Hint level | Visible oil (% of component mass) |
|---|---|
| low | 0–2% |
| medium | 2–6% |
| high | 6–12% |

Dryness and remaining-broth hints remain evidence-only in V1 core: they are recorded as range drivers with no numeric band until calibration data exists (provisional, uncalibrated — listed with the §12 defaults).

## 5. Constraint priority and infeasibility (ADR 0019)

Hard → soft: scale-measured and user-confirmed facts > declared / user-estimated ingredient evidence > heuristic hints.

- Obvious conflicts (e.g. declared 50 g sugar inside a 30 g component) are validated at entry.
- Solver-level infeasibility → relax softest constraints first, display a "relaxed assumptions" flag.
- Hard constraints still conflicting → show the reason, ask the user to fix; never fabricate a range, never clip silently.

## 6. Explanation fields (per estimate)

Auto-generated: (1) reference used with provider and version (ADR 0012); (2) per-component breakdown — weight/interval, consumed fraction, nutrient contribution; (3) range drivers — which widened the low–high span; (4) flags — measured/estimated mode, relaxed assumptions, manually entered fields.

## 7. Reference matching (ADR 0020, 0014)

Three tiers over hybrid retrieval (food-code lookup + lexical + pgvector fallback):

1. **Dominant** (top score above threshold, clear margin) → auto-select, shown in explanation, changeable.
2. **Ambiguous** (close top-3) → user picks from candidates.
3. **Below threshold** → Reference Coverage Gap → Reference-Pending Meal.

Resolution UX (ADR 0012, 0020): a pending list on the Nutrition page; user opens a pending meal and selects a reference, or a new snapshot import surfaces a proposed revision awaiting explicit confirmation. No auto-apply, ever.

## 8. Storage and backward compatibility (ADR 0022)

New tables own the full model: Meal Observations, components, ingredient evidence, image metadata (object keys, checksums, consent, lifecycle), Nutrition Estimate Revisions with provider/version, and model/reference versions. Conceptual structure only — concrete schema is an implementation task.

**Dual-write:** on confirmed estimate, central values are written as a point-estimate row into the existing `nutrition_logs` with a provenance marker; confirmed revisions update the linked row. Existing analytics keep working; old manual/DeepSeek-parsed logs remain valid legacy point entries.

## 9. Meal image pipeline (ADR 0013, 0023)

Uploads and deletions proxied through the backend (auth + EXIF strip guaranteed server-side); viewing via short-lived signed GET URLs from the private R2 Standard bucket; PostgreSQL stores metadata only. Upload failure never blocks saving; images can be attached later. User deletion/export controls per ADR 0013.

## 10. Interpreter ablation gate (ADR 0010, 0024)

On ≥30 Gold Meal Label meals: median macro error (kcal + protein) reduced ≥10% **or** median correction burden reduced ≥20%; latency ≤ +5 s/meal; cost ≤ 2×; prohibitions (altering measured facts, inventing ingredients) violated on >1% of meals = hard fail.

## 11. Explicitly out of V1

- Weekly Menu Prior ranking (deferred, ADR 0021); menu photos are `label_or_menu` evidence only.
- Western/non-ThaiFCD providers (data acquisition when coverage requires, ADR 0011).
- Monte Carlo propagation and calibrated percentile intervals (ADR 0007, 0008, learning record 0001).
- Fine-tuning (ADR 0001).

## 12. Provisional defaults awaiting calibration

- Latent-factor hint bands in §4.
- Known Ingredient Evidence widening factors in §4: declared ±5%, user-estimated ±25%, unknown basis ×1.5.
- Dryness and remaining-broth hint bands: none in V1 core — both hints stay evidence-only (recorded as drivers, no numeric band) until calibration data exists.
- Matching score threshold and "clear margin" definition in §7.
- Per-field confidence thresholds in §2.
