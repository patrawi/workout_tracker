import { Elysia } from 'elysia'
import { getAllPushSubscriptions, deletePushSubscription } from '../db'
import { config } from '../config'
import webpush from 'web-push'

// Initialize VAPID once at module level
if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    config.VAPID_SUBJECT,
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY
  )
}

export const cronRoutes = new Elysia({ prefix: '/cron' })
  .get('/check-notifications', async ({ headers, set }) => {
    // Verify CRON_SECRET
    const auth = headers['authorization']
    if (!auth || auth !== `Bearer ${config.CRON_SECRET}`) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) {
      set.status = 503
      return { error: 'VAPID keys not configured' }
    }

    // Get all subscriptions
    const subscriptions = await getAllPushSubscriptions()
    if (subscriptions.length === 0) {
      return { sent: 0, message: 'No subscriptions found' }
    }

    // For now, send a test notification (extend later with actual scheduling logic)
    const payload = JSON.stringify({
      title: 'Workout Reminder',
      body: 'Time to log your workout!',
      icon: '/icon-192.svg'
    })

    let sent = 0
    let cleaned = 0
    let errors: string[] = []

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent++
      } catch (err: any) {
        // Clean up expired subscriptions (410 Gone, 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await deletePushSubscription(sub.endpoint)
          cleaned++
        } else {
          errors.push(err.message)
        }
      }
    }

    return { sent, cleaned, errors }
  })
