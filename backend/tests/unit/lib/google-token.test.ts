import { describe, expect, test } from "bun:test";
import { verifyGoogleIdToken, type FetchLike } from "../../../src/lib/google-token";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";

/** Valid tokeninfo payload; helpers below mutate copies of it. */
const VALID_PAYLOAD = {
  sub: "google-sub-123",
  aud: CLIENT_ID,
  iss: "accounts.google.com",
  exp: String(Math.floor(Date.now() / 1000) + 3600),
  email: "owner@example.com",
  email_verified: "true",
  name: "Owner",
  picture: "https://example.com/pic.jpg",
};

function fetchReturning(payload: unknown, status = 200): FetchLike {
  return async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

describe("verifyGoogleIdToken", () => {
  test("returns not-configured when clientId is missing (no network call)", async () => {
    let called = false;
    const result = await verifyGoogleIdToken("token", {
      clientId: "",
      fetchImpl: async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not-configured");
    expect(called).toBe(false);
  });

  test("accepts a valid token and extracts the profile", async () => {
    const result = await verifyGoogleIdToken("token", {
      clientId: CLIENT_ID,
      fetchImpl: fetchReturning(VALID_PAYLOAD),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile).toEqual({
        sub: "google-sub-123",
        email: "owner@example.com",
        name: "Owner",
        picture: "https://example.com/pic.jpg",
      });
    }
  });

  test("rejects wrong audience", async () => {
    const result = await verifyGoogleIdToken("token", {
      clientId: CLIENT_ID,
      fetchImpl: fetchReturning({ ...VALID_PAYLOAD, aud: "someone-else.apps.googleusercontent.com" }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  test("rejects expired tokens", async () => {
    const result = await verifyGoogleIdToken("token", {
      clientId: CLIENT_ID,
      fetchImpl: fetchReturning({
        ...VALID_PAYLOAD,
        exp: String(Math.floor(Date.now() / 1000) - 10),
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  test("rejects unverified email", async () => {
    const result = await verifyGoogleIdToken("token", {
      clientId: CLIENT_ID,
      fetchImpl: fetchReturning({ ...VALID_PAYLOAD, email_verified: "false" }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  test("rejects non-Google issuer", async () => {
    const result = await verifyGoogleIdToken("token", {
      clientId: CLIENT_ID,
      fetchImpl: fetchReturning({ ...VALID_PAYLOAD, iss: "https://evil.example.com" }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  test("accepts the https:// issuer spelling", async () => {
    const result = await verifyGoogleIdToken("token", {
      clientId: CLIENT_ID,
      fetchImpl: fetchReturning({ ...VALID_PAYLOAD, iss: "https://accounts.google.com" }),
    });

    expect(result.ok).toBe(true);
  });

  test("rejects tokeninfo endpoint failures", async () => {
    const result = await verifyGoogleIdToken("token", {
      clientId: CLIENT_ID,
      fetchImpl: fetchReturning({ error: "invalid_token" }, 400),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });
});
