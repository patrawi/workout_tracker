import { test, expect, ok, fulfilJson } from "./fixtures";
import type { Page } from "@playwright/test";

// Meal Observation logging flow (Nutrition Estimation V1): LogMealModal
// (form → review → result → confirm) and the PendingMealDialog
// (pending row → reference search → resolve → confirm). All endpoints mocked
// with payloads mirroring backend/src/nutrition-estimation/{service,types}.ts.

// ——— Fixtures (snake_case mirrors of the backend JSON) ———

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const REFERENCE = {
  id: 12,
  provider: "thaifcd",
  providerFoodCode: "02-1-001",
  version: "2024.1",
  nameEn: "Chicken rice",
  nameTh: "ข้าวมันไก่",
  per100: { protein: 15, carbs: 40, fat: 8, alcohol: 0, calories: 300 },
};

const CALCULATION = {
  nutrients: {
    protein: { low: 30, central: 38, high: 46 },
    carbs: { low: 70, central: 85, high: 100 },
    fat: { low: 14, central: 20, high: 26 },
    alcohol: { low: 0, central: 0, high: 0 },
    calories: { low: 540, central: 690, high: 840 },
  },
  relaxed: false,
  relaxed_constraints: [],
  drivers: ["Before-photo plate scale"],
  per_component: [
    {
      name: "Rice",
      consumed_weight_g: { low: 160, central: 200, high: 240 },
      contribution: {
        protein: { low: 24, central: 30, high: 36 },
        carbs: { low: 64, central: 80, high: 96 },
        fat: { low: 12, central: 16, high: 20 },
        alcohol: { low: 0, central: 0, high: 0 },
        calories: { low: 480, central: 600, high: 720 },
      },
    },
  ],
};

const EXPLANATION = {
  reference: { id: 12, provider: "thaifcd", version: "2024.1" },
  portion_mode: "estimated",
  relaxed: false,
  relaxed_constraints: [],
  manually_entered_fields: false,
  components: [{ name: "Rice", manually_entered_fields: false }],
};

const COMPONENT_ROW = {
  id: 1,
  observation_id: 101,
  name: "Rice",
  kind: "rice",
  weight_mode: "estimated",
  weight_low: 160,
  weight_central: 200,
  weight_high: 240,
  consumed_fraction: 1,
  position: 0,
  ingredient_evidence: [],
  latent_hints: [],
};

const REVISION = {
  id: 5,
  observation_id: 101,
  reference_id: 12,
  reference_provider: "thaifcd",
  reference_version: "2024.1",
  calculation: CALCULATION,
  status: "pending_confirmation",
  created_at: "2026-09-13T00:00:00Z",
  confirmed_at: null,
};

const OBSERVATION = {
  id: 101,
  date: "2026-09-13",
  meal_type: "Lunch",
  menu_name: "Chicken rice",
  portion_mode: "estimated",
  meal_source: null,
  status: "draft",
  reference_id: 12,
  match_tier: "auto",
  calculation: CALCULATION,
  created_at: "2026-09-13T00:00:00Z",
  updated_at: null,
  components: [COMPONENT_ROW],
  latest_revision: REVISION,
  reference: REFERENCE,
};

const CALCULATED_OUTCOME = {
  observation: OBSERVATION,
  match: { tier: "auto", reference: REFERENCE },
  explanation: EXPLANATION,
};

const AMBIGUOUS_OUTCOME = {
  observation: {
    ...OBSERVATION,
    reference_id: null,
    match_tier: "ambiguous",
    calculation: null,
    latest_revision: null,
    reference: null,
  },
  match: { tier: "ambiguous", candidates: [{ ...REFERENCE, score: 0.82 }] },
  explanation: { ...EXPLANATION, reference: null },
};

const RESOLVE_OUTCOME = {
  observation: OBSERVATION,
  revision: REVISION,
  reference: REFERENCE,
  explanation: EXPLANATION,
};

const GAP_OUTCOME = {
  observation: {
    ...OBSERVATION,
    reference_id: null,
    match_tier: "gap",
    calculation: null,
    latest_revision: null,
    reference: null,
  },
  match: { tier: "gap" },
  explanation: { ...EXPLANATION, reference: null },
};

const PROPOSAL = {
  status: "ok",
  proposal: {
    dish_name: "Chicken rice",
    dish_name_confidence: "high",
    components: [
      {
        name: "Rice",
        kind: "rice",
        weight_g: { low: 160, central: 200, high: 240 },
        component_confidence: "high",
        latent_hints: [{ kind: "visible_oil", level: "low" }],
      },
    ],
  },
};

const PENDING_ROW = {
  id: 7,
  date: "2026-09-12",
  meal_type: "Dinner",
  menu_name: "Green curry",
  portion_mode: "estimated",
  meal_source: null,
  status: "reference_pending",
  reference_id: null,
  match_tier: "gap",
  calculation: null,
  created_at: "2026-09-12T00:00:00Z",
  updated_at: null,
};

const PENDING_DETAIL = {
  ...PENDING_ROW,
  components: [
    {
      id: 3,
      observation_id: 7,
      name: "Rice",
      kind: "rice",
      weight_mode: "estimated",
      weight_low: 160,
      weight_central: 200,
      weight_high: 240,
      consumed_fraction: 1,
      position: 0,
      ingredient_evidence: [],
      latent_hints: [],
    },
  ],
  latest_revision: null,
  reference: null,
  explanation: {
    reference: null,
    portion_mode: "estimated",
    relaxed: false,
    relaxed_constraints: [],
    manually_entered_fields: false,
    components: [{ name: "Rice", manually_entered_fields: false }],
  },
};

const SEARCH_ITEM = {
  id: 12,
  provider: "thaifcd",
  provider_food_code: "02-1-001",
  version: "2024.1",
  name_th: "ข้าวมันไก่",
  name_en: "Chicken rice",
  protein: 15,
  carbs: 40,
  fat: 8,
  alcohol: 0,
  calories: 300,
};

// ——— Helpers ———

/** Mock the static pending list (empty — the modal tests don't use it). */
async function mockPendingEmpty(page: Page) {
  await page.route("**/api/meal-observations/pending", (r) => fulfilJson(r, ok([])));
}

async function openLogModal(page: Page) {
  await page.goto("/nutrition");
  await page.getByRole("button", { name: /Log meal with photo/ }).click();
  await expect(page.getByText("Step 1 of 3 — Details")).toBeVisible();
}

async function attachBeforePhoto(page: Page) {
  await page.setInputFiles('input[aria-label="Before photo"]', {
    name: "before.png",
    mimeType: "image/png",
    buffer: PNG_1PX,
  });
  await expect(page.getByAltText("Before photo preview")).toBeVisible();
}

// ——— Tests ———

test("happy path: form → review → result shows the range → confirm", async ({ authedPage: page, mock }) => {
  await mockPendingEmpty(page);
  await mock("**/api/meal-observations/interpret", ok(PROPOSAL));
  await mock("**/api/meal-observations", ok(CALCULATED_OUTCOME));
  await mock("**/api/meal-observations/101/confirm", ok(RESOLVE_OUTCOME));

  await openLogModal(page);
  await page.getByLabel("Menu name *").fill("Chicken rice");
  await page.getByLabel("Meal", { exact: true }).selectOption("Lunch");
  await attachBeforePhoto(page);

  await page.getByRole("button", { name: "Analyze photo" }).click();

  // Review step: proposal loaded into editable rows (AI is a proposal only).
  await expect(page.getByText("Step 2 of 3 — Review estimate")).toBeVisible();
  await expect(page.locator('input[aria-label="Component 1 name"]')).toHaveValue("Rice");
  await expect(page.getByText("Visible oil · low")).toBeVisible(); // latent hint pill

  const createReq = page.waitForRequest("**/api/meal-observations");
  await page.getByRole("button", { name: "Save estimate" }).click();
  const createBody = (await createReq).postDataJSON();
  expect(createBody.menu_name).toBe("Chicken rice");
  expect(createBody.meal).toBe("Lunch");
  expect(createBody.portion_mode).toBe("estimated");
  expect(createBody.has_after_image).toBe(false);
  expect(typeof createBody.date).toBe("string");
  expect(createBody.components[0]).toMatchObject({
    name: "Rice",
    kind: "rice",
    weight_g: { low: 160, central: 200, high: 240 },
    consumed_fraction: 1,
  });

  // Result step: Plausible Nutrition Range (low–central–high) + Confirm.
  await expect(page.getByText("Step 3 of 3 — Result")).toBeVisible();
  await expect(page.getByText("Plausible Nutrition Range")).toBeVisible();
  await expect(page.getByText("540–690–840")).toBeVisible();
  await expect(page.getByText(/thaifcd v2024\.1/).first()).toBeVisible();

  const confirmReq = page.waitForRequest("**/api/meal-observations/101/confirm");
  await page.getByRole("button", { name: "Confirm & log" }).click();
  await confirmReq;

  // Success flash + modal closed.
  await expect(page.getByText("Logged — daily totals updated")).toBeVisible();
  await expect(page.getByText("Step 1 of 3 — Details")).not.toBeVisible();
});

test("oversized image is rejected inline before interpret", async ({ authedPage: page }) => {
  await mockPendingEmpty(page);

  await openLogModal(page);
  await page.getByLabel("Menu name *").fill("Chicken rice");
  await page.setInputFiles('input[aria-label="Before photo"]', {
    name: "huge.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
  });

  await expect(page.getByText(/is over 4 MB/)).toBeVisible();
  // No photo attached → the analyze button stays disabled, interpret never fires.
  await expect(page.getByRole("button", { name: "Analyze photo" })).toBeDisabled();
});

test("failed interpret never blocks — drops into manual entry (ADR 0017)", async ({ authedPage: page, mock }) => {
  await mockPendingEmpty(page);
  await mock("**/api/meal-observations/interpret", ok({ status: "failed", reason: "no_food" }));
  await mock("**/api/meal-observations", ok(CALCULATED_OUTCOME));

  await openLogModal(page);
  await page.getByLabel("Menu name *").fill("Grilled chicken");
  await attachBeforePhoto(page);
  await page.getByRole("button", { name: "Analyze photo" }).click();

  // Dismissible notice + empty manual row.
  await expect(page.getByText("Couldn't analyze the photo — enter components manually.")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss notice" }).click();
  await expect(page.getByText("Couldn't analyze the photo — enter components manually.")).not.toBeVisible();

  const nameInput = page.locator('input[aria-label="Component 1 name"]');
  await expect(nameInput).toHaveValue("");
  await nameInput.fill("Grilled chicken");
  await page.locator("#comp-central-0").fill("180");
  await page.locator("#comp-low-0").fill("150");
  await page.locator("#comp-high-0").fill("210");

  const createReq = page.waitForRequest("**/api/meal-observations");
  await page.getByRole("button", { name: "Save estimate" }).click();
  const createBody = (await createReq).postDataJSON();
  expect(createBody.components[0].name).toBe("Grilled chicken");
  expect(createBody.components[0].weight_g).toEqual({ low: 150, central: 180, high: 210 });

  await expect(page.getByText("Plausible Nutrition Range")).toBeVisible();
});

test("ambiguous match → pick a candidate → resolve → confirm", async ({ authedPage: page, mock }) => {
  await mockPendingEmpty(page);
  await mock("**/api/meal-observations/interpret", ok(PROPOSAL));
  await mock("**/api/meal-observations", ok(AMBIGUOUS_OUTCOME));
  await mock("**/api/meal-observations/101/resolve", ok(RESOLVE_OUTCOME));
  await mock("**/api/meal-observations/101/confirm", ok(RESOLVE_OUTCOME));

  await openLogModal(page);
  await page.getByLabel("Menu name *").fill("Chicken rice");
  await attachBeforePhoto(page);
  await page.getByRole("button", { name: "Analyze photo" }).click();
  await page.getByRole("button", { name: "Save estimate" }).click();

  // Candidate list (name + provider/version + code), no range yet.
  await expect(page.getByText(/Several references match/)).toBeVisible();
  await expect(page.getByText("Plausible Nutrition Range")).not.toBeVisible();

  const resolveReq = page.waitForRequest("**/api/meal-observations/101/resolve");
  await page.getByRole("button", { name: /Use reference Chicken rice/ }).click();
  const resolveBody = (await resolveReq).postDataJSON();
  expect(resolveBody.reference_id).toBe(12);

  // Recalculated → back to draft → range + confirm.
  await expect(page.getByText("Plausible Nutrition Range")).toBeVisible();
  const confirmReq = page.waitForRequest("**/api/meal-observations/101/confirm");
  await page.getByRole("button", { name: "Confirm & log" }).click();
  await confirmReq;
  await expect(page.getByText("Logged — daily totals updated")).toBeVisible();
});

test("gap match → reference-pending notice, no macros fabricated", async ({ authedPage: page, mock }) => {
  await mockPendingEmpty(page);
  await mock("**/api/meal-observations/interpret", ok(PROPOSAL));
  await mock("**/api/meal-observations", ok(GAP_OUTCOME));

  await openLogModal(page);
  await page.getByLabel("Menu name *").fill("Mystery stir fry");
  await attachBeforePhoto(page);
  await page.getByRole("button", { name: "Analyze photo" }).click();
  await page.getByRole("button", { name: "Save estimate" }).click();

  await expect(page.getByText(/Saved as reference-pending — no macros until a reference is added/)).toBeVisible();
  await expect(page.getByText("Plausible Nutrition Range")).not.toBeVisible();
  // Only Close is offered — there is nothing to confirm yet.
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Step 3 of 3 — Result")).not.toBeVisible();
});

test("pending meals: row → dialog → search → resolve → confirm → row disappears", async ({ authedPage: page }) => {
  let confirmed = false;
  await page.route("**/api/meal-observations/pending", (r) =>
    fulfilJson(r, ok(confirmed ? [] : [PENDING_ROW])),
  );
  await page.route("**/api/meal-observations/7", (r) => fulfilJson(r, ok(PENDING_DETAIL)));
  await page.route("**/api/meal-observations/references/search*", (r) =>
    fulfilJson(r, ok({ items: [SEARCH_ITEM] })),
  );
  await page.route("**/api/meal-observations/7/resolve", (r) => fulfilJson(r, ok(RESOLVE_OUTCOME)));
  await page.route("**/api/meal-observations/7/confirm", (r) => {
    confirmed = true;
    return fulfilJson(r, ok(RESOLVE_OUTCOME));
  });

  await page.goto("/nutrition");

  // Pending section renders with a status badge; click opens the resolve dialog.
  await expect(page.getByText("Pending meals")).toBeVisible();
  await expect(page.getByText("Needs reference")).toBeVisible();
  await page.getByRole("button", { name: /Green curry/ }).click();

  await expect(page.getByText(/Green curry · Sep/)).toBeVisible();
  await expect(page.getByText("Components")).toBeVisible();
  await expect(page.getByText("Plausible Nutrition Range")).not.toBeVisible();

  // Debounced reference search → pick a candidate → resolve.
  await page.getByLabel("Find a nutrition reference").fill("chicken rice");
  const resolveReq = page.waitForRequest(/\/api\/meal-observations\/7\/resolve/);
  await page.getByRole("button", { name: /Use reference Chicken rice/ }).click();
  const resolveBody = (await resolveReq).postDataJSON();
  expect(resolveBody.reference_id).toBe(12);

  await expect(page.getByText("Plausible Nutrition Range")).toBeVisible();
  const confirmReq = page.waitForRequest("**/api/meal-observations/7/confirm");
  await page.getByRole("button", { name: "Confirm & log" }).click();
  await confirmReq;

  await expect(page.getByText("Logged — daily totals updated")).toBeVisible();
  // Invalidated pending query refetches (now empty) → the row disappears.
  await expect(page.getByRole("button", { name: /Green curry/ })).toHaveCount(0);
});
