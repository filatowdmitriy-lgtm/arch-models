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
let videoList = [];
let videoIndex = 0;
let isPlaying = false;
let galleryEl = null;
let galleryVideos = [];

// свайп
let swipeStartX = 0;
let swipeStartY = 0;

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */

export function initVideo(videoElement, callbacks = {}) {
galleryEl = document.getElementById("videoGallery");
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
  isPlaying = true;
  if (onPlayCb) onPlayCb();
});

video.addEventListener("pause", () => {
  isPlaying = false;
  if (onPauseCb) onPauseCb();
});
// свайп листает видео-карточки ТОЛЬКО когда:
// - режим активен
// - видео НЕ играет
// - видео больше одного
video.addEventListener("touchstart", (e) => {
  if (!active) return;
  if (isPlaying) return;
  if (!videoList || videoList.length <= 1) return;
  if (e.touches.length !== 1) return;

  const t = e.touches[0];
  swipeStartX = t.clientX;
  swipeStartY = t.clientY;
}, { passive: true });

video.addEventListener("touchend", (e) => {
  if (!active) return;
  if (isPlaying) return;
  if (!videoList || videoList.length <= 1) return;

  const t = e.changedTouches && e.changedTouches[0];
  if (!t) return;

  const dx = t.clientX - swipeStartX;
  const dy = t.clientY - swipeStartY;

  // горизонтальный свайп
  if (Math.abs(dx) <= Math.abs(dy)) return;

  const TH = 50; // порог
  if (dx < -TH) nextVideo();   // влево
  if (dx > TH) prevVideo();    // вправо
}, { passive: true });

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

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : (list ? [list] : []);
  videoIndex = 0;

  if (!videoList.length) {
    loadVideo(null);
    return;
  }

  loadVideo(videoList[videoIndex]);
}

export function nextVideo() {
  if (isPlaying) return;
  if (!videoList || videoList.length <= 1) return;

  videoIndex = (videoIndex + 1) % videoList.length;
  loadVideo(videoList[videoIndex]);
}

export function prevVideo() {
  if (isPlaying) return;
  if (!videoList || videoList.length <= 1) return;

  videoIndex = (videoIndex - 1 + videoList.length) % videoList.length;
  loadVideo(videoList[videoIndex]);
}

export function deactivateVideo() {
  active = false;

  if (video && !video.paused) {
    video.pause();
  }
}
export function renderVideoGallery(videoList) {
  if (!galleryEl) return;

  galleryEl.classList.remove("hidden");
  galleryVideos = videoList || [];
  galleryEl.innerHTML = "";

  if (!galleryVideos.length) return;

  galleryVideos.forEach((src, index) => {
    const card = document.createElement("div");
    card.className = "video-card";

    const v = document.createElement("video");
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";

    v.addEventListener("click", () => {
      loadVideo(src);
      activateVideo();
      galleryEl.classList.add("hidden");
    });

    card.appendChild(v);
    galleryEl.appendChild(card);
  });
}

