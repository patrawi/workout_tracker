import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config } from "./config";

const client = postgres(config.databaseUrl);
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("✅ Migrations completed!");

await client.end();
process.exit(0);
