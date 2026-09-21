// src/lib/google-token.ts
// Google ID-token verification via the tokeninfo endpoint (ticket B-001).
//
// Trade-off: the tokeninfo endpoint (https://oauth2.googleapis.com/tokeninfo)
// is one network round trip per login, and Google rate-limits it — but logins
// are rare (once per week per person with a 7-day cookie), so it beats shipping
// and rotating JWKS-key caching for a friends app. If we ever need zero-network
// verification, swap this module for a JWKS fetch + `jose`-style local verify;
// the AuthService only depends on `verifyGoogleIdToken`.

export interface GoogleTokenProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export type GoogleVerifyFailure =
  | "not-configured"
  | "invalid";

export type GoogleVerifyResult =
  | { ok: true; profile: GoogleTokenProfile }
  | { ok: false; reason: GoogleVerifyFailure; message: string };

export type FetchLike = (url: string) => Promise<Response>;

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo?id_token=";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

interface TokenInfoPayload {
  sub?: string;
  aud?: string;
  iss?: string;
  exp?: string | number;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
}

/**
 * Verify a Google ID token and extract the login profile.
 *
 * Validates (per OpenID Connect ID-token rules):
 *  - `aud` equals our GOOGLE_CLIENT_ID
 *  - `iss` is accounts.google.com (both canonical spellings)
 *  - `exp` is in the future
 *  - `email_verified` is true (we key accounts on email/sub)
 */
export async function verifyGoogleIdToken(
  idToken: string,
  options: { clientId?: string; fetchImpl?: FetchLike },
): Promise<GoogleVerifyResult> {
  const clientId = options.clientId?.trim();
  if (!clientId) {
    return {
      ok: false,
      reason: "not-configured",
      message: "Google login is not configured.",
    };
  }

  const fetchImpl = options.fetchImpl ?? ((url: string) => fetch(url));

  let payload: TokenInfoPayload;
  try {
    const response = await fetchImpl(`${TOKENINFO_URL}${encodeURIComponent(idToken)}`);
    if (!response.ok) {
      return { ok: false, reason: "invalid", message: "Invalid Google token." };
    }
    payload = (await response.json()) as TokenInfoPayload;
  } catch {
    // Network/parse failure — treat as invalid login rather than crashing.
    return { ok: false, reason: "invalid", message: "Could not verify Google token." };
  }

  if (payload.aud !== clientId) {
    return { ok: false, reason: "invalid", message: "Invalid Google token." };
  }
  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
    return { ok: false, reason: "invalid", message: "Invalid Google token." };
  }

  const expSeconds = typeof payload.exp === "string" ? Number(payload.exp) : payload.exp;
  if (
    typeof expSeconds !== "number" ||
    !Number.isFinite(expSeconds) ||
    expSeconds * 1000 <= Date.now()
  ) {
    return { ok: false, reason: "invalid", message: "Invalid Google token." };
  }

  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  if (!emailVerified) {
    return { ok: false, reason: "invalid", message: "Google email is not verified." };
  }

  if (!payload.sub || !payload.email || !payload.name) {
    return { ok: false, reason: "invalid", message: "Invalid Google token." };
  }

  return {
    ok: true,
    profile: {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture ?? null,
    },
  };
}
