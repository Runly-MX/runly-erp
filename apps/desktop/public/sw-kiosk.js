// Offline shell for the public attendance pages (kiosk + phone key).
// Registered with scope /app/kiosk/ and /app/attendance/ only. It caches the
// app shell for navigations and same-origin static assets. It NEVER touches API
// calls (/public/attendance/*, or any other non-static path).
const CACHE_VERSION = "v1";
const SHELL_CACHE = `runly-attendance-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `runly-attendance-assets-${CACHE_VERSION}`;
const STATIC_PREFIXES = ["/assets/", "/app/assets/", "/fonts/", "/brand/", "/runly/"];
const STATIC_FILES = new Set(["/favicon.ico", "/favicon-32x32.png", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/site.webmanifest", "/attendance-phone.webmanifest", "/runtime-config.js", "/pwa-bootstrap.js"]);
const STATIC_EXT = /\.(?:js|css|woff2?|ttf|otf|png|svg|ico|webp|mp3|wav)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith("runly-attendance-") && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  if (STATIC_FILES.has(url.pathname)) return true;
  return STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) && STATIC_EXT.test(url.pathname);
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    // Every route in scope serves the same SPA shell, so any cached navigation works offline.
    const cached = (await cache.match(request, { ignoreSearch: true })) || (await cache.keys().then((keys) => (keys[0] ? cache.match(keys[0]) : undefined)));
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await refresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API traffic.
  if (url.pathname.startsWith("/public/") || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (isStaticAsset(url)) event.respondWith(staleWhileRevalidate(request));
});
