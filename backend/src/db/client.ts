import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";

export const client = postgres(config.databaseUrl);

export const db = drizzle(client);

export default db;
