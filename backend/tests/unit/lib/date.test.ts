import { test, expect, describe } from "bun:test";
import { isValidDateString, getLocalDateString } from "../../../src/lib/date";

describe("date utilities", () => {
  describe("isValidDateString", () => {
    test("validates correct date strings", () => {
      expect(isValidDateString("2024-01-15")).toBe(true);
      expect(isValidDateString("2023-12-31")).toBe(true);
    });

    test("rejects invalid date strings", () => {
      expect(isValidDateString("not-a-date")).toBe(false);
      expect(isValidDateString("")).toBe(false);
      expect(isValidDateString("15-01-2024")).toBe(false);
    });
  });

  describe("getLocalDateString", () => {
    test("returns YYYY-MM-DD format", () => {
      const result = getLocalDateString();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
