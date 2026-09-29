# Match nutrition references per component and never block on missing references

The V1 flow matched ONE reference against the whole meal's menu name; a gap or ambiguous tier saved a Reference-Pending Meal with no calculation, and the user had to hunt through a reference search (against a 314-row catalog) that usually missed — the owner hated it enough to kill the flow outright. We now match each Portion Component against the catalog independently (lexical token-overlap, then pgvector similarity on its own scale), calculate every component deterministically when a reference matches, and fall back to a coarse per-kind per-100 g prior (Kind Prior) for everything else — so a save always yields numbers and `reference_pending` is never written for new observations.

## Considered Options

- Keep the pending dialog and grow the catalog until searches hit — rejected: the catalog can never cover every home-cooked Thai dish, and the dead-end UX was the complaint.
- Let the VLM output calories directly (Kalguro-style model-guessed numbers) — rejected: contradicts the evidence-proposer/calculator split (ADR 0017) and measured far worse on Thai food (VLM calorie paper review, 2026-09-19).
- Blend vector similarity into the lexical score — was already implemented and found mathematically dead (a 0.4-weighted cosine can never clear the lexical 0.6/0.82 thresholds); vector now scores on its own scale (auto ≥ 0.85, ambiguous ≥ 0.70, margin 0.03, calibrated 2026-09-29 on 12 known-answer queries).

## Consequences

- Every component in a calculation carries provenance (`estimated` flag plus matched-reference info persisted inside the calculation jsonb); the confirm dual-write carries the central values into nutrition_logs, whose per-component provenance is readable from the linked observation's calculation.
- The kind priors are provisional constants; the upgrade path is learning corrections from the user's own logged meals (few-shot phase 3, never started).
- Catalog grew 314 → 1,357 rows (ThaiFCD 2015 snapshot + BaoWio ingredient set, both CC BY-SA 4.0 — in-app attribution owed) with embeddings on every row; reference search gains the same vector tier, so formerly empty searches return labeled near-misses.
- Pre-0026 rows in `reference_pending` keep the resolve flow for manual cleanup; the pending UI is being removed from the web app.
