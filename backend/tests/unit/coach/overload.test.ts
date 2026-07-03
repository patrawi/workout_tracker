import { test, expect, describe } from "bun:test";
import {
  epley1RM,
  repsAtWeight,
  roundToStep,
  nextIncrement,
  assessExercise,
  DATA_POINTS_FLOOR,
  type OverloadSession,
  type OverloadSet,
  type OverloadTarget,
} from "../../../src/coach/overload";
import type { SessionType } from "../../../src/constants";

// ─── helpers ───────────────────────────────────────────────────────────────

function set(weight: number, reps: number, rpe: number, pain = false): OverloadSet {
  return { weight, reps, rpe, pain };
}

let idc = 0;
function session(
  sets: OverloadSet[],
  opts: { type?: SessionType; gym?: string; date?: string } = {},
): OverloadSession {
  idc += 1;
  return {
    session_id: idc,
    date: opts.date ?? `2026-06-${String(20 - idc).padStart(2, "0")}`,
    session_type: opts.type ?? "working",
    gym_profile: opts.gym ?? "GymA",
    sets,
  };
}

const TARGET: OverloadTarget = { rep_low: 10, rep_high: 12, sets: 3, rpe_high: 9, is_bodyweight: false, progression_ladder: "double_12" };
const DOUBLE_12_START_TARGET: OverloadTarget = { rep_low: 8, rep_high: 10, sets: 3, rpe_high: 9, is_bodyweight: false, progression_ladder: "double_12" };
const DOUBLE_15_TARGET: OverloadTarget = { rep_low: 12, rep_high: 15, sets: 3, rpe_high: 9, is_bodyweight: false, progression_ladder: "double_15" };

// N qualifying working sessions where every set hits the top of the range.
function topSessions(n: number, weight: number, rpe: number): OverloadSession[] {
  return Array.from({ length: n }, () => session([set(weight, 12, rpe), set(weight, 12, rpe), set(weight, 12, rpe)]));
}

// ─── pure helpers ────────────────────────────────────────────────────────────

describe("pure helpers", () => {
  test("epley1RM matches the frontend Epley formula", () => {
    expect(epley1RM(100, 12)).toBeCloseTo(139.96, 2);
    expect(epley1RM(0, 10)).toBe(0);
  });

  test("repsAtWeight inverts Epley and guards bad input", () => {
    const orm = epley1RM(100, 12);
    expect(repsAtWeight(100, orm)).toBeCloseTo(12, 5);
    expect(repsAtWeight(0, orm)).toBe(0);
    expect(repsAtWeight(100, 0)).toBe(0);
  });

  test("roundToStep", () => {
    expect(roundToStep(46.8, 2.5)).toBe(47.5);
    expect(roundToStep(6.24, 2)).toBe(6);
  });
});

describe("nextIncrement (§4.4)", () => {
  test("machine: stays within +4% cap", () => {
    const r = nextIncrement(100, { isDumbbell: false, tooLight: false });
    expect(r.toWeight).toBe(102.5);
    expect(r.jumpPct).toBeCloseTo(0.025, 3);
    expect(r.exceededCapByStep).toBe(false);
  });

  test("light weight: smallest step forced past cap is flagged", () => {
    const r = nextIncrement(45, { isDumbbell: false, tooLight: false });
    expect(r.toWeight).toBe(47.5);
    expect(r.exceededCapByStep).toBe(true);
  });

  test("dumbbell: 2kg step", () => {
    const r = nextIncrement(20, { isDumbbell: true, tooLight: false });
    expect(r.toWeight).toBe(22);
    expect(r.step).toBe(2);
  });

  test("tooLight allows a bigger (>4%) jump", () => {
    const r = nextIncrement(100, { isDumbbell: false, tooLight: true });
    expect(r.toWeight).toBe(107.5);
    expect(r.jumpPct).toBeGreaterThan(0.04);
    expect(r.exceededCapByStep).toBe(false);
  });
});

// ─── assessExercise ──────────────────────────────────────────────────────────

describe("assessExercise gates (§4.1 / §5.1)", () => {
  test("no history → hold", () => {
    const a = assessExercise([], TARGET, { isDumbbell: false });
    expect(a.recommendation.action).toBe("hold");
    expect(a.data.sufficient).toBe(false);
  });

  test("below hard floor → hold even on a clean go-signal", () => {
    const a = assessExercise(topSessions(DATA_POINTS_FLOOR - 1, 100, 8), TARGET, { isDumbbell: false });
    expect(a.data.points).toBe(DATA_POINTS_FLOOR - 1);
    expect(a.recommendation.action).toBe("hold");
    expect(a.goSignal).toBe(true); // signal computed, but gate forces hold
  });
});

describe("go-signal (§4.3)", () => {
  test("top of range across all sets at RPE 8 → increase +4%", () => {
    const a = assessExercise(topSessions(5, 100, 8), TARGET, { isDumbbell: false });
    expect(a.recommendation.action).toBe("increase");
    expect(a.recommendation.fromWeight).toBe(100);
    expect(a.recommendation.toWeight).toBe(102.5);
    expect(a.recommendation.expectedReps).toBe(11);
    expect(a.data.meetsDefault).toBe(true);
  });

  test("not all sets at top → hold", () => {
    const sessions = [
      session([set(100, 12, 8), set(100, 11, 8), set(100, 10, 9)]),
      ...topSessions(4, 100, 8),
    ];
    const a = assessExercise(sessions, TARGET, { isDumbbell: false });
    expect(a.goSignal).toBe(false);
    expect(a.recommendation.action).toBe("hold");
  });

  test("top of range at RPE 7 (too light) → larger jump", () => {
    const a = assessExercise(topSessions(5, 100, 7), TARGET, { isDumbbell: false });
    expect(a.recommendation.action).toBe("increase");
    expect(a.recommendation.deltaPct!).toBeGreaterThan(0.04);
  });

  test("bodyweight go-signal → optional weighted, not forced", () => {
    const a = assessExercise(topSessions(5, 0, 9), { ...TARGET, is_bodyweight: true }, { isDumbbell: false });
    expect(a.recommendation.action).toBe("add_weight_optional");
    expect(a.recommendation.toWeight).toBeNull();
  });

  test("double-12 10×3 at 8-10 target → promote reps, same weight", () => {
    const sessions = Array.from({ length: 5 }, () => session([set(100, 10, 8), set(100, 10, 8), set(100, 10, 8)]));
    const a = assessExercise(sessions, DOUBLE_12_START_TARGET, { isDumbbell: false });
    expect(a.recommendation.action).toBe("promote_reps");
    expect(a.recommendation.fromWeight).toBe(100);
    expect(a.recommendation.toWeight).toBe(100);
    expect(a.recommendation.nextRepLow).toBe(10);
    expect(a.recommendation.nextRepHigh).toBe(12);
  });

  test("double-12 12×3 at 10-12 target → increase weight and reset to 8-10", () => {
    const a = assessExercise(topSessions(5, 100, 8), TARGET, { isDumbbell: false });
    expect(a.recommendation.action).toBe("increase");
    expect(a.recommendation.toWeight).toBe(102.5);
    expect(a.recommendation.nextRepLow).toBe(8);
    expect(a.recommendation.nextRepHigh).toBe(10);
  });

  test("double-15 15×3 at 12-15 target → increase and keep 12-15", () => {
    const sessions = Array.from({ length: 5 }, () => session([set(20, 15, 9), set(20, 15, 9), set(20, 15, 9)]));
    const a = assessExercise(sessions, DOUBLE_15_TARGET, { isDumbbell: true });
    expect(a.recommendation.action).toBe("increase");
    expect(a.recommendation.nextRepLow).toBe(12);
    expect(a.recommendation.nextRepHigh).toBe(15);
  });

  test("bodyweight high-rep accessories do not get weighted-belt advice", () => {
    const sessions = Array.from({ length: 5 }, () => session([set(0, 18, 9), set(0, 18, 9), set(0, 18, 9)]));
    const a = assessExercise(
      sessions,
      { rep_low: 15, rep_high: 18, sets: 3, rpe_high: 10, is_bodyweight: true, progression_ladder: "bodyweight_high_rep" },
      { isDumbbell: false },
    );
    expect(a.recommendation.action).toBe("hold");
    expect(a.recommendation.reason).toContain("bodyweight accessory");
  });
});

describe("session_type handling (§3.3)", () => {
  test("only compromised/form_check sessions → no working trigger → hold", () => {
    const sessions = [
      session(topSessions(1, 100, 8)[0]!.sets, { type: "working_compromised" }),
      session(topSessions(1, 100, 8)[0]!.sets, { type: "form_check" }),
      session(topSessions(1, 100, 8)[0]!.sets, { type: "working_compromised" }),
      session(topSessions(1, 100, 8)[0]!.sets, { type: "form_check" }),
    ];
    const a = assessExercise(sessions, TARGET, { isDumbbell: false });
    expect(a.latestWorking).toBeNull();
    expect(a.recommendation.action).toBe("hold");
  });
});

describe("gym_profile continuity (§4.1 / §3.4)", () => {
  test("gym change resets continuity + filters qualifying data", () => {
    const sessions = [
      ...topSessions(2, 100, 8).map((s) => ({ ...s, gym_profile: "GymB" })),
      ...topSessions(5, 100, 8).map((s) => ({ ...s, gym_profile: "GymA" })),
    ];
    const a = assessExercise(sessions, TARGET, { isDumbbell: false });
    expect(a.gym_profile).toBe("GymB"); // most recent
    expect(a.continuity).toBe(2);
    expect(a.data.points).toBe(2); // only GymB qualifies → below floor
    expect(a.recommendation.action).toBe("hold");
  });
});

describe("pain (§5.2)", () => {
  test("pain in window is surfaced; precedence left to the LLM", () => {
    const sessions = topSessions(5, 100, 8);
    sessions[0]!.sets[0]!.pain = true;
    const a = assessExercise(sessions, TARGET, { isDumbbell: false });
    expect(a.painFlagged).toBe(true);
    // go-signal still computed — tool does not override; LLM applies §5.3.
    expect(a.goSignal).toBe(true);
  });
});
