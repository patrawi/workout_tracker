# Workout Tracker Context

This context defines the training and coaching language used by the workout tracker. It keeps workout logs, saved plans, and progressive-overload decisions distinct.

## Language

**Workout Session**:
A training session the user actually performed and logged on a real date. This is workout evidence.
_Avoid_: Plan date, saved plan

**Saved Plan**:
The currently saved prescription for a Push, Pull, or Legs day, intended for the user's next matching session if they choose to use it. It is not evidence that the workout happened, and its rep range is the source of truth for progression targets.
_Avoid_: Workout log, completed session

**Plan Saved Time**:
The time a Saved Plan was saved or issued. It is not the intended workout date and must not be used as workout-history evidence.
_Avoid_: Session date, workout date

**Next Matching Session**:
The next workout session of the same day type where the user may apply the Saved Plan. The user can choose not to use it.
_Avoid_: Guaranteed next workout

**Log-First Feedback Flow**:
The normal coaching workflow where the user logs today's workout, confirms the reviewed data, and only then asks the coach for feedback. The coach should read the saved Workout Session from history rather than relying on pasted workout text.
_Avoid_: Feedback from unsaved parsed data

**Post-Save Feedback Request**:
A user-triggered request for coach feedback after a Workout Session has been confirmed and saved. It should be initiated by an explicit button, refers to the exact saved Workout Session rather than the current calendar date, and only asks the coach to propose the next plan until the user explicitly confirms saving.
_Avoid_: Automatic ReviewModal feedback

**Coach Feedback Handoff**:
The UI transition after a Post-Save Feedback Request. The app should navigate to Coach chat and send a session-anchored feedback request there, rather than rendering coach feedback inline on the home page.
_Avoid_: Inline home-page coaching

**Feedback Baseline**:
The previous matching workout sessions used to evaluate a saved Workout Session. It excludes the session being reviewed; the reviewed session is the subject, not part of its own comparison baseline.
_Avoid_: Latest sessions including the reviewed session

**Session-Anchored Coach Tool**:
A coach tool call that is anchored to a specific Workout Session by session id. Session-anchored tools should be preferred for post-save feedback because relative dates and latest-session inference are probabilistic.
_Avoid_: Date guessing, latest-session guessing

**As-Of Session Boundary**:
The historical cutoff used for feedback and progression on a reviewed Workout Session. It includes data up to and including that session's workout date/session, regardless of when the user logged it.
_Avoid_: Current latest DB row, insertion order

**Workout History Order**:
The deterministic order for workout sessions when evaluating history. Sessions are ordered by workout timestamp and then session id, so sessions on the same date still have a stable before/after relationship.
_Avoid_: Insertion-time guessing

**Session-Anchored Feedback Baseline**:
A Feedback Baseline derived from the reviewed Workout Session id. The tool should classify the reviewed session's day type itself, then return previous matching sessions before that session.
_Avoid_: Asking the coach to choose the day type for a reviewed session

**Compound Exercise**:
A multi-joint exercise where the progression target should prove practical capacity, not just muscle size. The default progression target is 12 reps across all planned sets.
_Avoid_: Heavy-only movement

**Isolation Exercise**:
An accessory exercise focused on a narrower muscle group. Its progression target can use a higher rep range, such as 12 to 15 reps across all planned sets.
_Avoid_: Compound

**Progression Target**:
The reps across all planned sets required before the system may recommend a progression action. It comes from the Saved Plan's top rep range.
_Avoid_: Hardcoded universal trigger

**Rep Target Promotion**:
A non-weight progression step for Compound Exercise. When the user hits 10 reps across all planned sets at the current weight, the coach should save the same weight with a 10 to 12 rep range instead of adding weight.
_Avoid_: Weight increase

**Weight Progression**:
Adding weight after the user has reached the high-rep Progression Target at the current weight. For Compound Exercise this happens after 12 reps across all planned sets; for Isolation Exercise it can happen at the saved top range such as 15 reps.
_Avoid_: Rep target promotion

**Progression Action**:
A deterministic recommendation returned by the overload assessment tool. The core actions are hold, promote_reps, and increase; the coach should interpret these actions rather than inventing weight changes.
_Avoid_: Prompt-only progression decision

**Compound Rep Ladder**:
The default compound progression cycle: start at 8 to 10 reps, promote to 10 to 12 reps at the same weight after 10 reps across all planned sets, then add weight after 12 reps across all planned sets and reset the saved range back to 8 to 10.
_Avoid_: Immediate weight jump at 10 reps

**Isolation Rep Ladder**:
The default isolation progression cycle: use one higher-rep range such as 12 to 15 reps, add weight after the user reaches the saved top range across all planned sets, then reset to the same range at the new weight.
_Avoid_: Compound rep promotion
