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
    vector,
} from "drizzle-orm/pg-core";

// Embedding dimension for the food catalog (Gemini text-embedding-004).
export const EMBEDDING_DIMENSIONS = 768;

// ——— Enums ———
export const mealTypeEnum = pgEnum("meal_type", [
    "Breakfast",
    "Lunch",
    "Dinner",
    "Snack",
]);

// ——— Sessions Table ———
export const sessions = pgTable("sessions", {
    id: serial("id").primaryKey(),
    raw_input: text("raw_input").notNull(),
    walked_10k: boolean("walked_10k").default(false),
    did_liss: boolean("did_liss").default(false),
    did_stretch: boolean("did_stretch").default(false),
    notes: text("notes").default(""),
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
    notes: text("notes").default("").notNull(),
    updated_at: timestamp("updated_at", { mode: "string" }).defaultNow(),
}, (table) => [
    index("coach_plan_day_type_idx").on(table.day_type),
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
        calories: real("calories").default(0),                 // computed: P×4 + C×4 + F×9
        created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
    },
    (table) => [
        index("nutrition_logs_date_idx").on(table.date),
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

