/**
 * One-time migration script: SQLite (workouts.db) → PostgreSQL
 *
 * Usage:  bun run migrate-sqlite-to-pg.ts
 */
import "dotenv/config";
import Database from "bun:sqlite";
import postgres from "postgres";

// ——— SQLite source ———
const sqlite = new Database("workouts.db", { readonly: true });

// ——— PostgreSQL target ———
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL not set in .env");
}
const sql = postgres(connectionString);

interface SqliteSession {
    id: number;
    raw_input: string;
    created_at: string;
}

interface SqliteWorkout {
    id: number;
    session_id: number;
    exercise_name: string;
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    is_bodyweight: number; // 0 or 1 in SQLite
    is_assisted: number;
    variant_details: string | null;
    notes_thai: string | null;
    notes_english: string | null;
    tags: string | null; // JSON string in SQLite
    created_at: string;
}

interface SqliteProfile {
    id: number;
    weight_kg: number | null;
    height_cm: number | null;
    tdee: number | null;
    calories_intake: number | null;
    updated_at: string | null;
}

async function migrate() {
    console.log("🚚 Starting SQLite → PostgreSQL migration...\n");

    // ——— 1. Migrate sessions ———
    const sqliteSessions = sqlite.query("SELECT * FROM sessions ORDER BY id").all() as SqliteSession[];
    console.log(`📦 Found ${sqliteSessions.length} sessions`);

    // We need to map old SQLite IDs → new PG IDs
    const sessionIdMap = new Map<number, number>();

    for (const s of sqliteSessions) {
        const [inserted] = await sql`
            INSERT INTO sessions (raw_input, created_at)
            VALUES (${s.raw_input}, ${s.created_at}::timestamp)
            RETURNING id
        `;
        sessionIdMap.set(s.id, inserted.id);
    }
    console.log(`✅ Migrated ${sqliteSessions.length} sessions\n`);

    // ——— 2. Migrate workouts ———
    const sqliteWorkouts = sqlite.query("SELECT * FROM workouts ORDER BY id").all() as SqliteWorkout[];
    console.log(`📦 Found ${sqliteWorkouts.length} workouts`);

    let workoutCount = 0;
    for (const w of sqliteWorkouts) {
        const newSessionId = sessionIdMap.get(w.session_id);
        if (newSessionId === undefined) {
            console.warn(`⚠️  Skipping workout ${w.id}: no matching session ${w.session_id}`);
            continue;
        }

        // Parse tags from JSON string → array
        let tags: string[] = [];
        try {
            tags = w.tags ? JSON.parse(w.tags) : [];
        } catch {
            tags = [];
        }

        await sql`
            INSERT INTO workouts (
                session_id, exercise_name, weight, reps, rpe,
                is_bodyweight, is_assisted, variant_details,
                notes_thai, notes_english, tags, created_at
            ) VALUES (
                ${newSessionId},
                ${w.exercise_name},
                ${w.weight ?? 0},
                ${w.reps ?? 0},
                ${w.rpe ?? 0},
                ${w.is_bodyweight === 1},
                ${w.is_assisted === 1},
                ${w.variant_details ?? ""},
                ${w.notes_thai ?? ""},
                ${w.notes_english ?? ""},
                ${JSON.stringify(tags)}::jsonb,
                ${w.created_at}::timestamp
            )
        `;
        workoutCount++;
    }
    console.log(`✅ Migrated ${workoutCount} workouts\n`);

    // ——— 3. Migrate profile ———
    const sqliteProfile = sqlite.query("SELECT * FROM profile WHERE id = 1").get() as SqliteProfile | null;
    if (sqliteProfile) {
        const updatedAt = sqliteProfile.updated_at
            ? new Date(sqliteProfile.updated_at)
            : new Date();

        await sql`
            INSERT INTO profile (id, weight_kg, height_cm, tdee, calories_intake, updated_at)
            VALUES (
                1,
                ${sqliteProfile.weight_kg ?? 0},
                ${sqliteProfile.height_cm ?? 0},
                ${sqliteProfile.tdee ?? 0},
                ${sqliteProfile.calories_intake ?? 0},
                ${updatedAt}
            )
            ON CONFLICT (id) DO UPDATE SET
                weight_kg = EXCLUDED.weight_kg,
                height_cm = EXCLUDED.height_cm,
                tdee = EXCLUDED.tdee,
                calories_intake = EXCLUDED.calories_intake,
                updated_at = EXCLUDED.updated_at
        `;
        console.log("✅ Migrated profile\n");
    } else {
        console.log("ℹ️  No profile data to migrate\n");
    }

    // ——— Verify ———
    const [sessionCount] = await sql`SELECT COUNT(*) as count FROM sessions`;
    const [workoutCountPg] = await sql`SELECT COUNT(*) as count FROM workouts`;
    const [profileCount] = await sql`SELECT COUNT(*) as count FROM profile`;

    console.log("📊 PostgreSQL verification:");
    console.log(`   Sessions: ${sessionCount.count}`);
    console.log(`   Workouts: ${workoutCountPg.count}`);
    console.log(`   Profile:  ${profileCount.count}`);
    console.log("\n🎉 Migration complete!");

    sqlite.close();
    await sql.end();
}

migrate().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
});
