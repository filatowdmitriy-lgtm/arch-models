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
//
// Использование:
//   import { initVideo, loadVideo, activateVideo, deactivateVideo } from "./video.js";
//
//   initVideo(videoEl);
//   loadVideo(url);
//   activateVideo();
//   deactivateVideo();
//

let video = null;
let currentBlobUrl = null;
let active = false;

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */

export function initVideo(videoElement) {
  video = videoElement;

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
      video.currentTime = 0.001; // принудительно прокручиваем
      video.currentTime = 0;     // возвращаем назад
    } catch (e) {}
  });
}

/* ============================================================
   ЗАГРУЗКА ВИДЕО ЧЕРЕЗ BLOB
   ============================================================ */

export async function loadVideo(url) {
  if (!video) return;

  // Сбрасываем старый URL
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  if (!url) {
    // Нет видео для этой модели
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
  // viewer.js сам покажет overlay, мы лишь оставляем здесь пустым
}

export function deactivateVideo() {
  active = false;

  if (video && !video.paused) {
    video.pause();
  }
}
