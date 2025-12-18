import { getFile, saveFile } from "./db.js";

// Логирование для отладки
function log(msg) {
  console.log(msg);
}

export async function cachedFetch(url) {
  //
  // ❗ Выделяем objectPath из URL
  //
  const u = new URL(url);
  const objectPath = u.searchParams.get("path");

  // Если что-то пошло совсем не так — fallback
  const cacheKey = objectPath || url;

  //
  // 1. Проверяем кеш
  //
  const cached = await getFile(cacheKey);
  if (cached) {
    log("HIT: " + cacheKey);
    return cached;
  }

  //
  // 2. Загружаем с сервера
  //
  log("SAVE: " + cacheKey);

  const res = await fetch(url);
  const blob = await res.clone().blob();

  //
  // 3. Сохраняем в кеш (ключ = objectPath)
  //
  await saveFile(cacheKey, blob);

  return blob;
}
