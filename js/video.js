// js/video.js
//
// FINAL VERSION
// Base: Variant B (iOS-safe streaming)
// UX:
// - Cards 16:9 with preview (first frame)
// - Click card -> fullscreen player
// - Stream play (NOT full download)
// - Pause DOES NOT exit
// - Video navigation panel handled by viewer.js (onPause / onPlay)

import { cachedFetch } from "./cache/cachedFetch.js";

/* =========================
   STATE
   ========================= */

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let currentIndex = 0;

let cards = [];

let playerWrap = null;
let playerVideo = null;

let isOpen = false;

/* =========================
   UTILS
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

function warmCache(url) {
  try {
    cachedFetch(url).catch(() => {});
  } catch {}
}

/* =========================
   LIST / PLAYER VISIBILITY
   ========================= */

function showList() {
  isOpen = false;
  if (playerWrap) playerWrap.style.display = "none";
  if (listEl) listEl.style.display = "flex";
}

function showPlayer() {
  isOpen = true;
  if (listEl) listEl.style.display = "none";
  if (playerWrap) playerWrap.style.display = "flex";
}

/* =========================
   PLAYER
   ========================= */

function ensurePlayer() {
  if (playerWrap) return;

  playerWrap = document.createElement("div");
  playerWrap.style.cssText = `
    position:absolute;
    inset:0;
    display:none;
    align-items:center;
    justify-content:center;
    background:#000;
  `;

  playerVideo = document.createElement("video");
  playerVideo.preload = "metadata";
  playerVideo.controls = true;
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.playsInline = true;

  playerVideo.style.cssText = `
    width:100%;
    height:100%;
    object-fit:contain;
    background:#000;
  `;

  // timeline hack (как эталон)
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch {}
  });

  // PLAY
  playerVideo.addEventListener("play", () => {
    // unmute AFTER real start
    Promise.resolve().then(() => {
      try { playerVideo.muted = false; } catch {}
    });

    if (onPlayCb) onPlayCb();
    document.body.classList.add("video-playing");
  });

  // PAUSE — НЕ ВЫХОДИМ
  playerVideo.addEventListener("pause", () => {
    if (onPauseCb) onPauseCb();
    document.body.classList.remove("video-playing");
  });

  playerWrap.appendChild(playerVideo);
  overlayEl.appendChild(playerWrap);
}

/* =========================
   PLAYBACK
   ========================= */

function setSource(index) {
  currentIndex = index;

  const srcUrl = withInitData(videoList[currentIndex]);

  warmCache(srcUrl);

  playerVideo.muted = true; // iOS-safe
  playerVideo.src = srcUrl;
  playerVideo.load();

  // autoplay attempt
  const p = playerVideo.play();
  if (p && p.catch) {
    p.catch(() => {
      // user can press play manually
    });
  }
}

function playByIndex(index) {
  if (!active || !videoList.length) return;

  if (index < 0) index = videoList.length - 1;
  if (index >= videoList.length) index = 0;

  ensurePlayer();
  showPlayer();
  setSource(index);
}

/* =========================
   CARDS (PREVIEW)
   ========================= */

function createCard(url, index) {
  const srcUrl = withInitData(url);

  const wrap = document.createElement("div");
  wrap.style.cssText = `
    width:100%;
    aspect-ratio:16/9;
    border-radius:12px;
    overflow:hidden;
    position:relative;
    background:#000;
  `;

  // PREVIEW video (NOT interactive)
  const preview = document.createElement("video");
  preview.muted = true;
  preview.preload = "metadata";
  preview.src = srcUrl;
  preview.setAttribute("playsinline", "");
  preview.setAttribute("webkit-playsinline", "");
  preview.playsInline = true;
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
  }, { once: true });

  // play icon
  const icon = document.createElement("div");
  icon.style.cssText = `
    position:absolute;
    inset:0;
    display:flex;
    align-items:center;
    justify-content:center;
    pointer-events:none;
  `;
  icon.innerHTML = `
    <div style="
      width:56px;height:56px;
      border-radius:50%;
      background:rgba(0,0,0,.45);
      display:flex;align-items:center;justify-content:center;
    ">
      <div style="
        width:0;height:0;
        border-top:10px solid transparent;
        border-bottom:10px solid transparent;
        border-left:16px solid #fff;
        margin-left:4px;
      "></div>
    </div>
  `;

  wrap.appendChild(preview);
  wrap.appendChild(icon);

  wrap.addEventListener("click", () => {
    playByIndex(index);
  });

  warmCache(srcUrl);

  return wrap;
}

/* =========================
   RENDER
   ========================= */

function render() {
  if (!listEl) return;

  listEl.innerHTML = "";
  cards = [];

  listEl.style.display = "flex";
  listEl.style.flexDirection = "column";
  listEl.style.gap = "12px";
  listEl.style.padding = "12px";
  listEl.style.overflowY = "auto";
  listEl.style.webkitOverflowScrolling = "touch";

  const has = Array.isArray(videoList) && videoList.length > 0;
  if (emptyEl) emptyEl.style.display = has ? "none" : "block";
  if (!has) return;

  videoList.forEach((url, idx) => {
    const card = createCard(url, idx);
    cards.push(card);
    listEl.appendChild(card);
  });
}

/* =========================
   PUBLIC API
   ========================= */

export function initVideo(refs, callbacks = {}) {
  overlayEl = refs?.overlayEl || null;
  listEl = refs?.listEl || null;
  emptyEl = refs?.emptyEl || null;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  if (!overlayEl || !listEl) {
    console.error("initVideo: overlayEl/listEl not provided");
    return;
  }

  showList();
}

export function activateVideo() {
  active = true;
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : [];
  currentIndex = 0;
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

  showList();
}