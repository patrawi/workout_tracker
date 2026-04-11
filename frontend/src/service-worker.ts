import { precacheAndRoute, ManifestEntry } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope

// Monkey-patch Cache.prototype.put to strip Vary: * before caching
// Railway returns Vary: * which causes the native cache.put() to throw
const _originalCachePut = Cache.prototype.put
Cache.prototype.put = function (request: Request | string, response: Response): Promise<void> {
  if (response.headers.get('Vary') === '*') {
    const headers = new Headers(response.headers)
    headers.delete('Vary')
    response = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
  return _originalCachePut.call(this, request, response)
}

// Also intercept cache.put via the Cache API for workbox's internal usage
const _originalCacheAddAll = Cache.prototype.addAll
Cache.prototype.addAll = function (responses: Response[]): Promise<void> {
  const cleaned = responses.map(r => {
    if (r.headers.get('Vary') === '*') {
      const headers = new Headers(r.headers)
      headers.delete('Vary')
      return new Response(r.body, {
        status: r.status,
        statusText: r.statusText,
        headers,
      })
    }
    return r
  })
  return _originalCacheAddAll.call(this, cleaned)
}

// Precache injected manifest
precacheAndRoute(self.__WB_MANIFEST, {
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
  ],
})

// Navigation route — NetworkFirst for SPA fallback
const spaHandler = new NetworkFirst({
  cacheName: 'spa-cache',
  networkTimeoutSeconds: 10,
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 }),
  ],
})

registerRoute(new NavigationRoute(spaHandler))

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
