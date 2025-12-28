// js/video.js
//
// РАБОЧАЯ ВЕРСИЯ:
// - список карточек
// - один video element (как в эталоне)
// - blob загрузка
// - iOS / Telegram OK
// - ПК OK

let overlayEl = null;
let listEl = null;
let emptyEl = null;
let videoEl = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let currentIndex = 0;
let currentBlobUrl = null;

/* ================= INIT ================= */

export function initVideo(refs, callbacks = {}) {
  overlayEl = refs.overlayEl;
  listEl = refs.listEl;
  emptyEl = refs.emptyEl;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  if (!overlayEl || !listEl) {
    console.error("video: missing refs");
    return;
  }

  // создаём ЕДИНСТВЕННЫЙ video
  videoEl = document.createElement("video");
  videoEl.controls = true;
  videoEl.muted = true;              // iOS REQUIRED
  videoEl.playsInline = true;
  videoEl.setAttribute("playsinline", "");
  videoEl.setAttribute("webkit-playsinline", "");
  videoEl.style.width = "100%";
  videoEl.style.height = "100%";

  overlayEl.appendChild(videoEl);

  videoEl.addEventListener("play", () => {
    videoEl.muted = false;
    document.body.classList.add("video-playing");
    if (onPlayCb) onPlayCb();
  });

  videoEl.addEventListener("pause", () => {
    document.body.classList.remove("video-playing");
    if (onPauseCb) onPauseCb();
  });
}

/* ================= HELPERS ================= */

function withInitData(url) {
  try {
    if (!window.TG_INIT_DATA) return url;
    const u = new URL(url);
    if (!u.searchParams.get("initData")) {
      u.searchParams.set("initData", window.TG_INIT_DATA);
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function loadVideo(url) {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  const resp = await fetch(url);
  const blob = await resp.blob();

  const blobUrl = URL.createObjectURL(blob);
  currentBlobUrl = blobUrl;

  videoEl.src = blobUrl;
  videoEl.load();
}

/* ================= RENDER ================= */

function createCard(url, index) {
  const card = document.createElement("div");
  card.className = "video-card";
  card.style.aspectRatio = "16/9";
  card.style.background = "#000";
  card.style.borderRadius = "12px";

  card.addEventListener("click", async () => {
    if (!active) return;

    currentIndex = index;
    const src = withInitData(url);

    await loadVideo(src);
    await videoEl.play();
  });

  return card;
}

function render() {
  listEl.innerHTML = "";

  if (!videoList.length) {
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  videoList.forEach((url, i) => {
    listEl.appendChild(createCard(url, i));
  });
}

/* ================= PUBLIC API ================= */

export function activateVideo() {
  active = true;
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : [];
  render();
}

export function deactivateVideo() {
  active = false;

  if (videoEl && !videoEl.paused) {
    videoEl.pause();
  }

  document.body.classList.remove("video-playing");
}
