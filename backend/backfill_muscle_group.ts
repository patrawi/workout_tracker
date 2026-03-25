import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { workouts } from "./src/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set.");
}

const client = postgres(connectionString);
const db = drizzle(client);

// Simple hardcoded mapping for existing exercises in the DB
const muscleMap: Record<string, string> = {
    // Chest
    "Bench Press": "Chest",
    "Incline Bench Press": "Chest",
    "Push-Up": "Chest",
    "Chest Fly": "Chest",
    "Dumbbell Bench Press": "Chest",
    "Incline Dumbbell Press": "Chest",

    // Back
    "Deadlift": "Back",
    "Pull-Up": "Back",
    "Chin-Up": "Back",
    "Barbell Row": "Back",
    "Lat Pulldown": "Back",
    "Seated Cable Row": "Back",
    "Dumbbell Row": "Back",

    // Legs
    "Squat": "Legs",
    "Leg Press": "Legs",
    "Romanian Deadlift": "Legs",
    "Bulgarian Split Squat": "Legs",
    "Leg Extension": "Legs",
    "Leg Curl": "Legs",
    "Calf Raise": "Legs",
    "Dumbbell Goblet Squat": "Legs",

    // Shoulders
    "Overhead Press": "Shoulders",
    "Lateral Raise": "Shoulders",
    "Front Raise": "Shoulders",
    "Face Pull": "Shoulders",
    "Dumbbell Shoulder Press": "Shoulders",

    // Arms
    "Bicep Curl": "Arms",
    "Hammer Curl": "Arms",
    "Tricep Extension": "Arms",
    "Tricep Pushdown": "Arms",
    "Dip": "Arms",

    // Core
    "Crunch": "Core",
    "Plank": "Core",
    "Hanging Leg Raise": "Core",

    // Cardio
    "Treadmill": "Cardio",
    "Cycling": "Cardio",
    "Rowing Machine": "Cardio",
};

async function run() {
    console.log("Starting muscle_group backfill...");

    // Fetch all workouts
    const allWorkouts = await db.select().from(workouts);
    let updatedCount = 0;

    for (const row of allWorkouts) {
        // Find matching muscle group, default to "Other"
        let group = "Other";

        for (const [key, val] of Object.entries(muscleMap)) {
            if (row.exercise_name.toLowerCase().includes(key.toLowerCase())) {
                group = val;
                break;
            }
        }

        if (group !== "Other" && row.muscle_group !== group) {
            await db
                .update(workouts)
                .set({ muscle_group: group })
                .where(eq(workouts.id, row.id));
            updatedCount++;
        }
    }

    console.log(`Backfill complete. Updated ${updatedCount} rows.`);
    process.exit(0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
