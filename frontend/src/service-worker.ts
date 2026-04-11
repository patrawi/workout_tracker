import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Railway's proxy can return Vary: * on responses, which causes Cache.put() to fail.
// Strip it before caching so the SW can install successfully.
const varyStarFixPlugin = {
  async cacheWillUpdate({ response }: { response: Response }) {
    if (response.headers.get('Vary') === '*') {
      const headers = new Headers(response.headers)
      headers.delete('Vary')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    return response
  },
}

// Precache injected manifest with Vary fix
precacheAndRoute(self.__WB_MANIFEST, { plugins: [varyStarFixPlugin] })

// Navigation route - SPA fallback
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

// Runtime caching: API calls — NetworkFirst (fresh data, cache fallback)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 5 * 60 }),
    ],
  })
)

// Runtime caching: Fonts — CacheFirst
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'font-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
)

// Runtime caching: Images — CacheFirst
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
)

// Push notification handler
self.addEventListener('push', (event) => {
  let data = { title: 'Workout Tracker', body: 'You have a new notification.', icon: '/icon-192.svg' }

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() }
    } catch {
      data.body = event.data.text()
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: '/icon-192.svg',
    })
  )
})

// Notification click handler — focus/open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open new window
      return self.clients.openWindow('/')
    })
  )
})
