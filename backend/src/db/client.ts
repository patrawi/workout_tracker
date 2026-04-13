// src/db/client.ts

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Factory to create a database client.
 * Accepts a connection string and returns a Drizzle database instance.
 * This makes testing easy - pass a test database URL.
 */
export function createDatabaseClient(databaseUrl: string): PostgresJsDatabase {
  const client = postgres(databaseUrl);
  return drizzle(client);
}

/**
 * Create a database client for testing with transaction rollback.
 * Returns the db instance and a cleanup function that rolls back the transaction.
 */
export async function createTestDatabaseClient(
  databaseUrl: string
): Promise<{ db: PostgresJsDatabase; cleanup: () => Promise<void> }> {
  const client = postgres(databaseUrl);
  const db = drizzle(client);

  // Begin a transaction that will be rolled back
  await client`BEGIN`;

  return {
    db,
    cleanup: async () => {
      await client`ROLLBACK`;
      await client.end();
    },
  };
}

// Backward compatibility export during migration phase
// TODO: Remove this after all files are updated to use factories
import { config } from "../config";
export const db = createDatabaseClient(config.databaseUrl);
export default db;
