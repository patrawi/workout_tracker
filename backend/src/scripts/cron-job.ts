// Standalone cron job script for Railway Function service
// Runs daily via cron, sends push notifications, then exits.

import { ConfigService } from "../services/config.service";
import { createDatabaseClient } from "../db/client";
import { createPushSubscriptionRepository } from "../repositories/push-subscription.repository";
import webpush from "web-push";

async function main() {
  const config = ConfigService.fromEnv();

  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) {
    console.log("VAPID keys not configured. Skipping notification check.");
    return 0;
  }

  webpush.setVapidDetails(
    config.VAPID_SUBJECT,
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY,
  );

  const db = createDatabaseClient(config.databaseUrl);
  const pushSubRepo = createPushSubscriptionRepository(db);

  console.log("Starting notification check...");

  const subscriptions = await pushSubRepo.getAll();
  console.log(`Found ${subscriptions.length} subscriptions`);

  if (subscriptions.length === 0) {
    console.log("No subscriptions found. Exiting.");
    return 0;
  }

  const payload = JSON.stringify({
    title: "Workout Reminder",
    body: "Time to log your workout!",
    icon: "/icon-192.svg",
  });

  let sent = 0;
  let cleaned = 0;
  const errors: string[] = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
      console.log(`Sent notification to ${sub.endpoint}`);
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await pushSubRepo.delete(sub.endpoint);
        cleaned++;
        console.log(`Cleaned up expired subscription: ${sub.endpoint}`);
      } else {
        errors.push(err.message);
        console.error(`Failed to send notification: ${err.message}`);
      }
    }
  }

  console.log(`Done. Sent: ${sent}, Cleaned: ${cleaned}, Errors: ${errors.length}`);
  return errors.length > 0 ? 1 : 0;
}

const exitCode = await main();
process.exit(exitCode);
