export interface WorkoutData {
    exercise_name: string;
    weight: number;
    reps: number;
    rpe: number;
    is_bodyweight: boolean;
    is_assisted: boolean;
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
}

export interface WorkoutRow {
    id: number;
    session_id: number;
    exercise_name: string;
    weight: number;
    reps: number;
    rpe: number;
    is_bodyweight: boolean;
    is_assisted: boolean;
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
}

export interface ProfileRow extends ProfileData {
    id: number;
    updated_at: string;
}

export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export interface NutritionItem {
    food_name: string;
    meal: MealType;
    protein: number;       // grams (after scaling)
    carbs: number;
    fat: number;
    calories: number;      // computed: Px4 + Cx4 + Fx9
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
