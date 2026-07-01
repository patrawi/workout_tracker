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
