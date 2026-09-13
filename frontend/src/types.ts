// Progressive Overload — session-level training context (spec §3.3 / §3.4).
export const SESSION_TYPES = [
    "working",
    "working_compromised",
    "form_check",
    "return_from_layoff",
    "return_from_injury",
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

// Human labels for the session_type dropdown.
export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
    working: "Working set (prime)",
    working_compromised: "Compromised (low sleep / heavy meal / low water)",
    form_check: "Form check (backing off weight)",
    return_from_layoff: "Return from layoff",
    return_from_injury: "Return from injury",
};

export const DEFAULT_GYM_PROFILE = "The Gym Group Edinburgh Meadowbank Branch";

export interface WorkoutData {
    exercise_name: string;
    weight: number;
    reps: number;
    rpe: number;
    is_bodyweight: boolean;
    is_assisted: boolean;
    pain: boolean;
    variant_details: string | null;
    notes_thai: string;
    notes_english: string;
    tags: string[];
}

export interface SessionActivityData {
    walked_10k: boolean;
    did_liss: boolean;
    did_stretch: boolean;
    notes: string;
    session_type?: SessionType;
    gym_profile?: string;
}

export interface WorkoutRow {
    id: number;
    session_id: number;
    session_type?: SessionType;
    gym_profile?: string;
    exercise_name: string;
    weight: number;
    reps: number;
    rpe: number;
    is_bodyweight: boolean;
    is_assisted: boolean;
    pain: boolean;
    variant_details: string;
    notes_thai: string;
    notes_english: string;
    tags: string[];
    muscle_group: string;
    created_at: string;
}

export interface ProfileData {
    weight_kg: number;
    height_cm: number;
    tdee: number;
    calories_intake: number;
    protein_target: number;
    carbs_target: number;
    fat_target: number;
    water_target_glasses: number;
}

export interface ProfileRow extends ProfileData {
    id: number;
    updated_at: string;
}

export interface WaterLog {
    date: string;
    glasses: number;
}

export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export interface NutritionItem {
    food_name: string;
    meal: MealType;
    protein: number;       // grams (after scaling)
    carbs: number;
    fat: number;
    alcohol: number;
    calories: number;      // label kcal, or computed: P*4 + C*4 + F*9 + alcohol*7
    amount: number;        // how much was eaten
    unit: string;          // "g" | "ml" | "serving" | "piece"
    has_missing_macros: boolean;  // true when LLM couldn't extract macros
    // Catalog grounding (RAG) — populated when macros came from the food catalog.
    matched_food_name?: string;   // name of the catalog food the macros came from
    matched_food_id?: string;     // catalog id of that food
    uncertain?: boolean;          // true when no confident catalog match — needs review
    unit_mismatch?: boolean;      // matched, but logged unit ≠ catalog unit — verify amount
    // Catalog basis (per `per_amount` `per_unit`) for live re-scaling on amount edit.
    catalog?: {
        per_amount: number;
        per_unit: string;
        protein: number;
        carbs: number;
        fat: number;
        alcohol?: number;
    };
}

export interface NutritionRow {
    id: number;
    date: string;
    meal: MealType;
    food_name: string;
    protein: number;
    carbs: number;
    fat: number;
    alcohol: number;
    calories: number;
    created_at: string;
}

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface VolumeData {
    muscle_group: string;
    sets: number;
}

// ——— Meal Observations (Nutrition Estimation V1) ———
// Snake_case mirrors of the backend JSON payloads:
// backend/src/nutrition-estimation/{types,service}.ts and
// backend/src/routes/nutrition-estimation.routes.ts.

/** Grams. Uncertainty interval on the mass side only (ADR 0018). */
export interface MassRange {
    low: number;
    central: number;
    high: number;
}

export type ComponentKind = "rice" | "main" | "side" | "broth" | "other";

export interface LatentHint {
    kind: "visible_oil" | "dryness" | "remaining_broth";
    level: "none" | "low" | "medium" | "high";
}

export interface MealMacronutrients {
    protein: number;
    carbs: number;
    fat: number;
    alcohol: number;
    calories: number;
}

/** Known Ingredient Evidence row attached to a persisted component. */
export interface MealIngredientEvidenceRow {
    id: number;
    component_id: number;
    name: string;
    source: "measured" | "declared" | "user_estimated";
    basis: "raw" | "served" | "unknown";
    grams_low: number | null;
    grams_central: number | null;
    grams_high: number | null;
    per100: MealMacronutrients | null;
}

export interface MealLatentHintRow {
    id: number;
    component_id: number;
    kind: LatentHint["kind"];
    level: LatentHint["level"];
}

/** Component input for POST /api/meal-observations (measured = point, estimated = MassRange). */
export interface PortionComponentInput {
    name: string;
    kind: ComponentKind;
    weight_g: number | MassRange;
    consumed_fraction: number;
    ingredient_evidence?: MealIngredientEvidenceRow[];
    latent_hints?: LatentHint[];
}

// ——— Interpret (VLM proposal, ADR 0017) ———

export interface VlmComponent {
    name: string;
    kind: ComponentKind;
    weight_g: MassRange;
    weight_confidence?: "high" | "medium" | "low";
    consumed_fraction?: number;
    consumed_fraction_confidence?: "high" | "medium" | "low";
    component_confidence: "high" | "medium" | "low";
    latent_hints?: LatentHint[];
}

export interface VlmProposal {
    dish_name: string;
    dish_name_confidence: "high" | "medium" | "low";
    components: VlmComponent[];
}

export type InterpretOutcome =
    | { status: "ok"; proposal: VlmProposal }
    | { status: "failed"; reason: "no_food" | "unreadable" }
    | { status: "unavailable" };

// ——— Persisted observation shapes ———

export type MealObservationStatus = "draft" | "confirmed" | "reference_pending";

export type MealObservationMatchTier = "manual" | "auto" | "ambiguous" | "gap";

/** Row in GET /api/meal-observations/pending (and the base of the detail payload). */
export interface PendingObservation {
    id: number;
    date: string;
    meal_type: MealType;
    menu_name: string;
    portion_mode: "measured" | "estimated";
    meal_source: string | null;
    status: MealObservationStatus;
    reference_id: number | null;
    match_tier: MealObservationMatchTier | null;
    calculation: CalculationResult | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface MealComponentRow {
    id: number;
    observation_id: number;
    name: string;
    kind: ComponentKind;
    weight_mode: "measured" | "estimated";
    weight_low: number | null;
    weight_central: number | null;
    weight_high: number | null;
    consumed_fraction: number;
    position: number;
    ingredient_evidence: MealIngredientEvidenceRow[];
    latent_hints: MealLatentHintRow[];
}

export interface ObservationRevision {
    id: number;
    observation_id: number;
    reference_id: number | null;
    reference_provider: string | null;
    reference_version: string | null;
    calculation: CalculationResult;
    status: "pending_confirmation" | "confirmed" | "superseded";
    created_at: string | null;
    confirmed_at: string | null;
}

/** Reference attached to an observation (backend ReferenceRow — camelCase). */
export interface MealObservationReference {
    id: number;
    provider: string;
    providerFoodCode: string;
    version: string;
    nameEn: string | null;
    nameTh: string | null;
    per100: MealMacronutrients;
}

export interface ObservationDetail extends PendingObservation {
    components: MealComponentRow[];
    latest_revision: ObservationRevision | null;
    reference: MealObservationReference | null;
}

// ——— Calculation + explanation (design spec §4, §6) ———

export interface MealComponentBreakdown {
    name: string;
    /** After consumed_fraction applied. */
    consumed_weight_g: MassRange;
    /** Per-nutrient contribution (grams for macros, kcal for calories). */
    contribution: Record<keyof MealMacronutrients, MassRange>;
}

export interface CalculationResult {
    /** low/central/high per nutrient (grams for macros, kcal for calories). */
    nutrients: Record<keyof MealMacronutrients, MassRange>;
    /** Soft constraints were relaxed (ADR 0019). */
    relaxed: boolean;
    relaxed_constraints: string[];
    /** Human-readable list of what widened the range. */
    drivers: string[];
    per_component: MealComponentBreakdown[];
}

/** Explanation payload attached to create/GET/confirm/resolve responses (design spec §6). */
export interface ObservationExplanation {
    reference: { id: number; provider: string; version: string } | null;
    portion_mode: "measured" | "estimated";
    relaxed: boolean;
    relaxed_constraints: string[];
    manually_entered_fields: boolean;
    components: Array<{ name: string; manually_entered_fields: boolean }>;
}

export interface ObservationDetailWithExplanation extends ObservationDetail {
    explanation: ObservationExplanation;
}

// ——— Create / confirm / resolve outcomes (service.ts) ———

export interface CreateMealObservationInput {
    date?: string;
    meal: MealType;
    menu_name: string;
    portion_mode: "measured" | "estimated";
    meal_source?: string;
    has_after_image?: boolean;
    reference_id?: number;
    components: PortionComponentInput[];
}

export type CreateObservationMatch =
    | { tier: "manual" | "auto"; reference: MealObservationReference }
    | { tier: "ambiguous"; candidates: Array<MealObservationReference & { score: number }> }
    | { tier: "gap" };

export interface CreateOutcome {
    observation: ObservationDetail;
    match: CreateObservationMatch;
    explanation: ObservationExplanation;
}

/** Shape returned by confirm and resolve (recalculated estimate + explanation). */
export interface CalculateObservationOutcome {
    observation: ObservationDetail;
    revision: ObservationRevision;
    reference: MealObservationReference | null;
    explanation: ObservationExplanation;
}

// ——— Reference search (GET /api/meal-observations/references/search) ———

export interface ReferenceSearchItem {
    id: number;
    provider: string;
    provider_food_code: string;
    version: string;
    name_th: string | null;
    name_en: string | null;
    protein: number;
    carbs: number;
    fat: number;
    alcohol: number;
    calories: number;
}
