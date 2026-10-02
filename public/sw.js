// EDU-Tracker service worker. Hand-written, no build step.
//
//  /_next/static/*        cache-first (content-hashed file names)
//  page navigations       network-first with a 3 s timeout, then the cached copy
//  icons, manifest        stale-while-revalidate
//  /api/*                 never cached here (data lives in IndexedDB)

const VERSION = 'v1'
const STATIC = `edu-static-${VERSION}`
const PAGES = `edu-pages-${VERSION}`
const ASSETS = `edu-assets-${VERSION}`
const KEEP = [STATIC, PAGES, ASSETS]
const NAV_TIMEOUT_MS = 3000
const APP_ROUTES = ['/', '/history', '/subjects', '/goals', '/stats', '/calendar']

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

function isStatic(url) {
  return url.pathname.startsWith('/_next/static/')
}

function isAsset(url) {
  return url.pathname.startsWith('/icons/') || ['/icon.svg', '/apple-icon.png', '/favicon.ico', '/manifest.webmanifest'].includes(url.pathname)
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) await cache.put(request, res.clone())
  return res
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS)
  const hit = await cache.match(request)
  const network = fetch(request)
    .then(async (res) => {
      if (res.ok) await cache.put(request, res.clone())
      return res
    })
    .catch(() => null)
  return hit || (await network) || Response.error()
}

/** Only cache real app pages, never redirects to /login or error pages. */
function cacheable(res, url) {
  return res.ok && !res.redirected && res.type === 'basic' && APP_ROUTES.includes(url.pathname)
}

async function networkFirst(request) {
  const url = new URL(request.url)
  const cache = await caches.open(PAGES)
  const key = url.pathname
  const network = fetch(request).then(async (res) => {
    if (cacheable(res, url)) await cache.put(key, res.clone())
    return res
  })
  network.catch(() => {})
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS))
  try {
    const res = await Promise.race([network, timeout])
    if (res) return res
  } catch {
    // Offline: fall through to cache.
  }
  const cached = (await cache.match(key)) || (await cache.match('/'))
  if (cached) return cached
  return network.catch(() => offlinePage())
}

function offlinePage() {
  const html =
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Offline, EDU-Tracker</title><body style="margin:0;background:#0C0C0C;color:#E9E7E2;font:14px/24px system-ui;display:grid;place-items:center;min-height:100vh">' +
    '<p>Offline. Open EDU-Tracker once while online so it works offline.</p></body>'
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname === '/sw.js') return

  if (isStatic(url)) {
    event.respondWith(cacheFirst(request))
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
  } else if (isAsset(url)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})

/** Fetches each app page and the static files it references, so pages open offline. */
async function warm(urls) {
  const pages = await caches.open(PAGES)
  const statics = await caches.open(STATIC)
  for (const path of urls) {
    if (!APP_ROUTES.includes(path)) continue
    try {
      const res = await fetch(path, { credentials: 'same-origin' })
      if (!cacheable(res, new URL(res.url))) continue
      const html = await res.clone().text()
      await pages.put(path, res)
      const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])
      for (const a of assets) {
        if (await statics.match(a)) continue
        const r = await fetch(a)
        if (r.ok) await statics.put(a, r)
      }
    } catch {
      // Best effort; retried on the next app start.
    }
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'warm' && Array.isArray(data.urls)) event.waitUntil(warm(data.urls))
  if (data.type === 'clear') event.waitUntil(caches.delete(PAGES))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = all.find((c) => new URL(c.url).origin === self.location.origin)
      if (client) return client.focus()
      return self.clients.openWindow('/')
    })(),
  )
})
