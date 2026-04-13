import { test, expect, describe } from "bun:test";
import { createAIService } from "../../../src/services/ai.service";
import { ConfigService } from "../../../src/services/config.service";

describe("createAIService", () => {
  test("throws when API key is missing", () => {
    const config = ConfigService.forTest({ geminiApiKey: "" });

    expect(() => createAIService(config)).toThrow("API key must be set");
  });

  test("creates service successfully with valid API key", () => {
    const config = ConfigService.forTest({ geminiApiKey: "test-key" });
    const service = createAIService(config);

    expect(service.parseWorkoutText).toBeDefined();
    expect(service.parseNutritionText).toBeDefined();
    expect(typeof service.parseWorkoutText).toBe("function");
    expect(typeof service.parseNutritionText).toBe("function");
  });
});
