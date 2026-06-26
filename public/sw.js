const CACHE_VERSION = "cred-offline-aa6eb8337018bd22";
const OFFLINE_DOCUMENT = "/offline.html";
const PRECACHE_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/cred-icon.svg",
  "/icons/cred-maskable.svg",
  "/splash/cred-splash.svg",
  "/_next/static/chunks/0245a4ypel7xx.js",
  "/_next/static/chunks/05-c3ty_6dwfk.js",
  "/_next/static/chunks/05pszc8ae31xd.js",
  "/_next/static/chunks/0cz1d0mv5g_q7.js",
  "/_next/static/chunks/0fiffbyre4x_4.js",
  "/_next/static/chunks/0jr-cjjbn9cqu.js",
  "/_next/static/chunks/0zm7blno40yu7.js",
  "/_next/static/chunks/11i-dv3ytv6pn.js",
  "/_next/static/chunks/14mrh2-p_w84d.js",
  "/_next/static/chunks/1ldhwkdsg700d.js",
  "/_next/static/chunks/1rxncug86bump.js",
  "/_next/static/chunks/21x9obqqc2awh.js",
  "/_next/static/chunks/27jktro2p5rq9.js",
  "/_next/static/chunks/2cya-h6pss2j9.js",
  "/_next/static/chunks/2fxatfi4xu1vg.js",
  "/_next/static/chunks/2nfb637yct5x2.js",
  "/_next/static/chunks/2ycitgi67lxe0.js",
  "/_next/static/chunks/34-6_nm5qhy5l.js",
  "/_next/static/chunks/34a1oukrr93wj.js",
  "/_next/static/chunks/362catsqzs45j.js",
  "/_next/static/chunks/36z57ezv9m8s9.js",
  "/_next/static/chunks/3ct-0kbhmcuu4.js",
  "/_next/static/chunks/3j2u3da3i8eh9.css",
  "/_next/static/chunks/3jvkbm-wxvaor.js",
  "/_next/static/chunks/3n4caa25f7fet.js",
  "/_next/static/chunks/43cavunylurnk.js",
  "/_next/static/chunks/turbopack-3y4_9gvwbdyxg.js",
  "/_next/static/media/favicon.2vob68tjqpejf.ico",
  "/_next/static/xoGtu-MN7ahtPbRPhMkuE/_buildManifest.js",
  "/_next/static/xoGtu-MN7ahtPbRPhMkuE/_clientMiddlewareManifest.js",
  "/_next/static/xoGtu-MN7ahtPbRPhMkuE/_ssgManifest.js"
];
const NAVIGATION_PATHS = new Set(["/", "/dashboard", "/offline", "/offline/capture"]);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    for (const asset of PRECACHE_ASSETS) {
      const request = new Request(asset, { cache: "reload", credentials: "same-origin", redirect: "error" });
      const response = await fetch(request);
      if (!response.ok || response.redirected || response.type === "opaqueredirect" || response.type === "opaque") {
        throw new Error(`Unable to precache ${asset}: status=${response.status} redirected=${response.redirected} type=${response.type}`);
      }
      const contentType = response.headers.get("content-type") || "";
      if ((asset.endsWith(".js") && contentType.includes("text/html")) || (asset.endsWith(".css") && contentType.includes("text/html"))) {
        throw new Error(`Refusing to precache HTML for asset ${asset}`);
      }
      await cache.put(asset, response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const offline = await caches.match(OFFLINE_DOCUMENT);
    if (!offline || !offline.ok) throw new Error("Offline document missing after install");
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("cred-offline-") && key !== CACHE_VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  if (event.data?.type === "CRED_SW_DIAGNOSTICS") {
    event.ports?.[0]?.postMessage({ version: CACHE_VERSION, offlineDocument: OFFLINE_DOCUMENT, assets: PRECACHE_ASSETS.length });
  }
});

function sameOrigin(url) { return url.origin === self.location.origin; }
function isApiOrExternal(url) { return !sameOrigin(url) || url.pathname.startsWith("/api/") || url.hostname.includes("supabase.co"); }
function isRscRequest(request, url) { return url.searchParams.has("_rsc") || request.headers.get("RSC") === "1" || (request.headers.get("Accept") || "").includes("text/x-component"); }
function isStaticAsset(request, url) { return request.destination === "script" || request.destination === "style" || request.destination === "font" || request.destination === "manifest" || request.destination === "image" || url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/splash/"); }
function shouldUseOfflineShell(url) { return NAVIGATION_PATHS.has(url.pathname) || url.pathname.startsWith("/dashboard/") || url.pathname.startsWith("/offline/"); }
async function offlineDocument() { return (await caches.match(OFFLINE_DOCUMENT)) || new Response("CRED offline shell is not installed.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
async function fetchWithTimeout(request, timeoutMs) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs); try { return await fetch(request, { signal: controller.signal }); } finally { clearTimeout(timeout); } }
function validAssetResponse(response) { return response.ok && !response.redirected && response.type !== "opaque" && response.type !== "opaqueredirect" && !(response.headers.get("content-type") || "").includes("text/html"); }

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isApiOrExternal(url)) return;

  if (isRscRequest(request, url)) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ ok: false, offline: true, error: "RSC data is unavailable offline." }), { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } })));
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (validAssetResponse(response)) (await caches.open(CACHE_VERSION)).put(request, response.clone());
      return response;
    })());
    return;
  }

  if (request.mode !== "navigate") return;
  event.respondWith((async () => {
    if (!self.navigator.onLine && shouldUseOfflineShell(url)) return offlineDocument();
    try {
      const response = await fetchWithTimeout(request, shouldUseOfflineShell(url) ? 1200 : 3000);
      if (response.ok && !response.redirected && !shouldUseOfflineShell(url)) (await caches.open(CACHE_VERSION)).put(request, response.clone());
      return response;
    } catch {
      if (shouldUseOfflineShell(url)) return offlineDocument();
      return (await caches.match(request)) || offlineDocument();
    }
  })());
});
