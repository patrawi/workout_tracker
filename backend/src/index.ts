import "dotenv/config";
import { createApp } from "./app";
import { ensureProfileRow } from "./repositories/profile.repository.ts";
import { config, isAuthEnabled } from "./config";

await ensureProfileRow();

console.log("✅ Database connected & profile row ensured");

if (!isAuthEnabled) {
  console.warn(
    "⚠️  MASTER_PASSWORD not set — authentication is DISABLED. Set it in .env to enable.",
  );
}

const app = createApp().listen(config.port);

console.log(
  `🏋️ Frictionless Tracker API running at http://${app.server?.hostname}:${app.server?.port}`,
);
