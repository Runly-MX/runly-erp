// Offline shell for the public attendance pages (kiosk + phone key).
// Registered with scope /app/p/kiosk/ and /app/p/attendance/ only. It caches the
// app shell for navigations and same-origin static assets. It NEVER touches API
// calls (/public/attendance/*, or any other non-static path).
//
// Legacy scopes: before 2026-10-13 the pages lived at /app/kiosk/:link and
// /app/attendance/phone, so devices may still hold a registration of THIS same
// script at /app/kiosk/ or /app/attendance/. We deliberately keep those alive
// instead of unregistering them: a bookmarked kiosk URL or an iOS home-screen
// app that never refreshes its manifest still cold-starts at the old URL, and
// only the legacy registration can serve it offline. They cannot trap anyone
// on a stale shell because (1) the browser re-fetches /sw-kiosk.js (served
// no-store) on every navigation in scope, so both old and new registrations run
// this file; (2) navigations are network-first, so online users always get the
// current index.html, whose SPA routes redirect the old path to /app/p/...;
// (3) bumping CACHE_VERSION below drops every older shell/asset cache on
// activate (caches are origin-wide, shared by all registrations).
const CACHE_VERSION = "v2";
const SHELL_CACHE = `runly-attendance-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `runly-attendance-assets-${CACHE_VERSION}`;
const STATIC_PREFIXES = ["/assets/", "/app/assets/", "/fonts/", "/runly/"];
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
