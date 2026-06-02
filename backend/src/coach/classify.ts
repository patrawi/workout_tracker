export type DayType = "Push" | "Pull" | "Legs" | "Other";

// muscle_group is a strict vocabulary (Chest/Back/Legs/Shoulders/Arms/Core/Cardio/Other).
// Only the decisive groups vote; Arms (bi+tri), Core, Cardio, Other are neutral.
const VOTES: Record<string, DayType> = {
    Chest: "Push",
    Shoulders: "Push",
    Back: "Pull",
    Legs: "Legs",
};

/**
 * Derive a session's day-type from its exercises' muscle groups by majority
 * vote. Computed at read time — never stored, so it works on all history.
 */
export function classifySession(muscleGroups: string[]): DayType {
    const tally: Record<DayType, number> = { Push: 0, Pull: 0, Legs: 0, Other: 0 };
    for (const mg of muscleGroups) {
        const vote = VOTES[mg];
        if (vote) tally[vote] += 1;
    }
    const best = (["Push", "Pull", "Legs"] as DayType[]).reduce(
        (a, b) => (tally[b] > tally[a] ? b : a),
        "Push" as DayType,
    );
    return tally[best] > 0 ? best : "Other";
}
