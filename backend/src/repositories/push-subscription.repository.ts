import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { pushSubscriptions } from '../schema';

export function createPushSubscriptionRepository(dbInstance: PostgresJsDatabase) {
  return {
    async save(endpoint: string, p256dh: string, auth: string) {
      // For personal use, delete any existing subscription and insert new one
      await dbInstance.delete(pushSubscriptions);
      return dbInstance.insert(pushSubscriptions).values({ endpoint, p256dh, auth });
    },

    async getAll() {
      return dbInstance.select().from(pushSubscriptions);
    },

    async delete(endpoint: string) {
      return dbInstance.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    },
  };
}
