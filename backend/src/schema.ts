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
} from "drizzle-orm/pg-core";

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

// ——— Push Subscriptions Table ———
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

