import { t } from "elysia";
import { config, isAuthEnabled } from "../config";
import { fail } from "../lib/api";

const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 86400;

export const AUTH_PUBLIC_PATHS = new Set([
  "/",
  "/auth/login",
  "/auth/logout",
  "/auth/verify",
]);

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
};

export async function handleAuthLogin({
  body,
  jwt,
  auth,
}: {
  body: { password: string };
  jwt: JwtService;
  auth?: AuthCookie;
}) {
  if (!auth) {
    return fail("Cookie not available.");
  }

  if (isAuthEnabled && body.password !== config.masterPassword) {
    return fail("Wrong password.");
  }

  const token = await jwt.sign({ role: "owner" });

  auth.set({
    value: token,
    ...authCookieOptions,
  });

  return { success: true };
}

export function handleAuthLogout(auth?: AuthCookie) {
  if (!auth) {
    return fail("Cookie not available.");
  }

  auth.remove();
  return { success: true };
}

export async function getAuthVerifyResponse({
  jwt,
  auth,
}: {
  jwt: JwtService;
  auth?: AuthCookie;
}) {
  if (!isAuthEnabled) {
    return { authenticated: true };
  }

  if (!auth?.value || typeof auth.value !== "string") {
    return { authenticated: false };
  }

  try {
    const payload = await jwt.verify(auth.value);
    return { authenticated: !!payload };
  } catch {
    return { authenticated: false };
  }
}

export async function requireAuthenticatedRequest({
  jwt,
  auth,
  set,
}: {
  jwt: JwtService;
  auth?: AuthCookie;
  set: StatusSetter;
}) {
  if (!isAuthEnabled) {
    return;
  }

  if (!auth?.value || typeof auth.value !== "string") {
    set.status = 401;
    return fail("Unauthorized. Please log in.");
  }

  const payload = await jwt.verify(auth.value);

  if (!payload) {
    set.status = 401;
    return fail("Session expired. Please log in again.");
  }
}
