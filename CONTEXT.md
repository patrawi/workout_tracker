# Workout Tracker Context

This context defines the training and coaching language used by the workout tracker. It keeps workout logs, saved plans, and progressive-overload decisions distinct.

## Language

**Workout Session**:
A training session the user actually performed and logged on a real date. This is workout evidence.
_Avoid_: Plan date, saved plan

**Saved Plan**:
The currently saved prescription for a Push, Pull, or Legs day, intended for the user's next matching session if they choose to use it. It is not evidence that the workout happened, and its rep range is the source of truth for progression targets.
_Avoid_: Workout log, completed session

**Plan Proposal**:
A structured coach recommendation for changing a Saved Plan that has not been committed yet. It uses the same exercise structure as a Saved Plan, but becomes a Saved Plan only after an Explicit Save Action.
_Avoid_: Draft saved plan, unsaved workout

**One-Off Session Prescription**:
A coach recommendation intended for a specific upcoming workout only. It can be followed and logged, but it does not replace a Saved Plan.
_Avoid_: Saved Plan, permanent plan update

**Session Prescription Event**:
A structured chat-stream event that carries a One-Off Session Prescription separately from Plan Proposal. The UI should render it as a use-today prescription, not as a saveable replacement for Push, Pull, or Legs.
_Avoid_: Reusing Plan Proposal for ad-hoc workouts, LLM guessing save semantics

**Session Prescription Proposal**:
A coach tool action that prepares a One-Off Session Prescription for the app UI. It must not mutate Saved Plans and must not share the Plan Proposal save path.
_Avoid_: Hidden plan replacement, ad-hoc save through coach_plan

**Plan Proposal Event**:
A structured chat-stream event that carries a Plan Proposal separately from the coach's human-readable message. The UI should render it as a saveable proposal card rather than parsing plan data out of markdown text.
_Avoid_: JSON in chat text, markdown plan parsing

**Coach Proposal Parity**:
The streaming and non-streaming coach chat endpoints should both be able to return a Plan Proposal. This keeps the app behavior consistent if the UI switches transport modes.
_Avoid_: Stream-only proposals, dropped non-stream proposals

**Plan Saved Time**:
The time a Saved Plan was saved or issued. It is not the intended workout date and must not be used as workout-history evidence.
_Avoid_: Session date, workout date

**Next Matching Session**:
The next workout session of the same day type where the user may apply the Saved Plan. The user can choose not to use it.
_Avoid_: Guaranteed next workout

**Upper Flex Session**:
A compressed-week upper-body workout used when the user can only train four sessions in a week, often because a planned five-session week collapses midstream. It borrows selected exercises from existing Push and Pull Saved Plans instead of becoming an independent Saved Plan.
_Avoid_: Fourth base plan, separate Upper progression track

**Ad-Hoc Upper Request**:
A user request made in chat for an Upper Flex Session when today's original plan no longer fits the week. The coach should generate the derived Upper plan on demand from current Push/Pull source tracks rather than requiring a pre-planned four-session week.
_Avoid_: Silent calendar inference, Monday-only week planning

**Missed Exposure Compression**:
The selection rule for an Ad-Hoc Upper Request. The Upper Flex Session should primarily compress the planned Push and Pull exposures that would otherwise be missed later in the week, while actual logs may adjust exercise choice or fatigue handling.
_Avoid_: Rebuilding the week purely from least-recent muscles

**Position-Priority Upper Selection**:
The default exercise-selection rule for an Upper Flex Session. Choose the highest-priority Push and Pull exercises from their Saved Plans by position, then adjust only for fatigue, equipment, pain, or explicit user preference.
_Avoid_: Arbitrary exercise picking, pure history-based selection

**Upper Isolation Slots**:
The two default isolation slots in an Upper Flex Session should be upper-body isolations, normally one Push-source and one Pull-source. Core accessories such as Leg Raise are excluded by default unless the user explicitly asks for core or there is extra time.
_Avoid_: Core stealing compressed upper-body exposure

**Default Upper Push Isolation**:
Dumbbell Lateral Raise is the default Push-source isolation for an Upper Flex Session. If shoulders are too fatigued, use Tricep Extension Machine; if chest is the explicit priority, use Elbow Pectoral Fly.
_Avoid_: Extra pressing by default

**Default Upper Push Compounds**:
Machine Incline Press / Converging and Shoulder Press Machine are the default Push-source compounds for an Upper Flex Session. Dips are a fallback or explicit lower-chest/triceps emphasis choice.
_Avoid_: Dips as default compressed-week second push compound

**Default Upper Pull Isolation**:
Machine Reverse Fly is the default Pull-source isolation for an Upper Flex Session. If the machine is unavailable, use Dumbbell Bicep Curl; if neutral-grip arm work is preferred or elbows feel better that way, use Dumbbell Hammer Curl.
_Avoid_: Arm-only pull isolation by default

**Default Upper Pull Compounds**:
Pull Up / Assisted Pull Up and One Arm Dumbbell Row are the default Pull-source compounds for an Upper Flex Session. Lat Pulldown Machine is the fallback when pull-up quality is poor or fatigue is high.
_Avoid_: Doubling vertical pulls by default

**Source Day Type**:
The original Push, Pull, or Legs identity that an exercise keeps when it appears in a derived workout such as an Upper Flex Session. Progression decisions follow the source day type, not the derived session label.
_Avoid_: New progression bucket, duplicate target

**Source-Track Progression**:
The rule that an exercise in a derived workout is assessed against its original Saved Plan and workout history. An Upper Flex Session does not add a special progression penalty or create separate overload math.
_Avoid_: Upper-only overload state, compressed-week penalty

**Log-First Feedback Flow**:
The normal coaching workflow where the user logs today's workout, confirms the reviewed data, and only then asks the coach for feedback. The coach should read the saved Workout Session from history rather than relying on pasted workout text.
_Avoid_: Feedback from unsaved parsed data

**Post-Save Feedback Request**:
A user-triggered request for coach feedback after a Workout Session has been confirmed and saved. It should be initiated by an explicit button, refers to the exact saved Workout Session rather than the current calendar date, and only asks the coach to propose the next plan until the user explicitly confirms saving.
_Avoid_: Automatic ReviewModal feedback

**Explicit Save Action**:
A user-initiated app or API action that commits a proposed Saved Plan. Autonomous coach tool calls are not Explicit Save Actions, even when the chat text appears to contain confirmation language.
_Avoid_: Prompt confirmation, model-decided save

**In-Chat Plan Save**:
An Explicit Save Action presented inside the coach chat surface for a Plan Proposal. It may be a one-step save when the proposal card clearly shows that it replaces the whole current Push, Pull, or Legs Saved Plan, and the commit still happens through the app's normal plan-saving API.
_Avoid_: Coach tool save, hidden auto-save

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

**Exercise Role**:
The explicit role of a Saved Plan exercise, either Compound Exercise or Isolation Exercise. It should be stored with the plan row so derived prescriptions such as Upper Flex can select exercises deterministically. Exercise Role is not enough by itself to choose the progression ladder.
_Avoid_: Name-based role guessing, role-as-rep-target

**Progression Ladder Profile**:
The explicit progression pattern for a Saved Plan exercise. Compound exercises normally use a 12-rep top range via the Compound Rep Ladder; some isolation exercises also use a 12-rep top range, while small-load isolations such as lateral raises and reverse fly can use a 15-rep top range. Leg Raise is also treated as a high-rep isolation. Tricep Extension, Dumbbell Bicep Curl, Dumbbell Hammer Curl, Elbow Pectoral Fly, and Abs Crunch use a 12-rep top range unless the user changes them.
_Avoid_: Treating all isolations as 15-rep exercises, guessing ladder from exercise name

**Double-12 Ladder**:
A progression ladder whose top target is 12 reps across all planned sets. It applies to compounds and to normal-load isolations such as tricep extension, bicep curl, hammer curl, elbow pectoral fly, and abs crunch.
_Avoid_: Compound-only 12-rep ladder

**Double-15 Ladder**:
A progression ladder whose top target is 15 reps across all planned sets. It applies narrowly to small-load isolations such as lateral raise and machine reverse fly.
_Avoid_: All isolation exercises

**Bodyweight High-Rep Ladder**:
A progression ladder for bodyweight high-rep accessories such as leg raise.
_Avoid_: Weighted machine abs progression

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

## Nutrition Estimation Language

**Meal Observation**:
A consumed meal submitted with a user-provided menu name, detail photo, and portion evidence. Portion evidence may be measured or estimated.
_Avoid_: Photo-only identification, exact recipe

**Measured Portion Weight**:
Portion mass recorded with a food scale, including separately measured components when available.
_Avoid_: Visual estimate, assumed serving

**Estimated Portion Weight**:
A bounded portion-mass estimate used when no scale measurement is available. It carries greater uncertainty than Measured Portion Weight.
_Avoid_: Measured grams, exact weight

**Reviewed Weight Estimate**:
An Estimated Portion Weight that the user has accepted or adjusted during review. It remains estimated unless replaced by an actual scale measurement.
_Avoid_: Measured weight, ground truth

**Portion Component**:
A coarse, observable part of a Meal Observation that may have distinct weight or consumption evidence, such as rice, main dish, solids, or broth. It is not a recipe ingredient list.
_Avoid_: Ingredient, full recipe decomposition

**Consumed Fraction**:
The share of a Portion Component that was actually eaten, expressed coarsely such as all, three quarters, half, or a quarter. AI may propose it by comparing before and after images, but it becomes evidence only when the user confirms or corrects it.
_Avoid_: Observed fact, AI truth, leftover guess

**Latent Recipe Factor**:
An ingredient or preparation detail that is not separately observed or weighed, such as starch, cooking oil, sugar, or rendered pork fat. Its effect belongs in estimate uncertainty rather than user-entered Portion Components.
_Avoid_: Required component, known ingredient quantity

**Known Ingredient Evidence**:
An optional known quantity for an ingredient contained within a Portion Component. It constrains how that component is allocated and does not add weight on top of the component total.
_Avoid_: Required recipe entry, additional portion weight

**Ingredient Evidence Source**:
The provenance of Known Ingredient Evidence: separately measured, declared by a label/menu/vendor, or estimated by the user. The source determines how strongly the quantity constrains the estimate.
_Avoid_: Uniform confidence, source-free weight

**Ingredient Weight Basis**:
Whether Known Ingredient Evidence describes raw weight, served weight, or an unknown preparation stage. Unknown basis preserves more uncertainty than an explicitly known basis.
_Avoid_: Assuming declared weight is cooked, silent raw-to-served conversion

**Nutrition Reference Baseline**:
The per-100-gram composition from ThaiFCD used as the starting point for an estimate. It represents reference food composition, not the exact composition of the served meal.
_Avoid_: Ground truth, exact recipe

**ThaiFCD Reference Snapshot**:
A versioned collection of ThaiFCD food-composition records available for local matching and lookup while preserving their original food codes and source attribution.
_Avoid_: Live ThaiFCD service, personal food catalog

**Nutrition Reference Catalog**:
The single normalized, locally queryable catalog through which nutrition reference records from ThaiFCD and future providers are accessed. Each record retains its original provider, identifier, version, and attribution.
_Avoid_: Provider-blind merged data, separate cuisine silos

**Reference Coverage Gap**:
The absence of a sufficiently relevant nutrition reference for a Meal Observation. It must not be hidden by forcing a semantically similar but compositionally inappropriate match.
_Avoid_: Nearest-vector-as-truth, fabricated reference

**Reference-Pending Meal**:
A saved Meal Observation whose nutrition calculation is deferred because no suitable reference is available. It preserves the original evidence without fabricating macros and may be resolved when an appropriate reference is added or selected.
_Avoid_: Failed log, zero-macro meal

**Nutrition Estimate Revision**:
A newly confirmed calculation for an existing Meal Observation, linked to the reference provider and version that produced it. It supersedes the displayed estimate without erasing earlier confirmed or pending history.
_Avoid_: Silent overwrite, catalog-driven history mutation

**Weekly Menu Prior**:
The announced canteen dishes used to rank likely meal matches for a particular week. It is a strong hint, not an exhaustive constraint on what the user may eat. Deferred from V1: V1 matching does not consume this prior, and a day-by-day menu photo is treated only as label_or_menu image evidence.
_Avoid_: Mandatory menu, hard closed set, V1 ranking input

**Off-Menu Meal**:
A consumed meal that is absent from the Weekly Menu Prior, including a substitute chosen because the announced dish was skipped.
_Avoid_: Invalid meal, matching failure

**Meal Source**:
The optional preparation context for a Meal Observation, such as the office canteen, a restaurant, home, or unknown. It scopes future calibration without requiring identification of an individual cook.
_Avoid_: Mandatory location, assumed cook identity

**Source-Specific Calibration**:
An evidence-backed adjustment learned for a particular Meal Source and dish. It must fall back to a broader reference for other sources rather than being treated as universally valid.
_Avoid_: Global recipe truth, cross-source adjustment

**Reviewed Meal Label**:
Observable meal evidence that the user accepted or corrected after seeing an AI proposal. It is useful operational feedback but may contain anchoring bias and is not nutrient ground truth.
_Avoid_: Blind label, laboratory truth

**Gold Meal Label**:
An independently reviewed label for observable meal evidence created without seeing the competing model outputs first. It supports model comparison but still does not prove hidden recipe composition or final nutrient values.
_Avoid_: AI-confirmed label, nutrition ground truth

**Retained Meal Image**:
A privacy-sanitized image kept in private object storage and linked to its Meal Observation through metadata. Retention alone does not authorize its use as evaluation data.
_Avoid_: Public image, database binary

**Evaluation-Eligible Image**:
A Retained Meal Image explicitly marked for model evaluation and paired with sufficient evidence, provenance, and labels for the intended test.
_Avoid_: Every stored image, unlabeled training truth

**Meal Image Capture Role**:
The meaning of a Retained Meal Image: before eating, after eating, or label/menu evidence. A separate detail-photo role is deliberately excluded to keep capture simple.
_Avoid_: Unclassified image, required detail shot

**Plausible Nutrition Range**:
A low, central, and high nutrient estimate derived from explicit but not yet calibrated assumptions. It preserves uncertainty without claiming percentile coverage or exact composition.
_Avoid_: P10–P90, calibrated interval, exact macros
