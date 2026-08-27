const CACHE_VERSION = "cred-offline-40335801963a511d";
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
  "/_next/static/G-swx1o4MArB2jeKhxQ7s/_buildManifest.js",
  "/_next/static/G-swx1o4MArB2jeKhxQ7s/_clientMiddlewareManifest.js",
  "/_next/static/G-swx1o4MArB2jeKhxQ7s/_ssgManifest.js",
  "/_next/static/chunks/00e41w0hiejdl.js",
  "/_next/static/chunks/01sxowo2k_3jr.js",
  "/_next/static/chunks/02-blbd0utox5.css",
  "/_next/static/chunks/0245a4ypel7xx.js",
  "/_next/static/chunks/05-c3ty_6dwfk.js",
  "/_next/static/chunks/0_ogccgobcvx5.js",
  "/_next/static/chunks/0cz1d0mv5g_q7.js",
  "/_next/static/chunks/0d3p-ufj2u2px.js",
  "/_next/static/chunks/0faz_p33taz8g.js",
  "/_next/static/chunks/0jy0f9knmomhz.js",
  "/_next/static/chunks/0ti4j_ktf6p1b.js",
  "/_next/static/chunks/0zm7blno40yu7.js",
  "/_next/static/chunks/1-zkh_cjahta2.css",
  "/_next/static/chunks/11-b8zg-v3i17.js",
  "/_next/static/chunks/14c84r1im9svk.js",
  "/_next/static/chunks/1_ioe6wf_o_24.css",
  "/_next/static/chunks/1cw-jloo4bdl6.js",
  "/_next/static/chunks/1gc9k41hffps0.js",
  "/_next/static/chunks/1hccgaonmpk0a.js",
  "/_next/static/chunks/1ldhwkdsg700d.js",
  "/_next/static/chunks/1m--05zym-io_.js",
  "/_next/static/chunks/1ripxx8ef1fx-.js",
  "/_next/static/chunks/1rxncug86bump.js",
  "/_next/static/chunks/1w99iok_sryyo.js",
  "/_next/static/chunks/2-5yncwqc4p7r.js",
  "/_next/static/chunks/21x9obqqc2awh.js",
  "/_next/static/chunks/27dxcpzhiu5ca.js",
  "/_next/static/chunks/27jktro2p5rq9.js",
  "/_next/static/chunks/28-ol6qur5ba8.js",
  "/_next/static/chunks/29a8yrpzeo-fm.js",
  "/_next/static/chunks/2cf26u5_587n_.js",
  "/_next/static/chunks/2cya-h6pss2j9.js",
  "/_next/static/chunks/2e1vt4389bvqd.js",
  "/_next/static/chunks/2fxatfi4xu1vg.js",
  "/_next/static/chunks/2mfesfndqn-3g.js",
  "/_next/static/chunks/2su-9ggs_g2hr.js",
  "/_next/static/chunks/2u325olvpav31.js",
  "/_next/static/chunks/2y8p_mkjzdd-l.js",
  "/_next/static/chunks/2zne1uwzmihjv.js",
  "/_next/static/chunks/3--u0hdu2pgf_.js",
  "/_next/static/chunks/3-maz4cayte2m.js",
  "/_next/static/chunks/30cwj18rr0ich.js",
  "/_next/static/chunks/33u59vf_8xpd-.js",
  "/_next/static/chunks/36z57ezv9m8s9.js",
  "/_next/static/chunks/3d6vvecgube4d.js",
  "/_next/static/chunks/3j4jj0zz9eflh.js",
  "/_next/static/chunks/3jvkbm-wxvaor.js",
  "/_next/static/chunks/3yr1g-av9q21z.js",
  "/_next/static/chunks/4080l9tdj95ik.js",
  "/_next/static/chunks/439fpgv2m1nmw.js",
  "/_next/static/chunks/43cavunylurnk.js",
  "/_next/static/chunks/turbopack-3y4_9gvwbdyxg.js",
  "/_next/static/ehiChgMYf6eq3IL9_YqYu/_buildManifest.js",
  "/_next/static/ehiChgMYf6eq3IL9_YqYu/_clientMiddlewareManifest.js",
  "/_next/static/ehiChgMYf6eq3IL9_YqYu/_ssgManifest.js",
  "/_next/static/iffSOVS47rLSxRf2OhOg1/_buildManifest.js",
  "/_next/static/iffSOVS47rLSxRf2OhOg1/_clientMiddlewareManifest.js",
  "/_next/static/iffSOVS47rLSxRf2OhOg1/_ssgManifest.js",
  "/_next/static/media/favicon.2vob68tjqpejf.ico"
];
const NAVIGATION_PATHS = new Set(["/", "/dashboard", "/sign-in", "/offline", "/offline/capture"]);
const INSTALL_ERROR_KEY = "/__cred_sw_last_install_error__";
const REQUIRED_DIAGNOSTIC_ASSETS = ["/offline.html", "/offline/offline-shell.css", "/offline/offline-shell.js", "/offline/contracts.js", "/offline/db.js", "/offline/store.js", "/manifest.webmanifest"];
const REQUIRED_ASSETS = new Set(REQUIRED_DIAGNOSTIC_ASSETS);
const lifecycleState = { install: null, activate: null, claim: { executed: false, completedAt: null, error: null }, skipWaiting: { executed: false, at: null, source: null, error: null }, fetch: { count: 0, lastAt: null, lastUrl: null, lastMode: null, lastDestination: null, error: null }, messages: [], installLog: [] };
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function recordInstallLog(entry) { try { lifecycleState.installLog.push({ at: new Date().toISOString(), ...entry }); if (lifecycleState.installLog.length > 80) lifecycleState.installLog.shift(); } catch { } }
function markLifecycle(name, patch = {}) { try { lifecycleState[name] = { ...(lifecycleState[name] || {}), ...patch }; console.log("[CRED SW] " + name, lifecycleState[name]); } catch { } }
async function executeSkipWaiting(source) { lifecycleState.skipWaiting = { executed: false, at: new Date().toISOString(), source, error: null }; try { await self.skipWaiting(); lifecycleState.skipWaiting.executed = true; console.log("[CRED SW] skipWaiting complete", lifecycleState.skipWaiting); return true; } catch (error) { lifecycleState.skipWaiting.error = errorMessage(error); recordInstallLog({ level: "warn", step: "skipWaiting", error: lifecycleState.skipWaiting.error }); console.error("[CRED SW] skipWaiting failed", lifecycleState.skipWaiting); return false; } }

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

async function precacheAsset(cache, asset) {
  const request = new Request(asset, { cache: "reload", credentials: "same-origin", redirect: "error" });
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    throw new Error(`Unable to fetch precache asset ${asset}: ${errorMessage(error)}`);
  }
  if (!response.ok || response.redirected || response.type === "opaqueredirect" || response.type === "opaque") {
    throw new Error(`Unable to precache ${asset}: status=${response.status} redirected=${response.redirected} type=${response.type}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if ((asset.endsWith(".js") && contentType.includes("text/html")) || (asset.endsWith(".css") && contentType.includes("text/html"))) {
    throw new Error(`Refusing to precache HTML for asset ${asset}`);
  }
  try {
    await cache.put(asset, response);
  } catch (error) {
    throw new Error(`Unable to cache.put precache asset ${asset}: ${errorMessage(error)}`);
  }
}

self.addEventListener("install", (event) => {
  markLifecycle("install", { startedAt: new Date().toISOString(), completedAt: null, error: null, optionalErrors: [], cacheName: CACHE_VERSION });
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const optionalErrors = [];
    try {
      for (const asset of PRECACHE_ASSETS) {
        try {
          await precacheAsset(cache, asset);
          recordInstallLog({ level: "info", step: "cached", asset, required: REQUIRED_ASSETS.has(asset) });
        } catch (error) {
          const message = errorMessage(error);
          recordInstallLog({ level: REQUIRED_ASSETS.has(asset) ? "error" : "warn", step: "precache", asset, required: REQUIRED_ASSETS.has(asset), error: message });
          if (REQUIRED_ASSETS.has(asset)) throw new Error(`Required offline asset failed: ${asset}: ${message}`);
          optionalErrors.push({ asset, error: message });
        }
      }
      markLifecycle("install", { completedAt: new Date().toISOString(), error: null, optionalErrors });
      await storeInstallError(optionalErrors.length ? `Optional precache failures: ${optionalErrors.map((item) => item.asset).join(", ")}` : "").catch(() => undefined);
      await cache.delete(INSTALL_ERROR_KEY).catch((error) => recordInstallLog({ level: "warn", step: "clearInstallError", error: errorMessage(error) }));
      await executeSkipWaiting("install");
    } catch (error) {
      const message = errorMessage(error);
      markLifecycle("install", { error: message, optionalErrors });
      console.error("[CRED SW] install failed", message);
      await storeInstallError(message).catch(() => undefined);
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
    try { await self.clients.claim(); lifecycleState.claim = { executed: true, completedAt: new Date().toISOString(), error: null }; } catch (error) { lifecycleState.claim = { executed: false, completedAt: new Date().toISOString(), error: errorMessage(error) }; console.error("[CRED SW] clients.claim failed", lifecycleState.claim); }
    markLifecycle("activate", { completedAt: new Date().toISOString(), error: null });
  })());
});

self.addEventListener("message", (event) => {
  try { lifecycleState.messages.push({ at: new Date().toISOString(), type: event.data?.type || null }); if (lifecycleState.messages.length > 20) lifecycleState.messages.shift(); console.log("[CRED SW] message", event.data); } catch { }
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(executeSkipWaiting("message"));
  if (event.data?.type === "CRED_SW_DIAGNOSTICS") {
    event.waitUntil((async () => {
      try { event.ports?.[0]?.postMessage(await diagnosticsPayload()); } catch (error) { event.ports?.[0]?.postMessage({ error: errorMessage(error) }); }
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
  let request, url;
  try {
    request = event.request;
    if (request.method !== "GET") return;
    url = new URL(request.url);
    lifecycleState.fetch = { count: lifecycleState.fetch.count + 1, lastAt: new Date().toISOString(), lastUrl: url.href, lastMode: request.mode, lastDestination: request.destination, error: null };
    console.log("[CRED SW] fetch", lifecycleState.fetch);
  } catch (error) {
    lifecycleState.fetch = { ...lifecycleState.fetch, error: errorMessage(error) };
    return;
  }
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
      const response = await fetchWithTimeout(request, shouldUseOfflineShell(url) ? 10000 : 3000);
      if (response.ok && !response.redirected && !shouldUseOfflineShell(url)) (await caches.open(CACHE_VERSION)).put(request, response.clone());
      return response;
    } catch {
      if (shouldUseOfflineShell(url)) return offlineDocument();
      return (await caches.match(request)) || offlineDocument();
    }
  })());
});
