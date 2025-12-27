// js/video.js
//
// Модуль отвечает за видео:
// - загрузка через fetch → blob → objectURL;
// - корректный таймлайн для всех браузеров (особенно в Telegram);
// - metadata hack (перезапуск currentTime);
// - пауза при выходе из режима;
// - очистка старых blob-URL.
//
// НЕ отвечает за UI, вкладки, three.js, схемы, галерею.

let video = null;
let currentBlobUrl = null;
let active = false;
let onPlayCb = null;
let onPauseCb = null;

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */

export function initVideo(videoElement, callbacks = {}) {
  video = videoElement;
  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  if (!video) {
    console.error("initVideo: videoElement is null");
    return;
  }

  // Важно для Telegram + iOS
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.playsInline = true;

  // Хак для корректного таймлайна
  video.addEventListener("loadedmetadata", () => {
    try {
      video.currentTime = 0.001;
      video.currentTime = 0;
    } catch (e) {}
  });

  // play / pause → наружу (viewer.js управляет UI)
  video.addEventListener("play", () => {
    if (onPlayCb) onPlayCb();
  });

  video.addEventListener("pause", () => {
    if (onPauseCb) onPauseCb();
  });
}

/* ============================================================
   ЗАГРУЗКА ВИДЕО ЧЕРЕЗ BLOB
   ============================================================ */

export async function loadVideo(url) {
  if (!video) return;

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  if (!url) {
    video.removeAttribute("src");
    video.load();
    return;
  }

  try {
    const resp = await fetch(url);
    const blob = await resp.blob();

    const objUrl = URL.createObjectURL(blob);
    currentBlobUrl = objUrl;

    video.src = objUrl;
    video.load();
  } catch (err) {
    console.error("Ошибка загрузки видео:", err);
    video.removeAttribute("src");
    video.load();
  }
}

/* ============================================================
   АКТИВАЦИЯ / ДЕАКТИВАЦИЯ
   ============================================================ */

export function activateVideo() {
  active = true;
}

export function deactivateVideo() {
  active = false;

  if (video && !video.paused) {
    video.pause();
  }
}
