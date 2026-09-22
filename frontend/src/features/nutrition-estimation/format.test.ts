import { describe, expect, test } from "bun:test";
import { formatInterval, roundToWhole } from "./format";

describe("formatInterval", () => {
    test("collapses a degenerate point interval to a single value", () => {
        expect(formatInterval({ low: 794, central: 794, high: 794 }, roundToWhole)).toBe("794");
    });

    test("keeps low–central–high when the values differ", () => {
        expect(formatInterval({ low: 200, central: 260, high: 330 }, roundToWhole)).toBe("200–260–330");
    });

    test("compares after rounding — near-equal points collapse", () => {
        expect(formatInterval({ low: 29.94, central: 29.96, high: 29.99 }, (n) => Math.round(n))).toBe("30");
    });
});
