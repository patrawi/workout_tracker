// Deterministic progressive-overload math — implements spec §4.
//
// The LLM never does this arithmetic itself (spec §6.2 deterministic-first). It
// calls `get_overload_assessment`, reads the structured result, applies the
// guardrail precedence (§5.3), and writes the reason column (§7). The single
// exception the LLM owns is reading the free-text comment to detect pain (§5.2);
// this module only surfaces the boolean pain flag + which sets carried it.

import type { SessionType } from "../constants";

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface OverloadSet {
  weight: number;
  reps: number;
  rpe: number;
  pain: boolean;
}

// One logged session of a single exercise. Sessions are passed MOST-RECENT-FIRST.
export interface OverloadSession {
  session_id: number;
  date: string;            // created_at
  session_type: SessionType;
  gym_profile: string;
  sets: OverloadSet[];     // in set order
}

// The plan target for this exercise (from coach_plan), defines "top of range".
export interface OverloadTarget {
  rep_high: number;        // top of the rep range
  sets: number;            // planned number of sets
  rpe_high: number;
  is_bodyweight: boolean;
}

// ─── Constants (spec §4.1 / §4.3 / §4.4) ─────────────────────────────────────

export const DATA_POINTS_DEFAULT = 5;   // §4.1 default minimum
export const DATA_POINTS_FLOOR = 3;     // §4.1 hard floor — below this never advise
export const MAX_INCREMENT_PCT = 0.04;  // §4.4 hard cap (+4%)
export const TOO_LIGHT_RPE = 7;         // §4.3 top of range at RPE ≤7 = too light for a while
export const DUMBBELL_STEP_KG = 2;      // §4.4 dumbbells jump in 2kg
export const PLATE_STEP_KG = 2.5;       // machine / barbell smallest sensible step

// ─── Pure helpers ────────────────────────────────────────────────────────────

// Estimated 1RM (Epley) — matches the existing frontend analytics formula
// (weight * reps * 0.0333 + weight). This IS the %1RM relationship the spec
// calls a "static lookup" (§6.1); we keep one consistent model rather than a
// second hardcoded table that could disagree with the est-1RM shown elsewhere.
export function epley1RM(weight: number, reps: number): number {
  return weight * (1 + 0.0333 * reps);
}

// Inverse Epley — predicted reps achievable at `weight` given an est 1RM.
// Used to forecast the rep drop after a jump (spec §4.4: expect 12 → ~10–11).
export function repsAtWeight(weight: number, oneRm: number): number {
  if (weight <= 0 || oneRm <= 0) return 0;
  return Math.max(0, (oneRm / weight - 1) / 0.0333);
}

export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// Next sensible weight (spec §4.4). Returns the proposed weight + the actual %
// jump + whether the smallest available step was forced to exceed the +4% cap
// (unavoidable on light dumbbells — spec accepts this, expect a longer climb).
export interface IncrementResult {
  toWeight: number;
  jumpPct: number;          // (toWeight - fromWeight) / fromWeight
  step: number;
  exceededCapByStep: boolean;
}

export function nextIncrement(
  fromWeight: number,
  opts: { isDumbbell: boolean; tooLight: boolean },
): IncrementResult {
  const step = opts.isDumbbell ? DUMBBELL_STEP_KG : PLATE_STEP_KG;
  // tooLight (RPE ≤7 at top of range) is the one case allowed past +4% (§4.3/§5.4).
  const capPct = opts.tooLight ? MAX_INCREMENT_PCT * 2 : MAX_INCREMENT_PCT;
  const ceiling = fromWeight * (1 + capPct);

  // Largest step multiple that stays within the cap and is an actual increase.
  let toWeight = Math.floor(ceiling / step) * step;
  let exceededCapByStep = false;

  if (toWeight <= fromWeight) {
    // Even one step overshoots the cap (common on light dumbbells / low weights).
    // Spec §4.4: take the closest sensible available increment anyway.
    toWeight = fromWeight + step;
    exceededCapByStep = true;
  }

  const jumpPct = (toWeight - fromWeight) / fromWeight;
  return { toWeight, jumpPct, step, exceededCapByStep };
}

// ─── Assessment (spec §4.1–§4.4) ─────────────────────────────────────────────

export type OverloadAction = "increase" | "hold" | "add_weight_optional";

export interface OverloadAssessment {
  gym_profile: string;             // the profile assessed (most recent session's)
  continuity: number;              // consecutive recent sessions on this profile (§4.1)
  data: {
    points: number;                // qualifying sessions on this gym_profile
    floor: number;
    default: number;
    sufficient: boolean;           // points ≥ floor
    meetsDefault: boolean;         // points ≥ default
  };
  latestWorking: {
    date: string;
    sets: OverloadSet[];
    allTopOfRange: boolean;        // all planned sets hit rep_high (§4.3 trigger)
    fromWeight: number;            // working weight at the top sets
    minRpe: number;
    maxRpe: number;
  } | null;
  painFlagged: boolean;            // any pain set in the qualifying window (§5.2 → LLM decides)
  goSignal: boolean;               // §4.3 trigger fired (ignores pain/retreat precedence)
  recommendation: {
    action: OverloadAction;
    deltaPct: number | null;       // proposed jump as fraction (null for bodyweight/hold)
    fromWeight: number | null;
    toWeight: number | null;
    expectedReps: number | null;   // forecast reps at toWeight (§4.4)
    exceededCapByStep: boolean;    // smallest available step forced >4% (§4.4 dumbbell case)
    reason: string;                // short deterministic explanation; LLM rephrases for §7
  };
}

function hold(reason: string, base: Omit<OverloadAssessment, "recommendation">): OverloadAssessment {
  return {
    ...base,
    recommendation: {
      action: "hold",
      deltaPct: null,
      fromWeight: null,
      toWeight: null,
      expectedReps: null,
      exceededCapByStep: false,
      reason,
    },
  };
}

export function assessExercise(
  sessions: OverloadSession[],
  target: OverloadTarget,
  opts: { isDumbbell: boolean },
): OverloadAssessment {
  // No history at all → hold (§5.1).
  if (sessions.length === 0) {
    const empty = {
      gym_profile: "",
      continuity: 0,
      data: { points: 0, floor: DATA_POINTS_FLOOR, default: DATA_POINTS_DEFAULT, sufficient: false, meetsDefault: false },
      latestWorking: null,
      painFlagged: false,
      goSignal: false,
    };
    return hold("No logged history for this exercise.", empty);
  }

  // Current gym profile = most recent session's (§4.1 deterministic string compare).
  const gym_profile = sessions[0]!.gym_profile;

  // Continuity counter: consecutive most-recent sessions on this profile (§4.1).
  let continuity = 0;
  for (const s of sessions) {
    if (s.gym_profile === gym_profile) continuity++;
    else break;
  }

  // Consistency filter: same exercise (given) + same gym_profile (§4.1).
  const qualifying = sessions.filter((s) => s.gym_profile === gym_profile);
  const points = qualifying.length;
  const sufficient = points >= DATA_POINTS_FLOOR;
  const meetsDefault = points >= DATA_POINTS_DEFAULT;

  // Pain anywhere in the qualifying window → surface for the LLM (§5.2 handback).
  const painFlagged = qualifying.some((s) => s.sets.some((set) => set.pain));

  // Latest WORKING session only triggers the go-signal. working_compromised /
  // form_check / return_* count in history but never trigger (§3.3).
  const working = qualifying.find((s) => s.session_type === "working") ?? null;

  let latestWorking: OverloadAssessment["latestWorking"] = null;
  let goSignal = false;
  if (working) {
    const topSets = working.sets.filter((set) => set.reps >= target.rep_high);
    const allTopOfRange = working.sets.length >= target.sets && topSets.length >= target.sets;
    const rpes = working.sets.map((s) => s.rpe).filter((r) => r > 0);
    const fromWeight = topSets.length ? Math.min(...topSets.map((s) => s.weight)) : 0;
    latestWorking = {
      date: working.date,
      sets: working.sets,
      allTopOfRange,
      fromWeight,
      minRpe: rpes.length ? Math.min(...rpes) : 0,
      maxRpe: rpes.length ? Math.max(...rpes) : 0,
    };
    goSignal = allTopOfRange;
  }

  const base = {
    gym_profile,
    continuity,
    data: { points, floor: DATA_POINTS_FLOOR, default: DATA_POINTS_DEFAULT, sufficient, meetsDefault },
    latestWorking,
    painFlagged,
    goSignal,
  };

  // Data sufficiency gate (§4.1 / §5.1).
  if (!sufficient) {
    return hold(`Only ${points} session(s) on this gym profile — below the hard floor of ${DATA_POINTS_FLOOR}. Hold.`, base);
  }
  if (!working) {
    return hold("No recent 'working' session — only compromised/form-check/return sessions, which never trigger a go-signal (§3.3).", base);
  }
  if (!goSignal) {
    return hold(`Haven't hit the top of the rep range (${target.rep_high}) across all ${target.sets} sets yet — keep climbing reps (double progression).`, base);
  }

  // Go-signal fired. Bodyweight: surface the weighted option, don't force a jump (§4.4).
  if (target.is_bodyweight) {
    return {
      ...base,
      recommendation: {
        action: "add_weight_optional",
        deltaPct: null,
        fromWeight: null,
        toWeight: null,
        expectedReps: null,
        exceededCapByStep: false,
        reason: "Hit top of range across all sets on a bodyweight lift — ready for weighted (belt + plate) whenever you choose. Optional, not forced.",
      },
    };
  }

  const lw = latestWorking!;
  const tooLight = lw.maxRpe > 0 && lw.maxRpe <= TOO_LIGHT_RPE; // §4.3 too-light-for-a-while
  const inc = nextIncrement(lw.fromWeight, { isDumbbell: opts.isDumbbell, tooLight });
  const oneRm = epley1RM(lw.fromWeight, target.rep_high);
  const expectedReps = Math.round(repsAtWeight(inc.toWeight, oneRm));

  const reason = tooLight
    ? `Top of range at RPE ${lw.maxRpe} (≤${TOO_LIGHT_RPE}) — it's been too light for a while. Larger-than-4% jump allowed: ${lw.fromWeight}kg → ${inc.toWeight}kg (+${(inc.jumpPct * 100).toFixed(1)}%).`
    : inc.exceededCapByStep
      ? `Go-signal fired. Smallest available step (${inc.step}kg) exceeds +4% at this weight — unavoidable; expect a longer rep climb. ${lw.fromWeight}kg → ${inc.toWeight}kg (+${(inc.jumpPct * 100).toFixed(1)}%).`
      : `Go-signal fired at RPE ${lw.minRpe}–${lw.maxRpe}. Add ${lw.fromWeight}kg → ${inc.toWeight}kg (+${(inc.jumpPct * 100).toFixed(1)}%); expect reps to drop to ~${expectedReps}.`;

  return {
    ...base,
    recommendation: {
      action: "increase",
      deltaPct: inc.jumpPct,
      fromWeight: lw.fromWeight,
      toWeight: inc.toWeight,
      expectedReps,
      exceededCapByStep: inc.exceededCapByStep,
      reason,
    },
  };
}
