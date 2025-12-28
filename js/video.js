// js/video.js
//
// НАДЁЖНАЯ версия под Telegram WebView (iOS + Android + ПК)
//
// Принцип:
// - карточки = обычные div (НЕ video)
// - один общий <video> как в эталоне
// - загрузка ТОЛЬКО через fetch -> blob -> objectURL
// - play БЕЗ await
// - свайп как в эталоне
//
// API совместим с viewer.js:
// initVideo({ overlayEl, listEl, emptyEl }, callbacks)
// activateVideo(), setVideoList(list), deactivateVideo()

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let videoEl = null;
let currentBlobUrl = null;

let videoList = [];
let videoIndex = 0;

let active = false;
let isPlaying = false;

let onPlayCb = null;
let onPauseCb = null;

// swipe
let swipeStartX = 0;
let swipeStartY = 0;

// ============================================================
// INIT
// ============================================================

export function initVideo(refs, callbacks = {}) {
  overlayEl = refs.overlayEl;
  listEl = refs.listEl;
  emptyEl = refs.emptyEl;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  if (!overlayEl || !listEl) {
    console.error("initVideo: missing refs");
    return;
  }

  createPlayer();
}

// ============================================================
// PLAYER (ЭТАЛОН)
// ============================================================

function createPlayer() {
  if (videoEl) return;

  videoEl = document.createElement("video");
  videoEl.controls = true;
  videoEl.preload = "metadata";

  videoEl.setAttribute("playsinline", "");
  videoEl.setAttribute("webkit-playsinline", "");
  videoEl.playsInline = true;

  videoEl.style.position = "absolute";
  videoEl.style.inset = "0";
  videoEl.style.width = "100%";
  videoEl.style.height = "100%";
  videoEl.style.background = "#000";
  videoEl.style.display = "none";
  videoEl.style.zIndex = "10";

  // metadata hack (КРИТИЧНО для Telegram)
  videoEl.addEventListener("loadedmetadata", () => {
    try {
      videoEl.currentTime = 0.001;
      videoEl.currentTime = 0;
    } catch {}
  });

  videoEl.addEventListener("play", () => {
    isPlaying = true;
    if (onPlayCb) onPlayCb();
  });

  videoEl.addEventListener("pause", () => {
    isPlaying = false;
    closeVideo();
    if (onPauseCb) onPauseCb();
  });

  // свайп — ТОЛЬКО когда не играет
  videoEl.addEventListener("touchstart", (e) => {
    if (!active || isPlaying || videoList.length <= 1) return;
    const t = e.touches[0];
    swipeStartX = t.clientX;
    swipeStartY = t.clientY;
  }, { passive: true });

  videoEl.addEventListener("touchend", (e) => {
    if (!active || isPlaying || videoList.length <= 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStartX;
    const dy = t.clientY - swipeStartY;
    if (Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < -50) nextVideo();
    if (dx > 50) prevVideo();
  }, { passive: true });

  overlayEl.appendChild(videoEl);
}

// ============================================================
// LOAD VIDEO (ЭТАЛОН)
// ============================================================

async function loadVideo(url) {
  if (!videoEl) return;

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  if (!url) {
    videoEl.removeAttribute("src");
    videoEl.load();
    return;
  }

  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    currentBlobUrl = URL.createObjectURL(blob);
    videoEl.src = currentBlobUrl;
    videoEl.load();
  } catch (e) {
    console.error("video load error", e);
  }
}

// ============================================================
// OPEN / CLOSE
// ============================================================

function openVideo(index) {
  if (!active) return;

  videoIndex = index;

  listEl.style.display = "none";
  if (emptyEl) emptyEl.style.display = "none";

  videoEl.style.display = "block";

  loadVideo(videoList[videoIndex]).then(() => {
    videoEl.play().catch(() => {});
  });
}

function closeVideo() {
  videoEl.style.display = "none";
  listEl.style.display = "block";
}

// ============================================================
// SWIPE
// ============================================================

function nextVideo() {
  videoIndex = (videoIndex + 1) % videoList.length;
  loadVideo(videoList[videoIndex]);
}

function prevVideo() {
  videoIndex = (videoIndex - 1 + videoList.length) % videoList.length;
  loadVideo(videoList[videoIndex]);
}

// ============================================================
// LIST
// ============================================================

function renderList() {
  listEl.innerHTML = "";

  if (!videoList.length) {
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  videoList.forEach((url, i) => {
    const card = document.createElement("div");
    card.className = "video-card";
    card.style.height = "160px";
    card.style.borderRadius = "12px";
    card.style.background = "rgba(255,255,255,0.08)";
    card.style.marginBottom = "12px";
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.justifyContent = "center";
    card.textContent = "▶ Видео " + (i + 1);

    card.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openVideo(i);
    });

    listEl.appendChild(card);
  });
}

// ============================================================
// PUBLIC API
// ============================================================

export function activateVideo() {
  active = true;
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : [];
  videoIndex = 0;
  renderList();
}

export function deactivateVideo() {
  active = false;

  try {
    videoEl.pause();
  } catch {}

  closeVideo();

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}
