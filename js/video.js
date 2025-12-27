// js/video.js
//
// Рабочая версия:
// - iOS / Telegram SAFE
// - blob → objectURL
// - один <video>, список карточек
// - без магии, без двойных src

let video = null;
let overlayEl = null;
let listEl = null;
let emptyEl = null;

let currentBlobUrl = null;
let active = false;

let videoList = [];
let onPlayCb = null;
let onPauseCb = null;

/* ============================================================
   INIT
   ============================================================ */

export function initVideo(refs, callbacks = {}) {
  overlayEl = refs.overlayEl;
  listEl = refs.listEl;
  emptyEl = refs.emptyEl;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  if (!overlayEl || !listEl) {
    console.error("video.js: refs missing");
    return;
  }

  // создаём ЕДИНСТВЕННЫЙ video
  video = document.createElement("video");
  video.controls = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "metadata";

  // metadata hack (как в старом рабочем коде)
  video.addEventListener("loadedmetadata", () => {
    try {
      video.currentTime = 0.001;
      video.currentTime = 0;
    } catch {}
  });

  video.addEventListener("play", () => {
    if (onPlayCb) onPlayCb();
  });

  video.addEventListener("pause", () => {
    if (onPauseCb) onPauseCb();
  });

  overlayEl.innerHTML = "";
  overlayEl.appendChild(video);
}

/* ============================================================
   BLOB LOADER (СТАРЫЙ, РАБОЧИЙ)
   ============================================================ */

async function loadVideoBlob(url) {
  if (!video) return;

  // чистим прошлый blob
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  try {
    const resp = await fetch(url);
    const blob = await resp.blob();

    const objUrl = URL.createObjectURL(blob);
    currentBlobUrl = objUrl;

    video.src = objUrl;
    video.load();
  } catch (e) {
    console.error("video load failed", e);
  }
}

/* ============================================================
   LIST / CARDS
   ============================================================ */

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : [];

  listEl.innerHTML = "";

  if (!videoList.length) {
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  videoList.forEach((url, idx) => {
    const card = document.createElement("div");
    card.className = "video-card";
    card.textContent = `Видео ${idx + 1}`;

    card.addEventListener("click", async () => {
      if (!active) return;

      await loadVideoBlob(url);

      try {
        await video.play();
      } catch (e) {
        console.warn("play blocked", e);
      }
    });

    listEl.appendChild(card);
  });
}

/* ============================================================
   ACTIVATE / DEACTIVATE
   ============================================================ */

export function activateVideo() {
  active = true;
}

export function deactivateVideo() {
  active = false;

  if (video && !video.paused) {
    video.pause();
  }

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  video.removeAttribute("src");
  video.load();
}
