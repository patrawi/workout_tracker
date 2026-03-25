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
}

export interface ProfileRow extends ProfileData {
    id: number;
    updated_at: string;
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
