// src/services/auth.service.ts

import { t } from "elysia";
import type { ConfigService } from "./config.service";
import type { UsersRepository, UserRow } from "../repositories/users.repository";
import { verifyGoogleIdToken, type FetchLike } from "../lib/google-token";
import { ok, fail } from "../lib/api";
import { AUTH_COOKIE_MAX_AGE_SECONDS } from "../constants";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("auth-service");

export const AUTH_PUBLIC_PATHS = new Set([
  "/",
  "/api/auth/login",
  "/api/auth/google",
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

/** JWT payload shape issued by both login flows. */
export interface AuthJwtPayload {
  role: string;
  user_id: number;
  email?: string;
  name?: string;
}

/** Extract the scoped user id from a verified JWT payload (legacy tokens → 1). */
export function resolveUserIdFromPayload(payload: unknown): number {
  if (typeof payload === "object" && payload !== null && "user_id" in payload) {
    const userId = (payload as { user_id?: unknown }).user_id;
    if (typeof userId === "number" && Number.isInteger(userId) && userId > 0) {
      return userId;
    }
  }
  // Legacy master-password tokens (role: "owner") predate multi-user — owner is user 1.
  return 1;
}

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
  secure: process.env.NODE_ENV === "production",
};

export interface AuthService {
  authLoginBodySchema: ReturnType<typeof t.Object>;
  googleLoginBodySchema: ReturnType<typeof t.Object>;
  isAuthEnabled: boolean;
  isPublicPath(path: string): boolean;
  handleLogin(body: { password: string }, jwt: JwtService, auth?: AuthCookie): Promise<Record<string, unknown>>;
  handleGoogleLogin(body: { id_token: string }, jwt: JwtService, auth?: AuthCookie): Promise<Record<string, unknown>>;
  handleLogout(auth?: AuthCookie): Record<string, unknown>;
  handleVerify(jwt: JwtService, auth?: AuthCookie): Promise<Record<string, unknown>>;
  resolveUserId(jwt: JwtService, auth?: AuthCookie): Promise<number>;
  requireAuth(jwt: JwtService, auth?: AuthCookie, set?: StatusSetter): Promise<void | Record<string, unknown>>;
}

export interface AuthServiceDeps {
  usersRepo?: UsersRepository;
  fetchImpl?: FetchLike;
}

const googleLoginBodySchema = t.Object({
  id_token: t.String(),
});

export function createAuthService(config: ConfigService, deps: AuthServiceDeps = {}): AuthService {
  const { usersRepo, fetchImpl } = deps;

  /**
   * Upsert a Google-login user by google_sub. Special claim-first-login rule:
   * when the account is NEW and the seeded owner row (id=1) still carries the
   * placeholder google_sub='pending-owner', claim that row instead of creating
   * a new one — this transfers all legacy single-user data to the owner.
   */
  async function upsertGoogleUser(profile: {
    sub: string;
    email: string;
    name: string;
    picture: string | null;
  }): Promise<UserRow> {
    if (!usersRepo) {
      throw new Error("Users repository is not available.");
    }

    const input = {
      google_sub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    };

    const existing = await usersRepo.findByGoogleSub(profile.sub);
    if (existing) {
      await usersRepo.updateProfile(existing.id, input);
      return { ...existing, ...input };
    }

    if (await usersRepo.ownerIsPending()) {
      const claimed = await usersRepo.claimPendingOwner(input);
      if (claimed) {
        logger.info("Google login claimed pending owner row", { user_id: claimed.id });
        return claimed;
      }
    }

    return usersRepo.create(input);
  }

  return {
    authLoginBodySchema,
    googleLoginBodySchema,
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

      // Master-password login is the owner bypass — always user 1.
      const token = await jwt.sign({ role: "owner", user_id: 1 } satisfies AuthJwtPayload);

      auth.set({
        value: token,
        ...authCookieOptions,
      });

      logger.info("User logged in");
      return { success: true };
    },

    async handleGoogleLogin(
      body: { id_token: string },
      jwt: JwtService,
      auth?: AuthCookie
    ): Promise<Record<string, unknown>> {
      if (!auth) {
        return fail("Cookie not available.");
      }

      const verified = await verifyGoogleIdToken(body.id_token, {
        clientId: config.googleClientId,
        fetchImpl,
      });

      if (!verified.ok) {
        return fail(verified.message);
      }

      let user: UserRow;
      try {
        user = await upsertGoogleUser(verified.profile);
      } catch (error) {
        logger.error("Google login upsert failed", { error: String(error) });
        return fail("Google login failed. Please try again.");
      }

      const token = await jwt.sign({
        role: "user",
        user_id: user.id,
        email: user.email,
        name: user.name,
      } satisfies AuthJwtPayload);

      auth.set({
        value: token,
        ...authCookieOptions,
      });

      logger.info("User logged in with Google", { user_id: user.id });
      return {
        success: true,
        user: { id: user.id, email: user.email, name: user.name, picture: user.picture },
      };
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
        if (!payload) {
          return ok({ authenticated: false });
        }

        const userId = resolveUserIdFromPayload(payload);
        let user: { id: number; email: string; name: string; picture: string | null } | undefined;
        if (usersRepo) {
          const row = await usersRepo.findById(userId);
          if (row) {
            user = { id: row.id, email: row.email, name: row.name, picture: row.picture };
          }
        }

        return ok({ authenticated: true, user_id: userId, user });
      } catch {
        return ok({ authenticated: false });
      }
    },

    async resolveUserId(jwt: JwtService, auth?: AuthCookie): Promise<number> {
      // Auth disabled (no MASTER_PASSWORD) — single-user legacy mode, owner only.
      if (!this.isAuthEnabled) {
        return 1;
      }

      if (!auth?.value || typeof auth.value !== "string") {
        return 1; // Guard (requireAuth) rejects this request before handlers run.
      }

      try {
        const payload = await jwt.verify(auth.value);
        if (!payload) return 1;
        return resolveUserIdFromPayload(payload);
      } catch {
        return 1;
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
