// js/video.js
//
// Модуль отвечает за видео:
// - загрузка через fetch → blob → objectURL (fallback);
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


// === helpers for "YouTube-like" streaming with safe fallback ===
function waitForDuration(videoEl, ms = 1200) {
  return new Promise((resolve) => {
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(ok);
    };

    const cleanup = () => {
      videoEl.removeEventListener("loadedmetadata", onMeta);
      videoEl.removeEventListener("durationchange", onDur);
      videoEl.removeEventListener("error", onErr);
      clearTimeout(t);
    };

    const okDuration = () => {
      const d = videoEl.duration;
      return Number.isFinite(d) && d > 0;
    };

    const onMeta = () => {
      if (okDuration()) finish(true);

      // частый кейс: duration=Infinity. Попробуем "хак" с currentTime.
      if (videoEl.duration === Infinity) {
        try {
          videoEl.currentTime = 1e101;
        } catch (e) {}
      }
    };

    const onDur = () => {
      if (okDuration()) {
        // если мы прыгали currentTime ради duration - вернём обратно
        try {
          if (videoEl.currentTime > 1) videoEl.currentTime = 0;
        } catch (e) {}
        finish(true);
      }
    };

    const onErr = () => finish(false);

    const t = setTimeout(() => finish(okDuration()), ms);

    videoEl.addEventListener("loadedmetadata", onMeta);
    videoEl.addEventListener("durationchange", onDur);
    videoEl.addEventListener("error", onErr);
  });
}

async function setVideoSourceSmart(videoEl, url, { allowBlobFallback = true } = {}) {
  if (!url) {
    videoEl.removeAttribute("src");
    videoEl.load();
    return { mode: "none" };
  }

  // 1) direct stream (как YouTube)
  videoEl.preload = "metadata";
  videoEl.src = url;
  videoEl.load();

  const ok = await waitForDuration(videoEl, 1200);
  if (ok) return { mode: "direct" };

  // 2) fallback: blob (как было раньше, но только когда реально нужно)
  if (!allowBlobFallback) return { mode: "direct-no-metadata" };

  const resp = await fetch(url);
  const blob = await resp.blob();
  const objUrl = URL.createObjectURL(blob);

  return { mode: "blob", objectUrl: objUrl };
}


/* ===============================================
   INIT
   =============================================== */

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
    isPlaying = true;
    if (onPlayCb) onPlayCb();
  });

  video.addEventListener("pause", () => {
    isPlaying = false;
    if (onPauseCb) onPauseCb();
  });

  // свайп листает видео-карточки ТОЛЬКО когда НЕ играет
  let startX = 0;
  let startY = 0;
  let moved = false;

  video.addEventListener("touchstart", (e) => {
    if (!active) return;
    if (isPlaying) return;

    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    moved = false;
  }, { passive: true });

  video.addEventListener("touchmove", (e) => {
    if (!active) return;
    if (isPlaying) return;

    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) moved = true;
  }, { passive: true });

  video.addEventListener("touchend", (e) => {
    if (!active) return;
    if (isPlaying) return;
    if (!moved) return;

    const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
    if (!t) return;

    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    // Только горизонтальные свайпы для смены видео
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) nextVideo();
      else prevVideo();
    }
  }, { passive: true });
}


/* ===============================================
   LOAD / LIST
   =============================================== */

export async function loadVideo(url, opts = {}) {
  if (!video) return;

  // чистим прошлый blob-url (если был)
  if (currentBlobUrl) {
    try { URL.revokeObjectURL(currentBlobUrl); } catch (e) {}
    currentBlobUrl = null;
  }

  if (!url) {
    video.removeAttribute("src");
    video.load();
    return;
  }

  try {
    const { mode, objectUrl } = await setVideoSourceSmart(video, url, {
      allowBlobFallback: opts.allowBlobFallback !== false
    });

    if (mode === "blob" && objectUrl) {
      currentBlobUrl = objectUrl;
      video.src = objectUrl;
      video.load();
      // добьём метаданные для таймлайна
      await waitForDuration(video, 2000);
    }
  } catch (err) {
    console.error("Ошибка загрузки видео:", err);
    video.removeAttribute("src");
    video.load();
  }
}

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

export function setVideoIndex(i) {
  if (!videoList || !videoList.length) return;
  const n = videoList.length;
  const idx = Math.max(0, Math.min(n - 1, Number(i) || 0));
  videoIndex = idx;
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
