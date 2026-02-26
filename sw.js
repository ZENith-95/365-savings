const CACHE_NAME = "zenith365-cache-v6";
const APP_SHELL = [
  "index.html",
  "dashboard.html",
  "css/styles.css",
  "js/storage.js",
  "js/auth.js",
  "js/calendar.js",
  "js/charts.js",
  "js/animations.js",
  "js/app.js",
  "js/sw-register.js"
];
const THIRD_PARTY = [
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);

    await Promise.allSettled(
      THIRD_PARTY.map(async (url) => {
        try {
          const request = new Request(url, { mode: "no-cors" });
          const response = await fetch(request);
          await cache.put(url, response);
        } catch (_error) {
          // Third-party caching is best effort.
        }
      })
    );

    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (request.url.startsWith(self.location.origin) || THIRD_PARTY.includes(request.url)) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (_error) {
      const fallback = await cache.match("index.html");
      if (fallback) return fallback;
      throw _error;
    }
  })());
});
