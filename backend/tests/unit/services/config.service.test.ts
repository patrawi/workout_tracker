import { describe, expect, test } from "bun:test";
import { ConfigService } from "../../../src/services/config.service";

const baseEnv = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test_db",
};

describe("ConfigService.fromEnv", () => {
  test("allows missing JWT_SECRET when authentication is disabled", () => {
    const config = ConfigService.fromEnv(baseEnv);

    expect(config.isAuthEnabled).toBe(false);
    expect(config.jwtSecret).toBe("frictionless-tracker-secret-change-me");
  });

  test("requires JWT_SECRET when MASTER_PASSWORD enables authentication", () => {
    expect(() =>
      ConfigService.fromEnv({
        ...baseEnv,
        MASTER_PASSWORD: "owner-password",
      }),
    ).toThrow("JWT_SECRET must be set");
  });

  test("rejects default or short JWT_SECRET when authentication is enabled", () => {
    expect(() =>
      ConfigService.fromEnv({
        ...baseEnv,
        MASTER_PASSWORD: "owner-password",
        JWT_SECRET: "frictionless-tracker-secret-change-me",
      }),
    ).toThrow("default fallback");

    expect(() =>
      ConfigService.fromEnv({
        ...baseEnv,
        MASTER_PASSWORD: "owner-password",
        JWT_SECRET: "too-short",
      }),
    ).toThrow("at least 32 characters");
  });

  test("accepts a strong JWT_SECRET when authentication is enabled", () => {
    const config = ConfigService.fromEnv({
      ...baseEnv,
      MASTER_PASSWORD: "owner-password",
      JWT_SECRET: "0123456789abcdef0123456789abcdef",
    });

    expect(config.isAuthEnabled).toBe(true);
    expect(config.jwtSecret).toBe("0123456789abcdef0123456789abcdef");
  });
});
