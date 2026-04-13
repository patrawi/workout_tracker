// Backward compatibility - re-export from ConfigService
// New code should import ConfigService directly from ./services/config.service

import { ConfigService } from "./services/config.service";

const configService = ConfigService.fromEnv();

/** @deprecated Use ConfigService instead */
export const config = {
  port: configService.port,
  databaseUrl: configService.databaseUrl,
  masterPassword: configService.masterPassword,
  jwtSecret: configService.jwtSecret,
  geminiApiKey: configService.geminiApiKey,
  VAPID_PUBLIC_KEY: configService.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: configService.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: configService.VAPID_SUBJECT,
  CRON_SECRET: configService.CRON_SECRET,
};

/** @deprecated Use ConfigService.isAuthEnabled instead */
export const isAuthEnabled = configService.isAuthEnabled;

export { ConfigService };
export type { AppConfig } from "./services/config.service";
