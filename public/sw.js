const CACHE_VERSION = "cred-offline-v2";
const APP_SHELL = [
  "/offline",
  "/offline/capture",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
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
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  );
}

function getCaptureSessionId(pathname) {
  const match = pathname.match(
    /^\/dashboard\/sessions\/([^/]+)\/capture\/?$/,
  );

  return match?.[1] ?? null;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (isApiRequest(url)) {
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(request).then((response) => {
          const copy = response.clone();

          caches
            .open(CACHE_VERSION)
            .then((cache) => cache.put(request, copy));

          return response;
        });
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();

          caches
            .open(CACHE_VERSION)
            .then((cache) => cache.put(request, copy));

          return response;
        })
        .catch(async () => {
          const captureSessionId = getCaptureSessionId(url.pathname);

          if (captureSessionId) {
            return Response.redirect(
              `${url.origin}/offline/capture?sessionId=${encodeURIComponent(
                captureSessionId,
              )}`,
              302,
            );
          }

          if (url.pathname === "/offline/capture") {
            const offlineCapture = await caches.match(
              "/offline/capture",
            );

            if (offlineCapture) {
              return offlineCapture;
            }
          }

          return caches.match("/offline");
        }),
    );
  }
});
