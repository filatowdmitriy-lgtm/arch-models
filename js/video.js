// js/video.js
//
// STABLE STREAMING VERSION (iOS / Telegram SAFE)
//
// Архитектура:
// - карточки -> fullscreen player
// - play ТОЛЬКО по прямому URL (streaming)
// - blob подключается ТОЛЬКО ПОСЛЕ начала воспроизведения
//
// Viewer.js НЕ ТРОГАЕМ

import { cachedFetch } from "./cache/cachedFetch.js";

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let currentIndex = 0;

let playerWrap = null;
let playerVideo = null;

let currentBlobUrl = null;
let blobLoading = false;

/* =========================
   Utils
   ========================= */

function isIOS() {
  const ua = navigator.userAgent || "";
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

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

function revokeBlob() {
  if (currentBlobUrl) {
    try { URL.revokeObjectURL(currentBlobUrl); } catch {}
    currentBlobUrl = null;
  }
}

/* =========================
   Blob loader (AFTER play)
   ========================= */

async function loadBlobAfterStart(srcUrl) {
  if (!isIOS()) return;
  if (!playerVideo) return;
  if (blobLoading) return;
  if (playerVideo.src.startsWith("blob:")) return;

  blobLoading = true;

  try {
    const resp = await fetch(srcUrl);
    const blob = await resp.blob();

    revokeBlob();
    const objUrl = URL.createObjectURL(blob);
    currentBlobUrl = objUrl;

    const wasPaused = playerVideo.paused;
    const time = playerVideo.currentTime || 0;

    playerVideo.src = objUrl;
    playerVideo.load();

    playerVideo.addEventListener(
      "loadedmetadata",
      () => {
        try {
          if (time > 0.1) playerVideo.currentTime = time;
        } catch {}
        if (!wasPaused) playerVideo.play().catch(() => {});
      },
      { once: true }
    );
  } catch {
    // silently ignore
  } finally {
    blobLoading = false;
  }
}

/* =========================
   Player
   ========================= */

function ensurePlayer() {
  if (playerWrap) return;

  playerWrap = document.createElement("div");
  playerWrap.style.cssText = `
    position:absolute;
    inset:0;
    display:none;
    background:#000;
  `;

  playerVideo = document.createElement("video");
  playerVideo.style.cssText = `
    width:100%;
    height:100%;
    object-fit:contain;
    background:#000;
  `;

  playerVideo.controls = true;
  playerVideo.preload = "metadata";
  playerVideo.playsInline = true;
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");

  playerVideo.addEventListener("play", () => {
    if (onPlayCb) onPlayCb();
    document.body.classList.add("video-playing");
  });

  playerVideo.addEventListener("pause", () => {
    if (onPauseCb) onPauseCb();
    document.body.classList.remove("video-playing");
  });

  playerVideo.addEventListener("playing", () => {
    loadBlobAfterStart(playerVideo.__srcUrl);
  }, { once: true });

  playerWrap.appendChild(playerVideo);
  overlayEl.appendChild(playerWrap);
}

function showPlayer() {
  listEl.style.display = "none";
  playerWrap.style.display = "block";
}

function showList() {
  playerWrap.style.display = "none";
  listEl.style.display = "flex";
}

/* =========================
   Playback
   ========================= */

function playIndex(idx) {
  if (!active) return;
  if (!videoList.length) return;

  currentIndex = idx;
  const srcUrl = withInitData(videoList[idx]);

  ensurePlayer();
  showPlayer();

  revokeBlob();
  blobLoading = false;

  playerVideo.__srcUrl = srcUrl;
  playerVideo.muted = true;
  playerVideo.src = srcUrl;
  playerVideo.load();

  const p = playerVideo.play();
  cachedFetch(srcUrl).catch(() => {});

  if (p && p.catch) {
    p.catch(() => {
      playerVideo.controls = true;
    });
  }

  playerVideo.addEventListener("playing", () => {
    playerVideo.muted = false;
  }, { once: true });
}

/* =========================
   Cards
   ========================= */

function createCard(url, idx) {
  const wrap = document.createElement("div");
  wrap.className = "video-card";
  wrap.style.cssText = `
    aspect-ratio:16/9;
    background:#111;
    border-radius:12px;
    margin:12px;
    display:flex;
    align-items:center;
    justify-content:center;
    color:#fff;
    font-size:20px;
  `;
  wrap.textContent = "▶";

  wrap.addEventListener("click", () => playIndex(idx));
  return wrap;
}

function render() {
  listEl.innerHTML = "";
  if (!videoList.length) return;

  listEl.style.display = "flex";
  listEl.style.flexDirection = "column";

  videoList.forEach((url, i) => {
    listEl.appendChild(createCard(url, i));
  });
}

/* =========================
   Public API
   ========================= */

export function initVideo(refs, callbacks = {}) {
  overlayEl = refs.overlayEl;
  listEl = refs.listEl;
  emptyEl = refs.emptyEl;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  showList();
}

export function activateVideo() {
  active = true;
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : [];
  render();
}

export function deactivateVideo() {
  active = false;
  document.body.classList.remove("video-playing");

  if (playerVideo) {
    try {
      playerVideo.pause();
      playerVideo.removeAttribute("src");
      playerVideo.load();
    } catch {}
  }

  revokeBlob();
  showList();
}