import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const nextStaticRoot = path.join(root, ".next", "static");
const outputPath = path.join(root, "public", "sw.js");
const offlineDocumentPath = path.join(root, "public", "offline.html");

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolutePath)));
    if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

await fs.access(offlineDocumentPath);
await fs.access(path.join(root, "public", "apple-touch-icon.png"));
const staticFiles = await walk(nextStaticRoot);
const nextAssets = staticFiles.map((absolutePath) => {
  const relativePath = path.relative(nextStaticRoot, absolutePath).split(path.sep).join("/");
  return `/_next/static/${relativePath}`;
}).sort();

const offlineAssetRoot = path.join(root, "public", "offline");
const offlineFiles = (await walk(offlineAssetRoot))
  .map((absolutePath) => `/offline/${path.relative(offlineAssetRoot, absolutePath).split(path.sep).join("/")}`)
  .sort();

const shellAssets = [
  "/offline.html",
  ...offlineFiles,
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/icons/cred-icon.svg",
  "/icons/cred-maskable.svg",
  "/splash/cred-splash.svg",
  ...nextAssets,
];
const uniqueAssets = [...new Set(shellAssets)];
const assetFingerprints = await Promise.all(uniqueAssets.map(async (asset) => {
  const filePath = asset.startsWith("/_next/static/")
    ? path.join(nextStaticRoot, asset.replace("/_next/static/", ""))
    : path.join(root, "public", asset.replace(/^\//, ""));
  try {
    const buffer = await fs.readFile(filePath);
    return `${asset}:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return `${asset}:next-runtime-route`;
    }
    throw error;
  }
}));
const revision = crypto.createHash("sha256").update(`offline-shell-v3\n${assetFingerprints.join("\n")}`).digest("hex").slice(0, 16);

const source = `const CACHE_VERSION = ${JSON.stringify(`cred-offline-${revision}`)};
const OFFLINE_DOCUMENT = "/offline.html";
const PRECACHE_ASSETS = ${JSON.stringify(uniqueAssets, null, 2)};
const NAVIGATION_PATHS = new Set(["/", "/dashboard", "/offline", "/offline/capture"]);
const INSTALL_ERROR_KEY = "/__cred_sw_last_install_error__";
const REQUIRED_DIAGNOSTIC_ASSETS = ["/offline.html", "/offline/offline-shell.css", "/offline/offline-shell.js", "/offline/contracts.js", "/offline/db.js", "/offline/store.js", "/manifest.webmanifest", "/apple-touch-icon.png"];

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
  };
}

self.addEventListener("install", (event) => {
  console.log("[CRED SW] install started", CACHE_VERSION);
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    try {
    for (const asset of PRECACHE_ASSETS) {
      const request = new Request(asset, { cache: "reload", credentials: "same-origin", redirect: "error" });
      const response = await fetch(request);
      if (!response.ok || response.redirected || response.type === "opaqueredirect" || response.type === "opaque") {
        throw new Error(\`Unable to precache \${asset}: status=\${response.status} redirected=\${response.redirected} type=\${response.type}\`);
      }
      const contentType = response.headers.get("content-type") || "";
      if ((asset.endsWith(".js") && contentType.includes("text/html")) || (asset.endsWith(".css") && contentType.includes("text/html"))) {
        throw new Error(\`Refusing to precache HTML for asset \${asset}\`);
      }
      await cache.put(asset, response);
    }
    await cache.delete(INSTALL_ERROR_KEY);
    console.log("[CRED SW] install complete", CACHE_VERSION);
    await self.skipWaiting();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[CRED SW] install failed", message);
      await storeInstallError(message);
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  console.log("[CRED SW] activate started", CACHE_VERSION);
  event.waitUntil((async () => {
    const offline = await caches.match(OFFLINE_DOCUMENT);
    if (!offline || !offline.ok) throw new Error("Offline document missing after install");
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("cred-offline-") && key !== CACHE_VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
    console.log("[CRED SW] activate complete", CACHE_VERSION);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  if (event.data?.type === "CRED_SW_DIAGNOSTICS") {
    event.waitUntil((async () => {
      event.ports?.[0]?.postMessage(await diagnosticsPayload());
    })());
  }
});

function sameOrigin(url) { return url.origin === self.location.origin; }
function isApiOrExternal(url) { return !sameOrigin(url) || url.pathname.startsWith("/api/") || url.hostname.includes("supabase.co"); }
function isRscRequest(request, url) { return url.searchParams.has("_rsc") || request.headers.get("RSC") === "1" || (request.headers.get("Accept") || "").includes("text/x-component"); }
function isStaticAsset(request, url) { return request.destination === "script" || request.destination === "style" || request.destination === "font" || request.destination === "manifest" || request.destination === "image" || url.pathname.startsWith("/_next/static/") || url.pathname === "/apple-touch-icon.png" || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/splash/"); }
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
`;
await fs.writeFile(outputPath, source, "utf8");
console.log(`Generated public/sw.js with ${uniqueAssets.length} precached assets (${revision}).`);
