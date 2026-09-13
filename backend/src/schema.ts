import {
    pgTable,
    serial,
    text,
    real,
    integer,
    boolean,
    timestamp,
    jsonb,
    pgEnum,
    index,
    uniqueIndex,
    vector,
} from "drizzle-orm/pg-core";
import type { ExerciseRole, ProgressionLadder } from "./constants";
import type {
    CalculationResult,
    ComponentKind,
    IngredientBasis,
    Macronutrients,
    MatchTier,
    EvidenceSource,
    LatentHintKind,
    LatentHintLevel,
} from "./nutrition-estimation/types";

// Embedding dimension for the food catalog (Gemini text-embedding-004).
export const EMBEDDING_DIMENSIONS = 768;

// ——— Enums ———
export const mealTypeEnum = pgEnum("meal_type", [
    "Breakfast",
    "Lunch",
    "Dinner",
    "Snack",
]);

// Progressive Overload — session_type (spec §3.3). Drives go-signal guardrails.
export const sessionTypeEnum = pgEnum("session_type", [
    "working",
    "working_compromised",
    "form_check",
    "return_from_layoff",
    "return_from_injury",
]);

// ——— Sessions Table ———
export const sessions = pgTable("sessions", {
    id: serial("id").primaryKey(),
    raw_input: text("raw_input").notNull(),
    walked_10k: boolean("walked_10k").default(false),
    did_liss: boolean("did_liss").default(false),
    did_stretch: boolean("did_stretch").default(false),
    notes: text("notes").default(""),
    // Progressive Overload (spec §3.3 / §3.4) — session-level training context.
    session_type: sessionTypeEnum("session_type").default("working").notNull(),
    gym_profile: text("gym_profile").default("").notNull(),
    created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
});

// ——— Workouts Table ———
export const workouts = pgTable("workouts", {
    id: serial("id").primaryKey(),
    session_id: integer("session_id")
        .notNull()
        .references(() => sessions.id),
    exercise_name: text("exercise_name").notNull(),
    weight: real("weight").default(0),
    reps: integer("reps").default(0),
    rpe: integer("rpe").default(0),
    is_bodyweight: boolean("is_bodyweight").default(false),
    is_assisted: boolean("is_assisted").default(false),
    // Progressive Overload (spec §3.2) — per-set pain flag. Free-text comment = notes_*.
    pain: boolean("pain").default(false).notNull(),
    variant_details: text("variant_details").default(""),
    notes_thai: text("notes_thai").default(""),
    notes_english: text("notes_english").default(""),
    tags: jsonb("tags").$type<string[]>().default([]),
    muscle_group: text("muscle_group").default("Other").notNull(),
    created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
}, (table) => [
    index("workouts_created_at_idx").on(table.created_at),
    index("workouts_exercise_name_idx").on(table.exercise_name),
]);

// ——— Coach Plan Table (current target per exercise per day-type) ———
// The evolving progression state. day_type is 'Push' | 'Pull' | 'Legs'.
export const coachPlan = pgTable("coach_plan", {
    id: serial("id").primaryKey(),
    day_type: text("day_type").notNull(),
    position: integer("position").default(0).notNull(),
    exercise_name: text("exercise_name").notNull(),
    is_bodyweight: boolean("is_bodyweight").default(false).notNull(),
    target_weight: real("target_weight"),
    sets: integer("sets").default(3).notNull(),
    rep_low: integer("rep_low").default(0).notNull(),
    rep_high: integer("rep_high").default(0).notNull(),
    rpe_low: integer("rpe_low").default(0).notNull(),
    rpe_high: integer("rpe_high").default(0).notNull(),
    exercise_role: text("exercise_role").$type<ExerciseRole>().default("isolation").notNull(),
    progression_ladder: text("progression_ladder").$type<ProgressionLadder>().default("double_12").notNull(),
    notes: text("notes").default("").notNull(),
    updated_at: timestamp("updated_at", { mode: "string" }).defaultNow(),
}, (table) => [
    index("coach_plan_day_type_idx").on(table.day_type),
]);

// ——— Coach Knowledge Table (editable training doc, in sections) ———
export const coachKnowledge = pgTable("coach_knowledge", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").default("").notNull(),
    position: integer("position").default(0).notNull(),
    updated_at: timestamp("updated_at", { mode: "string" }).defaultNow(),
}, (table) => [
    index("coach_knowledge_position_idx").on(table.position),
]);

// ——— Profile Table (single row, id always = 1) ———
export const profile = pgTable("profile", {
    id: integer("id").primaryKey().default(1),
    weight_kg: real("weight_kg").default(0),
    height_cm: real("height_cm").default(0),
    tdee: real("tdee").default(0),
    calories_intake: real("calories_intake").default(0),
    protein_target: real("protein_target").default(0),
    carbs_target: real("carbs_target").default(0),
    fat_target: real("fat_target").default(0),
    water_target_glasses: integer("water_target_glasses").default(10),
    updated_at: timestamp("updated_at", { mode: "string" }).defaultNow(),
});

// ——— Rest Days Table ———
export const restDays = pgTable("rest_days", {
    id: serial("id").primaryKey(),
    date: text("date").notNull().unique(),              // "YYYY-MM-DD"
    walked_10k: boolean("walked_10k").default(false),
    did_liss: boolean("did_liss").default(false),
    did_stretch: boolean("did_stretch").default(false),
    notes: text("notes").default(""),
    created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
}, (table) => [
    index("rest_days_created_at_idx").on(table.created_at),
]);

// ——— Bodyweight Logs Table ———
export const bodyweightLogs = pgTable("bodyweight_logs", {
    id: serial("id").primaryKey(),
    date: text("date").notNull().unique(), // "YYYY-MM-DD"
    weight_kg: real("weight_kg").notNull(),
    created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
});

// ——— Nutrition Logs Table ———
export const nutritionLogs = pgTable(
    "nutrition_logs",
    {
        id: serial("id").primaryKey(),
        date: text("date").notNull(),                          // "YYYY-MM-DD"
        meal: mealTypeEnum("meal").notNull(),                  // "Breakfast" | "Lunch" | "Dinner" | "Snack"
        food_name: text("food_name").notNull(),
        protein: real("protein").default(0),                   // grams, after scaling
        carbs: real("carbs").default(0),                       // grams, after scaling
        fat: real("fat").default(0),                           // grams, after scaling
        alcohol: real("alcohol").default(0),                   // grams, after scaling
        calories: real("calories").default(0),                 // label kcal, or computed: P×4 + C×4 + F×9 + alcohol×7
        // Provenance markers (ADR 0022 dual-write): set when the row comes from a
        // confirmed Nutrition Estimate. Legacy manual/AI-parsed rows stay null.
        source: text("source"),                                // "meal_observation"
        observation_id: integer("observation_id"),
        created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
    },
    (table) => [
        index("nutrition_logs_date_idx").on(table.date),
    ],
);

// ——— Nutrition Estimation V1 (ADR 0011, 0012, 0013, 0020, 0022) ———
// Nutrition Reference Catalog: normalized per-100 g baselines from any provider
// (ThaiFCD first). Versioned rows keep original provider codes + attribution.
export const portionModeEnum = pgEnum("portion_mode", ["measured", "estimated"]);
export const mealComponentWeightModeEnum = pgEnum("meal_component_weight_mode", [
    "measured",
    "estimated",
]);
export const mealImageRoleEnum = pgEnum("meal_image_role", [
    "before",
    "after",
    "label_or_menu",
]);
export const estimateRevisionStatusEnum = pgEnum("estimate_revision_status", [
    "pending_confirmation",
    "confirmed",
    "superseded",
]);
export const mealObservationStatusEnum = pgEnum("meal_observation_status", [
    "draft",
    "confirmed",
    "reference_pending",
]);

export const nutritionReferences = pgTable(
    "nutrition_references",
    {
        id: serial("id").primaryKey(),
        provider: text("provider").notNull(),
        provider_food_code: text("provider_food_code").notNull(),
        version: text("version").notNull(),
        name_en: text("name_en"),
        name_th: text("name_th"),
        protein: real("protein").default(0).notNull(),
        carbs: real("carbs").default(0).notNull(),
        fat: real("fat").default(0).notNull(),
        alcohol: real("alcohol").default(0).notNull(),
        calories: real("calories").default(0).notNull(),
        extra_nutrients: jsonb("extra_nutrients").$type<Record<string, number>>(),
        embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
        created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
    },
    (table) => [
        uniqueIndex("nutrition_references_provider_code_version_idx").on(
            table.provider,
            table.provider_food_code,
            table.version,
        ),
        index("nutrition_references_name_th_idx").on(table.name_th),
        index("nutrition_references_name_en_idx").on(table.name_en),
        // Documented exception to the B-tree rule: pgvector similarity requires
        // an HNSW index; the B-tree rule targets clustered B-tree indexes.
        index("nutrition_references_embedding_idx")
            .using("hnsw", table.embedding.op("vector_cosine_ops")),
    ],
);

// Meal Observation: one consumed meal (user menu name + portion evidence).
// The estimate tables own the full model; nutrition_logs only gets a dual-written
// point row with provenance markers (source, observation_id) — ADR 0022.

export const mealObservations = pgTable(
    "meal_observations",
    {
        id: serial("id").primaryKey(),
        date: text("date").notNull(),                       // "YYYY-MM-DD"
        meal_type: mealTypeEnum("meal_type").notNull(),
        menu_name: text("menu_name").notNull(),
        portion_mode: portionModeEnum("portion_mode").notNull(),
        meal_source: text("meal_source"),
        status: mealObservationStatusEnum("status").default("draft").notNull(),
        reference_id: integer("reference_id").references(() => nutritionReferences.id),
        match_tier: text("match_tier").$type<MatchTier>(), // "manual" | "auto" | "ambiguous" | "gap"
        calculation: jsonb("calculation").$type<CalculationResult | null>(),
        created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
        updated_at: timestamp("updated_at", { mode: "string" }).defaultNow(),
    },
    (table) => [
        index("meal_observations_status_idx").on(table.status),
        index("meal_observations_date_idx").on(table.date),
    ],
);

// Portion Component: coarse observable part (rice/main/side/broth/other).
// For measured mode all three weight columns hold the same point value;
// for estimated mode they carry the low/central/high interval.
export const mealComponents = pgTable(
    "meal_components",
    {
        id: serial("id").primaryKey(),
        observation_id: integer("observation_id")
            .notNull()
            .references(() => mealObservations.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        kind: text("kind").$type<ComponentKind>().notNull(), // ComponentKind
        weight_mode: mealComponentWeightModeEnum("weight_mode").notNull(),
        weight_low: real("weight_low"),
        weight_central: real("weight_central"),
        weight_high: real("weight_high"),
        consumed_fraction: real("consumed_fraction").default(1).notNull(),
        position: integer("position").default(0).notNull(),
    },
    (table) => [
        index("meal_components_observation_idx").on(table.observation_id),
    ],
);

// Known Ingredient Evidence: known quantity inside a Portion Component (ADR 0006).
export const mealIngredientEvidence = pgTable(
    "meal_ingredient_evidence",
    {
        id: serial("id").primaryKey(),
        component_id: integer("component_id")
            .notNull()
            .references(() => mealComponents.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        source: text("source").$type<EvidenceSource>().notNull(),   // EvidenceSource
        basis: text("basis").$type<IngredientBasis>().notNull(),    // IngredientBasis
        grams_low: real("grams_low"),
        grams_central: real("grams_central"),
        grams_high: real("grams_high"),
        per100: jsonb("per100").$type<Macronutrients | null>(),
    },
    (table) => [
        index("meal_ingredient_evidence_component_idx").on(table.component_id),
    ],
);

// Latent Recipe Factor hints (visible oil / dryness / remaining broth + level).
export const mealLatentHints = pgTable(
    "meal_latent_hints",
    {
        id: serial("id").primaryKey(),
        component_id: integer("component_id")
            .notNull()
            .references(() => mealComponents.id, { onDelete: "cascade" }),
        kind: text("kind").$type<LatentHintKind>().notNull(),   // LatentHintKind
        level: text("level").$type<LatentHintLevel>().notNull(), // LatentHintLevel
    },
    (table) => [
        index("meal_latent_hints_component_idx").on(table.component_id),
    ],
);

// Meal image metadata only — uploads live in private R2 (ADR 0013, 0023).
// Upload endpoints are out of scope for V1 core.
export const mealImages = pgTable(
    "meal_images",
    {
        id: serial("id").primaryKey(),
        observation_id: integer("observation_id")
            .notNull()
            .references(() => mealObservations.id, { onDelete: "cascade" }),
        role: mealImageRoleEnum("role").notNull(),
        object_key: text("object_key"),
        checksum: text("checksum"),
        consent: boolean("consent").default(false),
        evaluation_eligible: boolean("evaluation_eligible").default(false),
        lifecycle_status: text("lifecycle_status").default("active").notNull(),
        created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
    },
    (table) => [
        index("meal_images_observation_idx").on(table.observation_id),
    ],
);

// Nutrition Estimate Revision: immutable per-recalculation record (ADR 0012).
// Confirming marks the latest pending revision confirmed and supersedes any
// previously confirmed one; never rewrites history.
export const nutritionEstimateRevisions = pgTable(
    "nutrition_estimate_revisions",
    {
        id: serial("id").primaryKey(),
        observation_id: integer("observation_id")
            .notNull()
            .references(() => mealObservations.id, { onDelete: "cascade" }),
        reference_id: integer("reference_id").references(() => nutritionReferences.id),
        reference_provider: text("reference_provider"),
        reference_version: text("reference_version"),
        calculation: jsonb("calculation").$type<CalculationResult>().notNull(),
        status: estimateRevisionStatusEnum("status").default("pending_confirmation").notNull(),
        created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
        confirmed_at: timestamp("confirmed_at", { mode: "string" }),
    },
    (table) => [
        index("nutrition_estimate_revisions_observation_idx").on(table.observation_id),
    ],
);

// ——— Water Logs Table (one row per date; glasses of 250ml) ———
export const waterLogs = pgTable("water_logs", {
    id: serial("id").primaryKey(),
    date: text("date").notNull().unique(),                 // "YYYY-MM-DD"
    glasses: integer("glasses").default(0).notNull(),      // 250ml each
    created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
});

// ——— Food Catalog Table (embedded reference catalog for RAG nutrition parse) ———
// Macros are stored per `per_amount` `per_unit` (e.g. per 100 g). Scaling to the
// eaten amount happens at parse time, never stored here. Source of truth is the
// Google Sheet filled by the separate nutrition_ocr bot; rows are synced + embedded.
export const foodCatalog = pgTable(
    "food_catalog",
    {
        id: text("id").primaryKey(),                            // slug, e.g. "personal-kikkoman-teriyaki"
        name: text("name").notNull(),                           // "Kikkoman Sauce teriyaki"
        brand: text("brand").default(""),                       // "Kikkoman"
        product_type: text("product_type").default(""),         // "sauce"
        per_amount: real("per_amount").default(100).notNull(),  // 100
        per_unit: text("per_unit").default("g").notNull(),      // "g" | "ml" | "serving" | "piece"
        calories: real("calories").default(0),
        protein: real("protein").default(0),
        carbs: real("carbs").default(0),
        fat: real("fat").default(0),
        source: text("source").default("google_sheet").notNull(), // "google_sheet" | "ocr" | "manual"
        source_row_id: text("source_row_id"),                   // "row_12" — dedup key for Sheet rows
        doc_hash: text("doc_hash"),                             // hash of embedded text (name/brand/type) — re-embed when changed
        macro_hash: text("macro_hash"),                         // hash of macros (per_amount/unit + cal/p/c/f) — update DB when changed
        embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
        created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
        updated_at: timestamp("updated_at", { mode: "string" }).defaultNow(),
    },
    (table) => [
        index("food_catalog_source_row_id_idx").on(table.source_row_id),
        index("food_catalog_embedding_idx")
            .using("hnsw", table.embedding.op("vector_cosine_ops")),
    ],
);

// ——— Push Subscriptions Table ———
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
