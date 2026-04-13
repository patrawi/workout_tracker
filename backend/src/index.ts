import { createApp } from "./app";
import { ConfigService } from "./services/config.service";
import { createDatabaseClient } from "./db/client";
import { createAppContext } from "./context";
import { createProfileRepository } from "./repositories/profile.repository";

// Create ConfigService from environment
const config = ConfigService.fromEnv();

// Create database client
const db = createDatabaseClient(config.databaseUrl);

// Ensure profile row exists
const profileRepo = createProfileRepository(db);
await profileRepo.ensure();

// Create app context with all services
const ctx = createAppContext(db, config);

// Create and start app
const app = createApp(ctx).listen(config.port);

if (!config.isAuthEnabled) {
  console.warn(
    "⚠️  MASTER_PASSWORD not set — authentication is DISABLED. Set it in .env to enable.",
  );
}

console.log(
  `🏋️ Frictionless Tracker API running at http://${app.server?.hostname}:${app.server?.port}`,
);
