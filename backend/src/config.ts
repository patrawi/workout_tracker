export function getRequiredEnv(name: string): string {
    const value = process.env[name];

    if (!value || value.trim().length === 0) {
        throw new Error(`${name} environment variable is not set.`);
    }

    return value;
}

export function getOptionalEnv(name: string, fallback = ""): string {
    const value = process.env[name];

    if (!value || value.trim().length === 0) {
        return fallback;
    }

    return value;
}

export function getNumberEnv(name: string, fallback: number): number {
    const value = process.env[name];

    if (!value || value.trim().length === 0) {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
    port: getNumberEnv("PORT", 3000),
    databaseUrl: getRequiredEnv("DATABASE_URL"),
    masterPassword: getOptionalEnv("MASTER_PASSWORD"),
    jwtSecret: getOptionalEnv("JWT_SECRET", "frictionless-tracker-secret-change-me"),
    geminiApiKey: getOptionalEnv("GEMINI_API_KEY"),
};

export const isAuthEnabled = config.masterPassword.length > 0;
