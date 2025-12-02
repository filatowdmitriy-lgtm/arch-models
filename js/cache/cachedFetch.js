// cachedFetch — загружает файл один раз, потом возвращает из IndexedDB

import { getFile, saveFile } from "./db.js";

export async function cachedFetch(url) {
  // 1. ПРОВЕРЯЕМ КЭШ
  const cached = await getFile(url);
  if (cached) {
    return cached; // это Blob
  }

  // 2. КАЧАЕМ ИЗ СЕТИ
  const res = await fetch(url);
  const blob = await res.clone().blob();

  // 3. КЛАДЁМ В КЭШ
  await saveFile(url, blob);

  return blob;
}
