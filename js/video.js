// js/video.js
//
// FINAL BASE (Variant B -> your spec)
//
// SPEC:
// 1) Mode A: Cards grid 16:9, NO <video> inside cards, scroll works, standard tabs visible.
// 2) Mode B: Player mode: cards hidden, ONE <video> fills the whole videoOverlay.
//    - tabs hidden by viewer.js when playing (onPlayCb) and shown when paused (onPauseCb)
//    - IMPORTANT: pause DOES NOT exit to cards
// 3) Streaming: we NEVER switch playback src to blob (blob causes full download).
// 4) iOS/TG safety:
//    - on open we try play() muted (gesture).
//    - if play() rejected -> we DO NOT keep UI hidden; we call onPauseCb so user can press native play.
//
// Exposed API for your future panel buttons:
//   videoExitToCards(), videoPrev(), videoNext(), videoIsOpen()

import { cachedFetch } from "./cache/cachedFetch.js";

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let currentIndex = 0;

let cards = []; // { wrap, url, srcUrl }

let playerWrap = null;
let playerVideo = null;

let isOpen = false;

/* =========================
   Utils
   ========================= */

function withInitData(url) {
  try {
    if (!window.TG_INIT_DATA) return url;
    const u = new URL(url);
    if (!u.searchParams.get("initData")) u.searchParams.set("initData", window.TG_INIT_DATA);
    return u.toString();
  } catch {
    return url;
  }
}

function warmCache(url) {
  try { cachedFetch(url).catch(() => {}); } catch {}
}

function safePause() {
  if (!playerVideo) return;
  try { playerVideo.pause(); } catch {}
}

function setBodyPlaying(on) {
  document.body.classList.toggle("video-playing", !!on);
}

/* =========================
   Modes
   ========================= */

function showList() {
  isOpen = false;

  if (playerWrap) playerWrap.style.display = "none";
  if (listEl) listEl.style.display = "grid";

  setBodyPlaying(false);
  if (onPauseCb) onPauseCb();
}

function showPlayer() {
  isOpen = true;

  if (listEl) listEl.style.display = "none";
  if (playerWrap) playerWrap.style.display = "flex";
}

/* =========================
   Player DOM
   ========================= */

function ensurePlayerDom() {
  if (!overlayEl) return;
  if (playerWrap) return;

  playerWrap = document.createElement("div");
  playerWrap.className = "video-player-wrap";
  playerWrap.style.cssText = `
    position:absolute;
    inset:0;
    display:none;
    align-items:center;
    justify-content:center;
    background:#000;
    overflow:hidden;
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
    display:block;
  `;

  // Timeline hack
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch {}
  });

  // IMPORTANT: callbacks only on real play/pause
  playerVideo.addEventListener("play", () => {
    setBodyPlaying(true);
    if (onPlayCb) onPlayCb();

    // unmute after actual start
    Promise.resolve().then(() => {
      try { playerVideo.muted = false; } catch {}
    });
  });

  playerVideo.addEventListener("pause", () => {
    setBodyPlaying(false);
    if (onPauseCb) onPauseCb();
  });

  playerVideo.addEventListener("ended", () => {
    setBodyPlaying(false);
    if (onPauseCb) onPauseCb();
  });

  playerVideo.addEventListener("error", () => {
    const err = playerVideo.error;
    console.error("[video] error:", err);
    // show UI so user can exit / retry
    setBodyPlaying(false);
    if (onPauseCb) onPauseCb();
  });

  playerWrap.appendChild(playerVideo);
  overlayEl.appendChild(playerWrap);
}

/* =========================
   Playback (STREAMING, NO BLOB)
   ========================= */

function setSourceForIndex(idx) {
  if (!playerVideo) return;

  currentIndex = idx;

  const raw = videoList[currentIndex];
  const srcUrl = withInitData(raw);

  // warm cache in background (should not affect streaming)
  warmCache(srcUrl);

  // iOS/TG: start muted so gesture autoplay has a chance
  playerVideo.muted = true;

  playerVideo.src = srcUrl;
  playerVideo.load();

  const p = playerVideo.play();
  if (p && typeof p.catch === "function") {
    p.catch((e) => {
      // autoplay rejected -> keep controls, show UI panel
      console.warn("[video] play() rejected:", e);
      setBodyPlaying(false);
      if (onPauseCb) onPauseCb();
      // user can press native play
    });
  }
}

function openVideoByIndex(idx) {
  if (!active) return;
  if (!videoList || !videoList.length) return;

  if (idx < 0) idx = videoList.length - 1;
  if (idx >= videoList.length) idx = 0;

  ensurePlayerDom();
  showPlayer();
  setSourceForIndex(idx);
}

function closePlayerToCards() {
  safePause();

  if (playerVideo) {
    try {
      playerVideo.removeAttribute("src");
      playerVideo.load();
    } catch {}
  }

  showList();
}

/* =========================
   Cards (NO <video> inside)
   ========================= */

function createCard(url, idx) {
  const srcUrl = withInitData(url);

  const wrap = document.createElement("div");
  wrap.className = "video-card";
  wrap.style.cssText = `
    width:100%;
    aspect-ratio:16/9;
    border-radius:12px;
    overflow:hidden;
    position:relative;
    background:#111;
    cursor:pointer;
  `;

  // placeholder background (since no <video> in cards)
  const bg = document.createElement("div");
  bg.style.cssText = `
    position:absolute;
    inset:0;
    background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
  `;

  const label = document.createElement("div");
  label.textContent = `Видео ${idx + 1}`;
  label.style.cssText = `
    position:absolute;
    left:10px; bottom:10px;
    padding:6px 10px;
    border-radius:10px;
    background: rgba(0,0,0,0.35);
    color: rgba(255,255,255,0.9);
    font: 600 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
  `;

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
      width:56px;height:56px;border-radius:999px;
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

  wrap.appendChild(bg);
  wrap.appendChild(icon);
  wrap.appendChild(label);

  wrap.addEventListener("click", () => {
    if (!active) return;
    openVideoByIndex(idx);
  });

  // warm cache (does not block UI)
  warmCache(srcUrl);

  return { wrap, url, srcUrl };
}

function render() {
  if (!listEl) return;

  listEl.innerHTML = "";
  cards = [];

  listEl.style.display = "grid";
  listEl.style.gridTemplateColumns = "repeat(auto-fill, minmax(220px, 1fr))";
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
    listEl.appendChild(card.wrap);
  });
}

/* =========================
   Public API
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

  ensurePlayerDom();
  showList();
}

export function activateVideo() {
  active = true;
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : (list ? [list] : []);
  currentIndex = 0;
  render();
}

export function deactivateVideo() {
  active = false;
  // leaving tab -> close player
  closePlayerToCards();
  setBodyPlaying(false);
}

// Buttons for your future panel
export function videoExitToCards() {
  closePlayerToCards();
}

export function videoPrev() {
  if (!videoList.length) return;
  openVideoByIndex(currentIndex - 1);
}

export function videoNext() {
  if (!videoList.length) return;
  openVideoByIndex(currentIndex + 1);
}

export function videoIsOpen() {
  return !!isOpen;
}