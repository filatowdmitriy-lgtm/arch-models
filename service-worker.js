// ================================
//  Service Worker — OFFLINE CACHE
//  Автоматическое кэширование моделей
//  Работает с manifest.json,
//  который создаёт app.js
// ================================

// Меняй версию кэша при обновлении моделей
const DATA_CACHE = "arch-models-cache-v1";
const MANIFEST_CACHE = "arch-models-manifest";

// ================================
//  INSTALL — загрузка файлов из manifest.json
// ================================
self.addEventListener("install", (event) => {
  console.log("[SW] Install…");

  event.waitUntil(
    (async () => {
      const manifestResponse = await caches.match("/manifest.json");

      if (!manifestResponse) {
        console.warn("[SW] manifest.json ещё не создан приложением");
        return;
      }

      const { files } = await manifestResponse.json();
      const cache = await caches.open(DATA_CACHE);

      console.log("[SW] Кэшируем файлы:", files);

      await cache.addAll(files);
    })()
  );
});

// ================================
//  ACTIVATE — очистка старых кэшей
// ================================
self.addEventListener("activate", (event) => {
  console.log("[SW] Activate…");

  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) => key !== DATA_CACHE && key !== MANIFEST_CACHE
          )
          .map((key) => {
            console.log("[SW] Удаляю старый кэш:", key);
            return caches.delete(key);
          })
      )
    )
  );
});

// ================================
//  FETCH — офлайн-режим + кэширование на лету
// ================================
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(DATA_CACHE).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => cached); // офлайн fallback
    })
  );
});
