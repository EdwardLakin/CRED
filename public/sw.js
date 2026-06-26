const CACHE_VERSION = "cred-offline-017a0e7ad069e1a4";
const OFFLINE_ROUTE = "/offline";
const OFFLINE_CAPTURE_ROUTE = "/offline/capture";
const PRECACHE_ASSETS = [
  "/offline",
  "/offline/capture",
  "/manifest.webmanifest",
  "/icons/cred-icon.svg",
  "/icons/cred-maskable.svg",
  "/splash/cred-splash.svg",
  "/_next/static/9xArfSo1j6HlcOBbxGZJk/_buildManifest.js",
  "/_next/static/9xArfSo1j6HlcOBbxGZJk/_clientMiddlewareManifest.js",
  "/_next/static/9xArfSo1j6HlcOBbxGZJk/_ssgManifest.js",
  "/_next/static/chunks/0245a4ypel7xx.js",
  "/_next/static/chunks/05-c3ty_6dwfk.js",
  "/_next/static/chunks/0bkv5rrc09el3.js",
  "/_next/static/chunks/0cz1d0mv5g_q7.js",
  "/_next/static/chunks/0ded34472jbsn.js",
  "/_next/static/chunks/0jixbqy0k4bzj.js",
  "/_next/static/chunks/0jr-cjjbn9cqu.js",
  "/_next/static/chunks/0zm7blno40yu7.js",
  "/_next/static/chunks/14mrh2-p_w84d.js",
  "/_next/static/chunks/1ldhwkdsg700d.js",
  "/_next/static/chunks/1p5lb30nn3tou.js",
  "/_next/static/chunks/1rxncug86bump.js",
  "/_next/static/chunks/21x9obqqc2awh.js",
  "/_next/static/chunks/27jktro2p5rq9.js",
  "/_next/static/chunks/2cya-h6pss2j9.js",
  "/_next/static/chunks/2emo93yu_8gto.js",
  "/_next/static/chunks/2fxatfi4xu1vg.js",
  "/_next/static/chunks/2fzoez5-dhmm_.js",
  "/_next/static/chunks/34a1oukrr93wj.js",
  "/_next/static/chunks/36z57ezv9m8s9.js",
  "/_next/static/chunks/3fa2x824vlxtg.js",
  "/_next/static/chunks/3j2u3da3i8eh9.css",
  "/_next/static/chunks/3jvkbm-wxvaor.js",
  "/_next/static/chunks/3lj22afoxci84.js",
  "/_next/static/chunks/3m-ymi1f2e3l_.js",
  "/_next/static/chunks/43cavunylurnk.js",
  "/_next/static/chunks/turbopack-3y4_9gvwbdyxg.js",
  "/_next/static/media/favicon.2vob68tjqpejf.ico"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);

      await Promise.all(
        PRECACHE_ASSETS.map(async (asset) => {
          const request = new Request(asset, {
            cache: "reload",
            credentials: "same-origin",
          });

          const response = await fetch(request);

          if (!response.ok) {
            throw new Error(
              `Unable to precache ${asset}: ${response.status}`,
            );
          }

          await cache.put(request, response);
        }),
      );

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("cred-offline-") &&
              key !== CACHE_VERSION,
          )
          .map((key) => caches.delete(key)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

function isApiRequest(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase.co")
  );
}

function isStaticAsset(request, url) {
  return (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font" ||
    request.destination === "manifest" ||
    request.destination === "image" ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/splash/")
  );
}

function isCaptureRoute(pathname) {
  return /^\/dashboard\/sessions\/[^/]+\/capture\/?$/.test(
    pathname,
  );
}

async function cachedOfflineResponse() {
  return (
    (await caches.match(OFFLINE_ROUTE)) ||
    new Response("CRED is unavailable offline.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  );
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(request, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || isApiRequest(url)) {
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);

        if (cached) {
          return cached;
        }

        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
        }

        return response;
      })(),
    );

    return;
  }

  if (request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    (async () => {
      if (
        !self.navigator.onLine &&
        (
          url.pathname === "/dashboard" ||
          url.pathname.startsWith("/dashboard/")
        )
      ) {
        return Response.redirect(
          `${url.origin}${OFFLINE_ROUTE}`,
          302,
        );
      }

      if (
        url.pathname === OFFLINE_ROUTE ||
        url.pathname === OFFLINE_CAPTURE_ROUTE
      ) {
        const cached = await caches.match(url.pathname);

        if (cached) {
          return cached;
        }

        try {
          const response = await fetchWithTimeout(request, 1500);

          if (response.ok) {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put(url.pathname, response.clone());
          }

          return response;
        } catch {
          return cachedOfflineResponse();
        }
      }

      if (isCaptureRoute(url.pathname)) {
        try {
          const response = await fetchWithTimeout(request, 1500);

          if (response.ok) {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put(request, response.clone());
            return response;
          }
        } catch {
          // Use the local capture workspace below.
        }

        const offlineCapture = await caches.match(
          OFFLINE_CAPTURE_ROUTE,
        );

        return offlineCapture ?? cachedOfflineResponse();
      }

      try {
        const response = await fetchWithTimeout(request, 2500);

        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
        }

        return response;
      } catch {
        if (
          url.pathname === "/dashboard" ||
          url.pathname.startsWith("/dashboard/")
        ) {
          return Response.redirect(
            `${url.origin}${OFFLINE_ROUTE}`,
            302,
          );
        }

        return (
          (await caches.match(request)) ||
          (await cachedOfflineResponse())
        );
      }
    })(),
  );
});
