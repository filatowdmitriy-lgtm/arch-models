import { getFile, saveFile } from "./db.js";

// Визуальный логгер, работает на iPhone + Telegram
function log(msg) {
  if (window.debugLog) {
    window.debugLog.textContent = msg;
  }
  console.log(msg);
}

export async function cachedFetch(url) {
  const cached = await getFile(url);

  if (cached) {
    log("HIT: " + url.split("/").pop());
    return cached;
  }

  log("SAVE: " + url.split("/").pop());

  const res = await fetch(url);
  const blob = await res.clone().blob();

  await saveFile(url, blob);

  return blob;
}
