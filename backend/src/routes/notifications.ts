import { Elysia, t } from 'elysia'
import { savePushSubscription } from '../db'
import { config } from '../config'

export const notificationsRoutes = new Elysia({ prefix: '/notifications' })
  .get('/config', () => {
    return { vapidPublicKey: config.VAPID_PUBLIC_KEY }
  })
  .post('/subscribe', async ({ body }) => {
    await savePushSubscription(body.endpoint, body.p256dh, body.auth)
    return { success: true }
  }, {
    body: t.Object({
      endpoint: t.String(),
      p256dh: t.String(),
      auth: t.String()
    })
  })
