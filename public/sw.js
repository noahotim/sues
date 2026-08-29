/* SUES offline app shell service worker.
 *
 * Strategy:
 *  - Navigation requests (/, /login, ...) -> network-first, falling back to the
 *    cached shell. Guarantees a fresh deploy on first online visit.
 *  - Hashed build assets (/assets/*) are immutable -> cache-first with
 *    background revalidation, so the whole app (including the maintenance
 *    lockout screen and its Snake game) works offline after one visit.
 *  - Google Fonts are cached too so typography renders offline.
 */
const CACHE_NAME = "sues-shell-v4";

self.addEventListener("install", () => {
  // Force waiting service workers out of the way on new installs.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests.
  if (request.method !== "GET") return;

  // Cross-origin: only cache Google Fonts so the app still looks right offline.
  if (url.origin !== self.location.origin) {
    if (
      url.origin === "https://fonts.googleapis.com" ||
      url.origin === "https://fonts.gstatic.com"
    ) {
      event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
          const cached = await cache.match(request);
          const fetchPromise = fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      );
    }
    return;
  }

  // Navigation (HTML) -> network-first with cache fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        } catch (err) {
          const cached = await cache.match(request);
          const fallback = cached || (await cache.match("/index.html"));
          if (fallback) return fallback;
          throw err;
        }
      })
    );
    return;
  }

  // Same-origin assets -> cache-first with background revalidation.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
