import { test, expect, describe } from "bun:test";
import {
  isValidDateString,
  parseNumericId,
  parseDaysBack,
  isNonEmptyString,
} from "../../../src/lib/validation";

describe("validation utilities", () => {
  describe("isValidDateString", () => {
    test("validates YYYY-MM-DD format", () => {
      expect(isValidDateString("2024-01-15")).toBe(true);
      expect(isValidDateString("invalid")).toBe(false);
    });
  });

  describe("parseNumericId", () => {
    test("parses valid numeric strings", () => {
      expect(parseNumericId("123")).toBe(123);
      expect(parseNumericId("0")).toBe(0);
    });

    test("returns null for invalid strings", () => {
      expect(parseNumericId("abc")).toBeNull();
      expect(parseNumericId("-1")).toBeNull();
    });
  });

  describe("parseDaysBack", () => {
    test("parses valid numbers", () => {
      expect(parseDaysBack("7")).toBe(7);
      expect(parseDaysBack(14)).toBe(14);
    });

    test("returns fallback for invalid values", () => {
      expect(parseDaysBack("abc", 5)).toBe(5);
      expect(parseDaysBack(null, 0)).toBe(0);
    });
  });

  describe("isNonEmptyString", () => {
    test("returns true for non-empty strings", () => {
      expect(isNonEmptyString("hello")).toBe(true);
      expect(isNonEmptyString("  ")).toBe(false);
    });

    test("returns false for non-strings", () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
    });
  });
});
