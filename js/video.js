// js/video.js
//
// FINAL VERSION
// BASE: Variant B (WORKING STREAMING)
// MODIFIED: ONLY UI (NO VIDEO LOGIC CHANGES)

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

let isOpen = false;
let isPlaying = false;

let currentBlobUrl = null;
let loadingBlob = false;

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

function warmCache(url) {
  try {
    cachedFetch(url).catch(() => {});
  } catch {}
}

function revokeBlob() {
  if (currentBlobUrl) {
    try { URL.revokeObjectURL(currentBlobUrl); } catch {}
    currentBlobUrl = null;
  }
}

/* =========================
   Player logic (UNCHANGED)
   ========================= */

async function loadBlob(srcUrl) {
  if (!playerVideo || loadingBlob) return;
  loadingBlob = true;

  try {
    if (playerVideo.src.startsWith("blob:")) return;

    const resp = await fetch(srcUrl);
    const blob = await resp.blob();

    revokeBlob();
    currentBlobUrl = URL.createObjectURL(blob);

    const wasPaused = playerVideo.paused;
    const time = playerVideo.currentTime || 0;

    playerVideo.src = currentBlobUrl;
    playerVideo.load();

    playerVideo.addEventListener(
      "loadedmetadata",
      () => {
        try {
          playerVideo.currentTime = time;
        } catch {}
        if (!wasPaused) safePlay(true);
      },
      { once: true }
    );
  } catch {}
  finally {
    loadingBlob = false;
  }
}

function safePlay(muted = false) {
  if (!playerVideo) return;

  playerVideo.controls = false;
  if (muted) playerVideo.muted = true;

  const p = playerVideo.play();
  if (p?.catch) {
    p.catch(() => {
      playerVideo.controls = true;
      isPlaying = false;
      onPauseCb?.();
    });
  }
}

function safePause() {
  try { playerVideo.pause(); } catch {}
}

/* =========================
   Open / Close
   ========================= */

function openVideo(index) {
  if (!active) return;

  currentIndex = index;
  const srcUrl = withInitData(videoList[index]);

  listEl.style.display = "none";
  playerWrap.style.display = "flex";

  playerVideo.muted = true;
  playerVideo.src = srcUrl;
  playerVideo.load();

  warmCache(srcUrl);
  if (isIOS()) loadBlob(srcUrl);

  safePlay(true);

  isOpen = true;
  document.body.classList.add("video-playing");
  onPlayCb?.();
}

function closeToCards() {
  safePause();
  revokeBlob();

  playerVideo.removeAttribute("src");
  playerVideo.load();

  playerWrap.style.display = "none";
  listEl.style.display = "flex";

  isOpen = false;
  document.body.classList.remove("video-playing");
  onPauseCb?.();
}

/* =========================
   Player DOM
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

  playerVideo.preload = "metadata";
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");

  playerVideo.addEventListener("play", () => {
    isPlaying = true;
    playerVideo.controls = false;
    Promise.resolve().then(() => { playerVideo.muted = false; });
    onPlayCb?.();
  });

  playerVideo.addEventListener("pause", () => {
    isPlaying = false;
    playerVideo.controls = true;
    onPauseCb?.();
  });

  playerWrap.appendChild(playerVideo);
  overlayEl.appendChild(playerWrap);
}

/* =========================
   Cards
   ========================= */

function render() {
  listEl.innerHTML = "";

  if (!videoList.length) {
    emptyEl.style.display = "block";
    return;
  }

  emptyEl.style.display = "none";

  videoList.forEach((url, i) => {
    const card = document.createElement("div");
    card.className = "video-card";
    card.textContent = `Видео ${i + 1}`;
    card.addEventListener("click", () => openVideo(i));
    listEl.appendChild(card);
  });
}

/* =========================
   PUBLIC API
   ========================= */

export function initVideo(refs, callbacks = {}) {
  overlayEl = refs.overlayEl;
  listEl = refs.listEl;
  emptyEl = refs.emptyEl;

  onPlayCb = callbacks.onPlay;
  onPauseCb = callbacks.onPause;

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
  if (isOpen) closeToCards();
}