// Pure-unit tests for the Google login flow (ticket B-001): canned tokeninfo
// fetch + fake users repository + fake JWT — no database required.
import { describe, expect, mock, test } from "bun:test";
import { createAuthService, type AuthService } from "../../../src/services/auth.service";
import { ConfigService } from "../../../src/services/config.service";
import type { UsersRepository, UserRow } from "../../../src/repositories/users.repository";
import type { FetchLike } from "../../../src/lib/google-token";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";

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

function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 1,
    google_sub: "google-sub-123",
    email: "owner@example.com",
    name: "Owner",
    picture: null,
    is_owner: true,
    created_at: "2026-09-21T00:00:00.000Z",
    ...overrides,
  };
}

interface FakeUsersRepo extends UsersRepository {
  create: ReturnType<typeof mock>;
  claimPendingOwner: ReturnType<typeof mock>;
  updateProfile: ReturnType<typeof mock>;
}

function createFakeUsersRepo(initial: Partial<{ existing: UserRow | null; ownerPending: boolean }> = {}): FakeUsersRepo {
  const repo = {
    findById: mock(async (id: number) => (id === 1 ? makeUserRow() : null)),
    findByGoogleSub: mock(async () => initial.existing ?? null),
    ownerIsPending: mock(async () => initial.ownerPending ?? false),
    claimPendingOwner: mock(async () => makeUserRow()),
    create: mock(async () => makeUserRow({ id: 2, is_owner: false })),
    updateProfile: mock(async () => {}),
  };
  return repo as unknown as FakeUsersRepo;
}

function createFakeJwt() {
  const captured: Record<string, unknown>[] = [];
  return {
    captured,
    sign: mock(async (payload: Record<string, unknown>) => {
      captured.push(payload);
      return `jwt(${JSON.stringify(payload)})`;
    }),
    verify: mock(async () => null),
  };
}

function createFakeCookie() {
  return {
    value: undefined as unknown,
    set: mock((_opts: Record<string, unknown>) => {}),
    remove: mock(() => {}),
  };
}

function createService(options: {
  googleClientId?: string;
  usersRepo?: UsersRepository;
  fetchImpl?: FetchLike;
} = {}): AuthService {
  const config = ConfigService.forTest({ googleClientId: options.googleClientId ?? CLIENT_ID });
  return createAuthService(config, {
    usersRepo: options.usersRepo ?? createFakeUsersRepo(),
    fetchImpl: options.fetchImpl ?? fetchReturning(VALID_PAYLOAD),
  });
}

describe("handleGoogleLogin", () => {
  test("returns not-configured error when GOOGLE_CLIENT_ID is unset", async () => {
    const service = createService({ googleClientId: "" });
    const jwt = createFakeJwt();
    const cookie = createFakeCookie();

    const result = (await service.handleGoogleLogin({ id_token: "tok" }, jwt as any, cookie as any)) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain("Google login is not configured");
    expect(jwt.captured).toHaveLength(0);
  });

  test("claims the pending owner row on first real login and issues a user_id JWT", async () => {
    const usersRepo = createFakeUsersRepo({ ownerPending: true });
    const service = createService({ usersRepo });
    const jwt = createFakeJwt();
    const cookie = createFakeCookie();

    const result = (await service.handleGoogleLogin({ id_token: "tok" }, jwt as any, cookie as any)) as any;

    expect(result.success).toBe(true);
    expect(usersRepo.findByGoogleSub).toHaveBeenCalledWith("google-sub-123");
    expect(usersRepo.claimPendingOwner).toHaveBeenCalledWith({
      google_sub: "google-sub-123",
      email: "owner@example.com",
      name: "Owner",
      picture: "https://example.com/pic.jpg",
    });
    expect(usersRepo.create).not.toHaveBeenCalled();
    // Cookie set with the signed JWT; payload carries the owner's user_id.
    expect(cookie.set).toHaveBeenCalled();
    expect(jwt.captured[0]).toMatchObject({ role: "user", user_id: 1, email: "owner@example.com" });
  });

  test("signs in an existing Google user and refreshes the profile", async () => {
    const existing = makeUserRow({ id: 2, is_owner: false });
    const usersRepo = createFakeUsersRepo({ existing });
    const service = createService({ usersRepo });
    const jwt = createFakeJwt();
    const cookie = createFakeCookie();

    const result = (await service.handleGoogleLogin({ id_token: "tok" }, jwt as any, cookie as any)) as any;

    expect(result.success).toBe(true);
    expect(usersRepo.updateProfile).toHaveBeenCalledWith(2, {
      google_sub: "google-sub-123",
      email: "owner@example.com",
      name: "Owner",
      picture: "https://example.com/pic.jpg",
    });
    expect(usersRepo.claimPendingOwner).not.toHaveBeenCalled();
    expect(jwt.captured[0]).toMatchObject({ role: "user", user_id: 2 });
  });

  test("creates a new user when the owner is already claimed", async () => {
    const usersRepo = createFakeUsersRepo({ ownerPending: false });
    const service = createService({ usersRepo });
    const jwt = createFakeJwt();
    const cookie = createFakeCookie();

    const result = (await service.handleGoogleLogin({ id_token: "tok" }, jwt as any, cookie as any)) as any;

    expect(result.success).toBe(true);
    expect(usersRepo.claimPendingOwner).not.toHaveBeenCalled();
    expect(usersRepo.create).toHaveBeenCalledWith({
      google_sub: "google-sub-123",
      email: "owner@example.com",
      name: "Owner",
      picture: "https://example.com/pic.jpg",
    });
    expect(jwt.captured[0]).toMatchObject({ role: "user", user_id: 2 });
  });

  test("rejects a token the verifier rejects (wrong audience)", async () => {
    const service = createService({
      fetchImpl: fetchReturning({ ...VALID_PAYLOAD, aud: "other-client" }),
    });
    const jwt = createFakeJwt();
    const cookie = createFakeCookie();

    const result = (await service.handleGoogleLogin({ id_token: "tok" }, jwt as any, cookie as any)) as any;

    expect(result.success).toBe(false);
    expect(jwt.captured).toHaveLength(0);
  });

  test("rejects an expired token", async () => {
    const service = createService({
      fetchImpl: fetchReturning({ ...VALID_PAYLOAD, exp: String(Math.floor(Date.now() / 1000) - 5) }),
    });
    const jwt = createFakeJwt();
    const cookie = createFakeCookie();

    const result = (await service.handleGoogleLogin({ id_token: "tok" }, jwt as any, cookie as any)) as any;

    expect(result.success).toBe(false);
  });
});

describe("master-password login + guard", () => {
  test("handleLogin issues a JWT carrying user_id 1 (owner bypass)", async () => {
    const service = createService();
    const jwt = createFakeJwt();
    const cookie = createFakeCookie();

    const result = (await service.handleLogin({ password: "test-password" }, jwt as any, cookie as any)) as any;

    expect(result.success).toBe(true);
    expect(jwt.captured[0]).toEqual({ role: "owner", user_id: 1 });
  });

  test("resolveUserId extracts user_id from the JWT payload", async () => {
    const service = createService();
    const jwt = {
      sign: async () => "x",
      verify: async () => ({ role: "user", user_id: 7 }),
    };

    expect(await service.resolveUserId(jwt as any, { value: "tok" } as any)).toBe(7);
  });

  test("resolveUserId falls back to 1 for legacy master-password tokens", async () => {
    const service = createService();
    const jwt = {
      sign: async () => "x",
      verify: async () => ({ role: "owner" }),
    };

    expect(await service.resolveUserId(jwt as any, { value: "tok" } as any)).toBe(1);
  });
});

describe("handleVerify", () => {
  test("enriches the response with the user's profile when user_id is present", async () => {
    const usersRepo = createFakeUsersRepo();
    usersRepo.findById = mock(async () => makeUserRow({ email: "me@example.com", name: "Me" }));
    const service = createService({ usersRepo });
    const jwt = {
      sign: async () => "x",
      verify: async () => ({ role: "user", user_id: 1 }),
    };

    const result = (await service.handleVerify(jwt as any, { value: "tok" } as any)) as any;

    expect(result.data.authenticated).toBe(true);
    expect(result.data.user).toEqual({ id: 1, email: "me@example.com", name: "Me", picture: null });
  });

  test("still reports authenticated: false for an invalid cookie", async () => {
    const service = createService();
    const jwt = {
      sign: async () => "x",
      verify: async () => null,
    };

    const result = (await service.handleVerify(jwt as any, { value: "garbage" } as any)) as any;

    expect(result.data.authenticated).toBe(false);
  });
});
