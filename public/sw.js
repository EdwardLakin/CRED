const CACHE_VERSION = 'cred-pwa-v2'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const OFFLINE_URL = '/offline'
const CORE_ASSETS = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/cred-icon.svg',
  '/icons/cred-maskable.svg',
  '/splash/cred-splash.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('cred-pwa-') && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.hostname.includes('supabase')
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/splash/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/file.svg' ||
    url.pathname === '/globe.svg' ||
    url.pathname === '/next.svg' ||
    url.pathname === '/vercel.svg' ||
    url.pathname === '/window.svg'
  )
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone())
      }

      return response
    })
    .catch(() => cached)

  return cached || network
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request)
    return response
  } catch {
    const cachedOfflinePage = await caches.match(OFFLINE_URL)

    return (
      cachedOfflinePage ||
      new Response("You're offline. Reconnect to continue using CRED.", {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        status: 503,
        statusText: 'Offline',
      })
    )
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  if (isApiRequest(url)) {
    event.respondWith(fetch(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (url.origin === self.location.origin && isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
