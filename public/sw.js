const CACHE_VERSION = "cred-offline-183d2eb65f32e09a";
const OFFLINE_DOCUMENT = "/offline.html";
const PRECACHE_ASSETS = [
  "/offline.html",
  "/offline/contracts.js",
  "/offline/db.js",
  "/offline/offline-shell.css",
  "/offline/offline-shell.js",
  "/offline/store.js",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
  "/icons/cred-icon.svg",
  "/icons/cred-maskable.svg",
  "/splash/cred-splash.svg",
  "/_next/static/14PY1Ulp1RwmiwfGiVa6P/_buildManifest.js",
  "/_next/static/14PY1Ulp1RwmiwfGiVa6P/_clientMiddlewareManifest.js",
  "/_next/static/14PY1Ulp1RwmiwfGiVa6P/_ssgManifest.js",
  "/_next/static/chunks/0245a4ypel7xx.js",
  "/_next/static/chunks/05-c3ty_6dwfk.js",
  "/_next/static/chunks/0cz1d0mv5g_q7.js",
  "/_next/static/chunks/0eg8onq1j4-sw.js",
  "/_next/static/chunks/0jr-cjjbn9cqu.js",
  "/_next/static/chunks/0zm7blno40yu7.js",
  "/_next/static/chunks/10b2vph3ev0zg.js",
  "/_next/static/chunks/14mrh2-p_w84d.js",
  "/_next/static/chunks/1ldhwkdsg700d.js",
  "/_next/static/chunks/1m3b-o41r5o_8.js",
  "/_next/static/chunks/1rxncug86bump.js",
  "/_next/static/chunks/1vshgq8rsrecf.js",
  "/_next/static/chunks/21x9obqqc2awh.js",
  "/_next/static/chunks/27jktro2p5rq9.js",
  "/_next/static/chunks/2cya-h6pss2j9.js",
  "/_next/static/chunks/2fxatfi4xu1vg.js",
  "/_next/static/chunks/2gb19p2b7_aqc.js",
  "/_next/static/chunks/2nfb637yct5x2.js",
  "/_next/static/chunks/2zd3f-_f1129q.js",
  "/_next/static/chunks/34a1oukrr93wj.js",
  "/_next/static/chunks/362catsqzs45j.js",
  "/_next/static/chunks/36z57ezv9m8s9.js",
  "/_next/static/chunks/3ct-0kbhmcuu4.js",
  "/_next/static/chunks/3j2u3da3i8eh9.css",
  "/_next/static/chunks/3jo3mjf73s--z.js",
  "/_next/static/chunks/3jvkbm-wxvaor.js",
  "/_next/static/chunks/43cavunylurnk.js",
  "/_next/static/chunks/turbopack-3y4_9gvwbdyxg.js",
  "/_next/static/media/favicon.2vob68tjqpejf.ico"
];
const NAVIGATION_PATHS = new Set(["/", "/dashboard", "/offline", "/offline/capture"]);
const INSTALL_ERROR_KEY = "/__cred_sw_last_install_error__";
const REQUIRED_DIAGNOSTIC_ASSETS = ["/offline.html", "/offline/offline-shell.css", "/offline/offline-shell.js", "/offline/contracts.js", "/offline/db.js", "/offline/store.js", "/manifest.webmanifest", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"];
const lifecycleState = { install: null, activate: null, claim: { executed: false, completedAt: null, error: null }, skipWaiting: { executed: false, at: null, source: null, error: null }, fetch: { count: 0, lastAt: null, lastUrl: null, lastMode: null, lastDestination: null }, messages: [] };
function markLifecycle(name, patch = {}) { lifecycleState[name] = { ...(lifecycleState[name] || {}), ...patch }; console.log("[CRED SW] " + name, lifecycleState[name]); }
async function executeSkipWaiting(source) { lifecycleState.skipWaiting = { executed: false, at: new Date().toISOString(), source, error: null }; try { await self.skipWaiting(); lifecycleState.skipWaiting.executed = true; console.log("[CRED SW] skipWaiting complete", lifecycleState.skipWaiting); } catch (error) { lifecycleState.skipWaiting.error = error instanceof Error ? error.message : String(error); console.error("[CRED SW] skipWaiting failed", lifecycleState.skipWaiting); throw error; } }

async function storeInstallError(message) {
  try {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(INSTALL_ERROR_KEY, new Response(JSON.stringify({ message, at: new Date().toISOString() }), { headers: { "Content-Type": "application/json; charset=utf-8" } }));
  } catch { }
}

async function missingRequiredAssets() {
  const missing = [];
  for (const asset of REQUIRED_DIAGNOSTIC_ASSETS) {
    const response = await caches.match(asset).catch(() => undefined);
    if (!response || !response.ok) missing.push(asset);
  }
  return missing;
}

async function readLastInstallError() {
  const response = await caches.match(INSTALL_ERROR_KEY).catch(() => undefined);
  if (!response) return null;
  return response.json().catch(() => null);
}

async function diagnosticsPayload() {
  const cacheNames = await caches.keys();
  return {
    version: CACHE_VERSION,
    activeCacheName: CACHE_VERSION,
    precacheAssetCount: PRECACHE_ASSETS.length,
    requiredAssetCount: REQUIRED_DIAGNOSTIC_ASSETS.length,
    missingRequiredAssets: await missingRequiredAssets(),
    lastInstallError: await readLastInstallError(),
    cacheNames,
    scriptURL: self.location.href,
    scope: self.registration?.scope || null,
    lifecycleState,
    install: lifecycleState.install,
    activate: lifecycleState.activate,
    claim: lifecycleState.claim,
    skipWaiting: lifecycleState.skipWaiting,
    fetch: lifecycleState.fetch,
  };
}

self.addEventListener("install", (event) => {
  markLifecycle("install", { startedAt: new Date().toISOString(), completedAt: null, error: null, cacheName: CACHE_VERSION });
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    try {
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
    await cache.delete(INSTALL_ERROR_KEY);
    markLifecycle("install", { completedAt: new Date().toISOString(), error: null });
    await executeSkipWaiting("install");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markLifecycle("install", { error: message });
      console.error("[CRED SW] install failed", message);
      await storeInstallError(message);
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  markLifecycle("activate", { startedAt: new Date().toISOString(), completedAt: null, error: null, cacheName: CACHE_VERSION });
  event.waitUntil((async () => {
    const offline = await caches.match(OFFLINE_DOCUMENT);
    if (!offline || !offline.ok) throw new Error("Offline document missing after install");
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("cred-offline-") && key !== CACHE_VERSION).map((key) => caches.delete(key)));
    try { await self.clients.claim(); lifecycleState.claim = { executed: true, completedAt: new Date().toISOString(), error: null }; } catch (error) { lifecycleState.claim = { executed: false, completedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }; throw error; }
    markLifecycle("activate", { completedAt: new Date().toISOString(), error: null });
  })());
});

self.addEventListener("message", (event) => {
  lifecycleState.messages.push({ at: new Date().toISOString(), type: event.data?.type || null });
  if (lifecycleState.messages.length > 20) lifecycleState.messages.shift();
  console.log("[CRED SW] message", event.data);
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(executeSkipWaiting("message"));
  if (event.data?.type === "CRED_SW_DIAGNOSTICS") {
    event.waitUntil((async () => {
      event.ports?.[0]?.postMessage(await diagnosticsPayload());
    })());
  }
});

function sameOrigin(url) { return url.origin === self.location.origin; }
function isApiOrExternal(url) { return !sameOrigin(url) || url.pathname.startsWith("/api/") || url.hostname.includes("supabase.co"); }
function isRscRequest(request, url) { return url.searchParams.has("_rsc") || request.headers.get("RSC") === "1" || (request.headers.get("Accept") || "").includes("text/x-component"); }
function isStaticAsset(request, url) { return request.destination === "script" || request.destination === "style" || request.destination === "font" || request.destination === "manifest" || request.destination === "image" || url.pathname.startsWith("/_next/static/") || url.pathname === "/apple-touch-icon.png" || url.pathname === "/apple-touch-icon-precomposed.png" || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/splash/"); }
function shouldUseOfflineShell(url) { return NAVIGATION_PATHS.has(url.pathname) || url.pathname.startsWith("/dashboard/") || url.pathname.startsWith("/offline/"); }
async function offlineDocument() { return (await caches.match(OFFLINE_DOCUMENT)) || new Response("CRED offline shell is not installed.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
async function fetchWithTimeout(request, timeoutMs) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs); try { return await fetch(request, { signal: controller.signal }); } finally { clearTimeout(timeout); } }
function validAssetResponse(response) { return response.ok && !response.redirected && response.type !== "opaque" && response.type !== "opaqueredirect" && !(response.headers.get("content-type") || "").includes("text/html"); }

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  lifecycleState.fetch = { count: lifecycleState.fetch.count + 1, lastAt: new Date().toISOString(), lastUrl: url.href, lastMode: request.mode, lastDestination: request.destination };
  console.log("[CRED SW] fetch", lifecycleState.fetch);
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
