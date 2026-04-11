import { db } from '../db/client';
import { pushSubscriptions } from '../schema';
import { eq } from 'drizzle-orm';

export async function savePushSubscription(endpoint: string, p256dh: string, auth: string) {
  // For personal use, delete any existing subscription and insert new one
  await db.delete(pushSubscriptions);
  return db.insert(pushSubscriptions).values({ endpoint, p256dh, auth });
}

export async function getAllPushSubscriptions() {
  return db.select().from(pushSubscriptions);
}

export async function deletePushSubscription(endpoint: string) {
  return db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
