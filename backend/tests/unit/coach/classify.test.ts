import { test, expect } from "bun:test";
import { classifySession } from "../../../src/coach/classify";

test("classifies a push session", () => {
    expect(classifySession(["Chest", "Shoulders", "Arms", "Arms"])).toBe("Push");
});

test("classifies a pull session (Back decisive, Arms/Core neutral)", () => {
    expect(classifySession(["Back", "Back", "Arms", "Core"])).toBe("Pull");
});

test("classifies a leg session", () => {
    expect(classifySession(["Legs", "Legs", "Legs"])).toBe("Legs");
});

test("returns Other when no decisive groups", () => {
    expect(classifySession(["Core", "Cardio", "Other"])).toBe("Other");
});

test("returns Other for an empty session", () => {
    expect(classifySession([])).toBe("Other");
});
