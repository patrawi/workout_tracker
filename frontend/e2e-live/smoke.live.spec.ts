import { test, expect } from "@playwright/test";

// LIVE smoke — real backend + local Postgres, NO mocks, NO LLM, NO browser.
// Proves the integration surface the mocked suite can't: real JWT auth, real
// routing, real DB insert/read/delete. The test cleans up the row it creates.
//
// Run:  E2E_PASSWORD=<your MASTER_PASSWORD> \
//         bunx playwright test --config=playwright.live.config.ts
//
// Caveat: /confirm creates a session row per run, and there is no session-delete
// endpoint, so each run leaves ONE empty orphan session in the local dev DB after
// the workout is deleted. Logged below, not hidden.

const PASSWORD = process.env.E2E_PASSWORD;
const MARK = "__E2E_LIVE_SMOKE__";

// Unwrap the app's { success, data } envelope (some routes return data directly).
const data = (body: any) => body?.data ?? body;

test.describe("live smoke (real backend + local DB)", () => {
  test.skip(!PASSWORD, "Set E2E_PASSWORD to run the live smoke.");

  test("auth → create → read → delete round-trips", async ({ request }) => {
    // 1. Real login. The JWT cookie is stored on this request context and sent
    //    automatically on every later call → authenticated.
    const login = await request.post("/api/auth/login", { data: { password: PASSWORD } });
    expect(login.ok(), "login should succeed with E2E_PASSWORD").toBeTruthy();

    // 2. Create a uniquely-marked workout via /confirm (the real logged-session
    //    path, no LLM). This also persists the overload capture fields live.
    const created = await request.post("/api/confirm", {
      data: {
        raw_text: "[e2e-live]",
        created_at: "2026-06-27 12:00:00",
        items: [{
          exercise_name: MARK, weight: 1, reps: 1, rpe: 1,
          is_bodyweight: false, is_assisted: false, pain: false,
          variant_details: "", notes_thai: "", notes_english: "", tags: [], muscle_group: "Other",
        }],
        activity: {
          walked_10k: false, did_liss: false, did_stretch: false, notes: "",
          session_type: "working", gym_profile: "The Gym Group Edinburgh Meadowbank Branch",
        },
      },
    });
    expect(created.ok()).toBeTruthy();
    const id = data(await created.json())[0]?.id;
    expect(id, "created workout should have an id").toBeTruthy();

    try {
      // 3. Read it back from the real DB.
      const list = await request.get("/api/workouts");
      const rows = data(await list.json());
      expect(rows.some((r: any) => r.id === id), "created row should be listed").toBeTruthy();
    } finally {
      // 4. Cleanup — always delete the row we made, even if the assertion failed.
      const del = await request.delete(`/api/workouts/${id}`);
      expect(del.ok(), "cleanup delete should succeed").toBeTruthy();
      console.log(`🧹 deleted workout ${id}. Note: 1 empty "[e2e-live]" session row remains (no session-delete endpoint).`);
    }

    // 5. Confirm it's gone — the round-trip is real.
    const after = await request.get("/api/workouts");
    const rowsAfter = data(await after.json());
    expect(rowsAfter.some((r: any) => r.id === id), "row should be gone after delete").toBeFalsy();
  });

  // Regression guard: POST /api/workouts (manual add) used to strip exercise_name
  // out of the body before reaching the service → "exercise_name cannot be empty".
  test("manual add (POST /api/workouts) persists exercise_name", async ({ request }) => {
    const login = await request.post("/api/auth/login", { data: { password: PASSWORD } });
    expect(login.ok()).toBeTruthy();

    const created = await request.post("/api/workouts", {
      data: { exercise_name: MARK, weight: 1, reps: 1, rpe: 1, muscle_group: "Other" },
    });
    expect(created.ok(), "manual add should succeed").toBeTruthy();
    const row = data(await created.json());
    expect(row.exercise_name).toBe(MARK);

    // Cleanup.
    const del = await request.delete(`/api/workouts/${row.id}`);
    expect(del.ok()).toBeTruthy();
    console.log(`🧹 deleted workout ${row.id} (manual-add regression guard).`);
  });
});
