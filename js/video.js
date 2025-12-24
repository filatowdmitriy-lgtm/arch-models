// js/video.js
//
// iOS / Telegram SAFE video module
// Основан на СТАРОМ рабочем video.js
// + добавлен UI-контроллер карточек
//
// ВАЖНО:
// - ОДИН <video>
// - загрузка ТОЛЬКО через fetch → blob → objectURL
// - карточки НЕ содержат <video>

import { cachedFetch } from "./cache/cachedFetch.js";

let videoEl = null;
let listEl = null;
let emptyEl = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let currentIndex = -1;

let currentBlobUrl = null;
let isPlaying = false;

/* ============================================================
   INIT
   ============================================================ */

export function initVideo(refs, callbacks = {}) {
  videoEl = refs?.videoEl || null;
  listEl = refs?.listEl || null;
  emptyEl = refs?.emptyEl || null;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  if (!videoEl || !listEl) {
    console.error("initVideo: videoEl / listEl missing");
    return;
  }

  // iOS / Telegram flags
  videoEl.setAttribute("playsinline", "");
  videoEl.setAttribute("webkit-playsinline", "");
  videoEl.playsInline = true;

  // metadata hack (КАК БЫЛО)
  videoEl.addEventListener("loadedmetadata", () => {
    try {
      videoEl.currentTime = 0.001;
      videoEl.currentTime = 0;
    } catch (e) {}
  });

  videoEl.addEventListener("play", () => {
    isPlaying = true;
    if (onPlayCb) onPlayCb();
  });

  videoEl.addEventListener("pause", () => {
    isPlaying = false;
    if (onPauseCb) onPauseCb();
  });
}

/* ============================================================
   INTERNAL: LOAD VIDEO (СТАРАЯ ЛОГИКА)
   ============================================================ */

async function loadVideoByIndex(index) {
  if (!videoEl) return;
  if (index < 0 || index >= videoList.length) return;

  currentIndex = index;
  const url = videoList[index];

  // очистка старого blob
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  try {
    // fetch → blob (КАК РАНЬШЕ)
    const resp = await cachedFetch(url);
    const blob = await resp.blob();

    const objUrl = URL.createObjectURL(blob);
    currentBlobUrl = objUrl;

    videoEl.src = objUrl;
    videoEl.load();
  } catch (e) {
    console.error("Video load failed:", e);
    videoEl.removeAttribute("src");
    videoEl.load();
  }
}

/* ============================================================
   UI: CARDS
   ============================================================ */

function renderCards() {
  listEl.innerHTML = "";

  if (!videoList.length) {
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  videoList.forEach((url, index) => {
    const card = document.createElement("div");
    card.className = "video-card";
    card.dataset.index = index;

    card.addEventListener("click", () => {
      if (isPlaying) {
        try { videoEl.pause(); } catch (e) {}
      }
      loadVideoByIndex(index);
    });

    listEl.appendChild(card);
  });
}

/* ============================================================
   PUBLIC API
   ============================================================ */

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : (list ? [list] : []);
  currentIndex = -1;

  renderCards();

  if (videoList.length > 0) {
    loadVideoByIndex(0);
  } else {
    if (videoEl) {
      videoEl.removeAttribute("src");
      videoEl.load();
    }
  }
}

export function activateVideo() {
  active = true;
}

export function deactivateVideo() {
  active = false;

  if (videoEl && !videoEl.paused) {
    try { videoEl.pause(); } catch (e) {}
  }
}
