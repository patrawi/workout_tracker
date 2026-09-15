// bun test frontend/src/features/nutrition-estimation/photoCheck.test.ts
import { describe, expect, test } from "bun:test";
import { compareMeasuredToProposal, namesOverlap } from "./photoCheck";

const proposal = {
    dish_name: "Chicken rice",
    components: [
        { name: "Rice", weight_g: { low: 160, central: 200, high: 240 } },
        { name: "Fried egg", weight_g: { low: 40, central: 50, high: 60 } },
    ],
};

describe("compareMeasuredToProposal", () => {
    test("flags >50% weight deviation and unseen components, strips blank dish name", () => {
        const r = compareMeasuredToProposal([{ name: "Rice", grams: 320 }], proposal);
        expect(r.weightMismatches).toEqual([
            { name: "Rice", measuredGrams: 320, proposedCentralGrams: 200 },
        ]);
        expect(r.unseenComponents).toEqual(["Fried egg"]);
        expect(r.dishName).toBe("Chicken rice");
    });

    test("within tolerance and full agreement raise nothing", () => {
        const r = compareMeasuredToProposal(
            [{ name: "Rice", grams: 210 }, { name: "Egg", grams: 55 }],
            proposal,
        );
        expect(r.weightMismatches).toEqual([]);
        expect(r.unseenComponents).toEqual([]);
    });

    test("zero/non-finite VLM central never flags", () => {
        const r = compareMeasuredToProposal([{ name: "Rice", grams: 500 }], {
            dish_name: "  ",
            components: [{ name: "Rice", weight_g: { low: 0, central: 0, high: 0 } }],
        });
        expect(r.weightMismatches).toEqual([]);
        expect(r.dishName).toBeNull();
    });

    test("namesOverlap: containment yes, disjoint no, empty never", () => {
        expect(namesOverlap("Jasmine rice", "rice")).toBe(true);
        expect(namesOverlap("ข้าว", "pork")).toBe(false);
        expect(namesOverlap("", "rice")).toBe(false);
    });
});
