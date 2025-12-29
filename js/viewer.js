// js/video.js
//
// FINAL STABLE VERSION
// Работает на:
// - Telegram iOS
// - Android
// - Desktop
//
// Архитектура:
// - Карточки 16:9 (превью)
// - Один fullscreen video
// - play ТОЛЬКО из user gesture
// - blob грузится ПОСЛЕ старта
// - pause НЕ закрывает видео

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
let exitBtn = null;

let currentBlobUrl = null;

/* =========================
   Utils
========================= */

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
   Player
========================= */

function ensurePlayer() {
  if (playerWrap) return;

  playerWrap = document.createElement("div");
  playerWrap.style.cssText = `
    position: fixed;
    inset: 0;
    background: #000;
    display: none;
    z-index: 9999;
  `;

  playerVideo = document.createElement("video");
  playerVideo.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  `;
  playerVideo.controls = true;
  playerVideo.playsInline = true;
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.preload = "metadata";

  // iOS timeline fix
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch {}
  });

  playerVideo.addEventListener("play", () => {
    if (onPlayCb) onPlayCb();
    document.body.classList.add("video-playing");
  });

  playerVideo.addEventListener("pause", () => {
    if (onPauseCb) onPauseCb();
    document.body.classList.remove("video-playing");
  });

  // Exit button (НЕ крестик)
  exitBtn = document.createElement("div");
  exitBtn.textContent = "← Назад к видео";
  exitBtn.style.cssText = `
    position: absolute;
    top: 14px;
    left: 14px;
    color: #fff;
    font-size: 14px;
    padding: 8px 12px;
    background: rgba(0,0,0,0.45);
    border-radius: 8px;
    z-index: 10;
  `;

  exitBtn.addEventListener("click", closePlayer);

  playerWrap.appendChild(playerVideo);
  playerWrap.appendChild(exitBtn);
  document.body.appendChild(playerWrap);
}

function openPlayer(index) {
  if (!active) return;
  ensurePlayer();

  currentIndex = index;
  const srcUrl = withInitData(videoList[index]);

  revokeBlob();

  playerVideo.muted = true;
  playerVideo.src = srcUrl;
  playerVideo.load();

  playerWrap.style.display = "block";
  listEl.style.display = "none";

  const p = playerVideo.play();
  if (p?.catch) p.catch(() => {});

  // прогрев кеша
  cachedFetch(srcUrl).catch(() => {});
}

function closePlayer() {
  try { playerVideo.pause(); } catch {}
  playerVideo.removeAttribute("src");
  playerVideo.load();

  revokeBlob();

  playerWrap.style.display = "none";
  listEl.style.display = "block";
}

/* =========================
   Cards
========================= */

function createCard(url, idx) {
  const srcUrl = withInitData(url);

  const wrap = document.createElement("div");
  wrap.style.cssText = `
    width: 100%;
    aspect-ratio: 16/9;
    background: #111;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    margin-bottom: 12px;
  `;

  const preview = document.createElement("video");
  preview.src = srcUrl;
  preview.muted = true;
  preview.playsInline = true;
  preview.preload = "metadata";
  preview.style.cssText = `
    width:100%;
    height:100%;
    object-fit:cover;
    pointer-events:none;
  `;

  preview.addEventListener("loadeddata", () => {
    try {
      preview.currentTime = 0.001;
      preview.pause();
    } catch {}
  }, { once:true });

  const playIcon = document.createElement("div");
  playIcon.innerHTML = "▶";
  playIcon.style.cssText = `
    position:absolute;
    inset:0;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:48px;
    color:#fff;
    background:rgba(0,0,0,0.35);
  `;

  wrap.appendChild(preview);
  wrap.appendChild(playIcon);

  wrap.addEventListener("click", () => openPlayer(idx));

  return wrap;
}

function render() {
  listEl.innerHTML = "";

  if (!videoList.length) {
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  videoList.forEach((url, idx) => {
    listEl.appendChild(createCard(url, idx));
  });
}

/* =========================
   API
========================= */

export function initVideo(refs, callbacks = {}) {
  overlayEl = refs.overlayEl;
  listEl = refs.listEl;
  emptyEl = refs.emptyEl;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  ensurePlayer();
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
  closePlayer();
}
