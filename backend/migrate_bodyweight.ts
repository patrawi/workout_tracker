import "dotenv/config";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set. Check your .env file.");
}

const sql = postgres(connectionString);

async function migrate() {
    console.log("Starting migration: creating bodyweight_logs table...");

    try {
        await sql`
            CREATE TABLE IF NOT EXISTS bodyweight_logs (
                id SERIAL PRIMARY KEY,
                date TEXT NOT NULL UNIQUE,
                weight_kg REAL NOT NULL,
                created_at TIMESTAMP DEFAULT now()
            );
        `;
        console.log("Migration successful: bodyweight_logs table created.");
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await sql.end();
    }
}

migrate();
