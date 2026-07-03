# Learning Notes

## Session-Anchored Coach Feedback

When a user asks for feedback on a specific saved workout, the agent harness must
make the historical boundary deterministic before the LLM reasons.

For `get_day_type_history({ session_id })`, the flow is:

1. Load the reviewed session by exact `session_id`.
2. Classify that reviewed session from its logged workout muscle groups.
3. Query sessions before the reviewed session using deterministic workout-history
   order: `created_at`, then `session_id`.
4. Hydrate those prior sessions with their workouts.
5. Classify each prior session.
6. Return only the previous matching day-type sessions, capped to the feedback
   baseline size.

The wide prior-session scan exists because the previous raw sessions may be a
mix of Push, Pull, Legs, rest-adjacent logs, or other activity. The tool scans a
larger window first, then filters down to the previous matching day type. The
returned baseline should be small and explicit.

Harness rule:

- Deterministic history selection belongs in tools, not in the LLM.
- The reviewed session is the subject of feedback, not part of its own baseline.
- The LLM should compare against `previous_sessions`; it should not infer from
  "today", "latest", plan `updated_at`, or calendar dates when `session_id` is
  available.

## Exercise Alias Handling

Saved plan names and logged exercise names can differ while referring to the
same movement. Example:

- Saved plan: `Pull Up / Assisted Pull Up`
- Logged exercise: `Pull Up`

This must not be left for the LLM to debate. Slash-separated plan names should be
resolved deterministically by the tool layer, and tool responses should expose
both the saved plan name and the history names used for lookup.

Harness rule:

- Alias resolution belongs in tools.
- LLMs should interpret the resolved mapping, not perform manual progression
  math or switch plans because of an exercise-name alias.

