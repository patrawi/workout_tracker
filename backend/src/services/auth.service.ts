// src/services/auth.service.ts

import { t } from "elysia";
import type { ConfigService } from "./config.service";
import { ok, fail } from "../lib/api";
import { AUTH_COOKIE_MAX_AGE_SECONDS } from "../constants";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("auth-service");

export const AUTH_PUBLIC_PATHS = new Set([
  "/",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/verify",
  "/health",
  "/login",
  "/analytics",
  "/profile",
  "/history",
  "/favicon.ico",
]);

export function isPublicPath(path: string): boolean {
  if (AUTH_PUBLIC_PATHS.has(path)) return true;
  if (path.startsWith("/history/")) return true;
  if (path.startsWith("/assets/")) return true;
  if (path.startsWith("/notifications/")) return true;
  if (path.startsWith("/cron/")) return true;
  if (/\.(js|css|ico|png|jpg|svg|woff|woff2|ttf|eot)$/.test(path)) return true;
  return false;
}

export const authLoginBodySchema = t.Object({
  password: t.String(),
});

type JwtService = {
  sign(payload: Record<string, unknown>): Promise<string>;
  verify(token: string): Promise<unknown>;
};

type AuthCookie = {
  value?: unknown;
  set(options: {
    value: string;
    httpOnly: boolean;
    maxAge: number;
    sameSite: "lax";
    path: string;
    secure?: boolean;
  }): void;
  remove(): void;
};

type StatusSetter = {
  status?: number | string;
};

const authCookieOptions = {
  httpOnly: true,
  maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  sameSite: "lax" as const,
  path: "/",
  secure: true,
};

export interface AuthService {
  authLoginBodySchema: ReturnType<typeof t.Object>;
  isAuthEnabled: boolean;
  isPublicPath(path: string): boolean;
  handleLogin(body: { password: string }, jwt: JwtService, auth?: AuthCookie): Promise<Record<string, unknown>>;
  handleLogout(auth?: AuthCookie): Record<string, unknown>;
  handleVerify(jwt: JwtService, auth?: AuthCookie): Promise<Record<string, unknown>>;
  requireAuth(jwt: JwtService, auth?: AuthCookie, set?: StatusSetter): Promise<void | Record<string, unknown>>;
}

export function createAuthService(config: ConfigService): AuthService {
  return {
    authLoginBodySchema,
    get isAuthEnabled() {
      return config.masterPassword.length > 0;
    },

    isPublicPath(path: string): boolean {
      return isPublicPath(path);
    },

    async handleLogin(
      body: { password: string },
      jwt: JwtService,
      auth?: AuthCookie
    ): Promise<Record<string, unknown>> {
      if (!auth) {
        return fail("Cookie not available.");
      }

      if (this.isAuthEnabled && body.password !== config.masterPassword) {
        return fail("Wrong password.");
      }

      const token = await jwt.sign({ role: "owner" });

      auth.set({
        value: token,
        ...authCookieOptions,
      });

      logger.info("User logged in");
      return { success: true };
    },

    handleLogout(auth?: AuthCookie): Record<string, unknown> {
      if (!auth) {
        return fail("Cookie not available.");
      }

      auth.remove();
      logger.info("User logged out");
      return { success: true };
    },

    async handleVerify(
      jwt: JwtService,
      auth?: AuthCookie
    ): Promise<Record<string, unknown>> {
      if (!this.isAuthEnabled) {
        return ok({ authenticated: true });
      }

      if (!auth?.value || typeof auth.value !== "string") {
        return ok({ authenticated: false });
      }

      try {
        const payload = await jwt.verify(auth.value);
        return ok({ authenticated: !!payload });
      } catch {
        return ok({ authenticated: false });
      }
    },

    async requireAuth(
      jwt: JwtService,
      auth?: AuthCookie,
      set?: StatusSetter
    ): Promise<void | Record<string, unknown>> {
      if (!this.isAuthEnabled) {
        return;
      }

      if (!auth?.value || typeof auth.value !== "string") {
        if (set) set.status = 401;
        return fail("Unauthorized. Please log in.");
      }

      const payload = await jwt.verify(auth.value);

      if (!payload) {
        if (set) set.status = 401;
        return fail("Session expired. Please log in again.");
      }
    },
  };
}

// Backward compatibility exports
/** @deprecated Use createAuthService factory instead */
export async function handleAuthLogin({
  body,
  jwt,
  auth,
}: {
  body: { password: string };
  jwt: JwtService;
  auth?: AuthCookie;
}) {
  const config = (globalThis as any).__authServiceConfig;
  const authService = createAuthService(config);
  return authService.handleLogin(body, jwt, auth);
}

/** @deprecated Use createAuthService factory instead */
export function handleAuthLogout(auth?: AuthCookie) {
  const config = (globalThis as any).__authServiceConfig;
  const authService = createAuthService(config);
  return authService.handleLogout(auth);
}

/** @deprecated Use createAuthService factory instead */
export async function getAuthVerifyResponse({
  jwt,
  auth,
}: {
  jwt: JwtService;
  auth?: AuthCookie;
}) {
  const config = (globalThis as any).__authServiceConfig;
  const authService = createAuthService(config);
  return authService.handleVerify(jwt, auth);
}

/** @deprecated Use createAuthService factory instead */
export async function requireAuthenticatedRequest({
  jwt,
  auth,
  set,
}: {
  jwt: JwtService;
  auth?: AuthCookie;
  set: StatusSetter;
}) {
  const config = (globalThis as any).__authServiceConfig;
  const authService = createAuthService(config);
  return authService.requireAuth(jwt, auth, set);
}
