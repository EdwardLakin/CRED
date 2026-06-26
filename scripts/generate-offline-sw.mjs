import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const nextStaticRoot = path.join(root, ".next", "static");
const outputPath = path.join(root, "public", "sw.js");

async function walk(directory) {
  const entries = await fs.readdir(directory, {
    withFileTypes: true,
  });

  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

const staticFiles = await walk(nextStaticRoot);

const nextAssets = staticFiles
  .map((absolutePath) => {
    const relativePath = path
      .relative(nextStaticRoot, absolutePath)
      .split(path.sep)
      .join("/");

    return `/_next/static/${relativePath}`;
  })
  .sort();

const shellAssets = [
  "/offline",
  "/offline/capture",
  "/manifest.webmanifest",
  "/icons/cred-icon.svg",
  "/icons/cred-maskable.svg",
  "/splash/cred-splash.svg",
  ...nextAssets,
];

const uniqueAssets = [...new Set(shellAssets)];

const revision = crypto
  .createHash("sha256")
  .update(`offline-shell-v2\n${uniqueAssets.join("\n")}`)
  .digest("hex")
  .slice(0, 16);

const source = `const CACHE_VERSION = ${JSON.stringify(
  `cred-offline-${revision}`,
)};
const OFFLINE_ROUTE = "/offline";
const OFFLINE_CAPTURE_ROUTE = "/offline/capture";
const PRECACHE_ASSETS = ${JSON.stringify(uniqueAssets, null, 2)};

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
              \`Unable to precache \${asset}: \${response.status}\`,
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
  return /^\\/dashboard\\/sessions\\/[^/]+\\/capture\\/?$/.test(
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
          \`\${url.origin}\${OFFLINE_ROUTE}\`,
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
            \`\${url.origin}\${OFFLINE_ROUTE}\`,
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
`;

await fs.writeFile(outputPath, source, "utf8");

console.log(
  `Generated public/sw.js with ${uniqueAssets.length} precached assets (${revision}).`,
);
