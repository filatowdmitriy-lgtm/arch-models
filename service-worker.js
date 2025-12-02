const CACHE_VERSION = "v1";
const DATA_CACHE = "arch-models-cache-" + CACHE_VERSION;

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const manifest = await fetch("/arch-models/manifest.json").then(r => r.json());
      const cache = await caches.open(DATA_CACHE);
      await cache.addAll(manifest.files);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== DATA_CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(DATA_CACHE).then(cache => cache.put(event.request, clone));
          return resp;
        })
        .catch(() => cached);
    })
  );
});
