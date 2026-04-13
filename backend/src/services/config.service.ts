// src/services/config.service.ts

export interface AppConfig {
  port: number;
  databaseUrl: string;
  masterPassword: string;
  jwtSecret: string;
  geminiApiKey: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  CRON_SECRET: string;
}

export class ConfigService {
  constructor(private readonly config: AppConfig) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): ConfigService {
    return new ConfigService({
      port: getNumberEnv(env, "PORT", 3000),
      databaseUrl: getRequiredEnv(env, "DATABASE_URL"),
      masterPassword: getOptionalEnv(env, "MASTER_PASSWORD"),
      jwtSecret: getOptionalEnv(env, "JWT_SECRET", "frictionless-tracker-secret-change-me"),
      geminiApiKey: getOptionalEnv(env, "GEMINI_API_KEY"),
      VAPID_PUBLIC_KEY: getOptionalEnv(env, "VAPID_PUBLIC_KEY"),
      VAPID_PRIVATE_KEY: getOptionalEnv(env, "VAPID_PRIVATE_KEY"),
      VAPID_SUBJECT: getOptionalEnv(env, "VAPID_SUBJECT", "mailto:admin@localhost"),
      CRON_SECRET: getOptionalEnv(env, "CRON_SECRET"),
    });
  }

  static forTest(overrides: Partial<AppConfig> = {}): ConfigService {
    return new ConfigService({
      port: 3000,
      databaseUrl: "postgresql://test:test@localhost:5432/test_db",
      masterPassword: "test-password",
      jwtSecret: "test-secret",
      geminiApiKey: "test-gemini-key",
      VAPID_PUBLIC_KEY: "test-vapid-public",
      VAPID_PRIVATE_KEY: "test-vapid-private",
      VAPID_SUBJECT: "mailto:test@localhost",
      CRON_SECRET: "test-cron-secret",
      ...overrides,
    });
  }

  get port() { return this.config.port; }
  get databaseUrl() { return this.config.databaseUrl; }
  get masterPassword() { return this.config.masterPassword; }
  get jwtSecret() { return this.config.jwtSecret; }
  get geminiApiKey() { return this.config.geminiApiKey; }
  get VAPID_PUBLIC_KEY() { return this.config.VAPID_PUBLIC_KEY; }
  get VAPID_PRIVATE_KEY() { return this.config.VAPID_PRIVATE_KEY; }
  get VAPID_SUBJECT() { return this.config.VAPID_SUBJECT; }
  get CRON_SECRET() { return this.config.CRON_SECRET; }
  get isAuthEnabled() { return this.config.masterPassword.length > 0; }
}

// Env reading helpers (now accept env object for testability)
function getRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} environment variable is not set.`);
  }
  return value;
}

function getOptionalEnv(env: NodeJS.ProcessEnv, name: string, fallback = ""): string {
  const value = env[name];
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  return value;
}

function getNumberEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = env[name];
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}
