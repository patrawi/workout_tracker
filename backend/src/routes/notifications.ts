// src/routes/notifications.ts

import { Elysia, t } from 'elysia';
import { createPushSubscriptionRepository } from '../repositories/push-subscription.repository';
import { config } from '../config';
import { createChildLogger } from '../lib/logger';
import db from '../db/client';

const logger = createChildLogger('notifications-route');
const pushSubRepo = createPushSubscriptionRepository(db);

export const notificationsRoutes = new Elysia({ prefix: '/notifications' })
  .get('/config', ({ set }) => {
    logger.debug('GET /config called', { vapidPresent: !!config.VAPID_PUBLIC_KEY });
    set.headers['Cache-Control'] = 'no-store';
    return { vapidPublicKey: config.VAPID_PUBLIC_KEY };
  })
  .post('/subscribe', async ({ body, set }) => {
    logger.info('POST /subscribe called', { endpoint: body.endpoint.slice(0, 50) + '...' });
    try {
      await pushSubRepo.save(body.endpoint, body.p256dh, body.auth);
      logger.info('Subscription saved successfully');
      return { success: true };
    } catch (err: any) {
      logger.error('Failed to save subscription', { error: err.message });
      set.status = 500;
      return { error: err.message || 'Failed to save subscription' };
    }
  }, {
    body: t.Object({
      endpoint: t.String(),
      p256dh: t.String(),
      auth: t.String()
    })
  });
