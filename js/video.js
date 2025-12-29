// js/video.js
//
// BASE: Variant B (iOS-safe autoplay attempt on direct URL)
// FIXES:
// 1) NO blob swap for playback (prevents full download caused by fetch->blob->objectURL)
// 2) Toolbar/UI callbacks fire ONLY on real play/pause (not on open), so UI won't disappear forever
// 3) Two modes: Cards (grid 16:9 preview) and Player (single fullscreen video)
// 4) Expose nav API for viewer-panel buttons: videoExitToCards / videoPrev / videoNext
//
// NOTE about previews:
// - Cards do NOT contain <video>. We render <canvas> preview.
// - Preview is generated via ONE hidden <video> (offscreen) -> draw first frame to canvas.
// - If CORS prevents drawing (tainted canvas), we keep placeholder.
//
// Streaming requirement:
// - true streaming depends on server Range support + mp4 fast-start.
// - this file ensures we DO NOT break streaming by swapping to blob.

import { cachedFetch } from "./cache/cachedFetch.js";

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let currentIndex = 0;

let cards = []; // { wrap, canvas, url, srcUrl }

let playerWrap = null;
let playerVideo = null;

let isOpen = false;

// ===== preview worker (single hidden video) =====
let previewVideo = null;
let previewBusy = false;
let previewQueue = [];

// =========================
// Utils
// =========================

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

// =========================
// Mode switch
// =========================

function showList() {
  isOpen = false;
  if (playerWrap) playerWrap.style.display = "none";
  if (listEl) listEl.style.display = "grid";
  setBodyPlaying(false);
  // viewer may show standard tabs in "cards mode"
  if (onPauseCb) onPauseCb();
}

function showPlayer() {
  isOpen = true;
  if (listEl) listEl.style.display = "none";
  if (playerWrap) playerWrap.style.display = "flex";
}

// =========================
// Player DOM
// =========================

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

  // timeline hack
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch {}
  });

  // IMPORTANT: UI callbacks tied to real media state
  playerVideo.addEventListener("play", () => {
    // during play -> hide panel (viewer) / show only native controls
    setBodyPlaying(true);
    if (onPlayCb) onPlayCb();

    // unmute after actual start
    Promise.resolve().then(() => {
      try { playerVideo.muted = false; } catch {}
    });
  });

  playerVideo.addEventListener("pause", () => {
    // paused -> show panel (viewer)
    setBodyPlaying(false);
    if (onPauseCb) onPauseCb();
  });

  playerVideo.addEventListener("ended", () => {
    setBodyPlaying(false);
    if (onPauseCb) onPauseCb();
  });

  playerVideo.addEventListener("error", () => {
    const err = playerVideo.error;
    console.error("[video] player error:", err);
    // show panel so user can exit
    setBodyPlaying(false);
    if (onPauseCb) onPauseCb();
  });

  playerWrap.appendChild(playerVideo);
  overlayEl.appendChild(playerWrap);
}

// =========================
// Playback (NO BLOB SWAP)
// =========================

function setSourceForIndex(idx) {
  if (!playerVideo) return;

  currentIndex = idx;

  const raw = videoList[currentIndex];
  const srcUrl = withInitData(raw);

  warmCache(srcUrl);

  // iOS gesture safe: start muted
  playerVideo.muted = true;

  // direct URL => streaming if server supports ranges
  playerVideo.src = srcUrl;
  playerVideo.load();

  const p = playerVideo.play();
  if (p && typeof p.catch === "function") {
    p.catch((e) => {
      // IMPORTANT: do NOT hide UI forever if autoplay rejected
      console.warn("[video] play() rejected:", e);
      setBodyPlaying(false);
      if (onPauseCb) onPauseCb(); // show panel so user can press native play
      // leave controls visible: controls already true
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

// =========================
// Preview generator (hidden video -> canvas)
// =========================

function ensurePreviewWorker() {
  if (previewVideo) return;

  previewVideo = document.createElement("video");
  previewVideo.muted = true;
  previewVideo.preload = "metadata";
  previewVideo.setAttribute("playsinline", "");
  previewVideo.setAttribute("webkit-playsinline", "");
  previewVideo.playsInline = true;

  // offscreen
  previewVideo.style.position = "fixed";
  previewVideo.style.left = "-99999px";
  previewVideo.style.top = "-99999px";
  previewVideo.style.width = "1px";
  previewVideo.style.height = "1px";
  previewVideo.style.opacity = "0";
  previewVideo.style.pointerEvents = "none";

  document.body.appendChild(previewVideo);
}

function enqueuePreview(card) {
  previewQueue.push(card);
  pumpPreviewQueue();
}

async function pumpPreviewQueue() {
  if (previewBusy) return;
  if (!previewQueue.length) return;

  ensurePreviewWorker();
  previewBusy = true;

  const card = previewQueue.shift();
  try {
    await renderPreviewToCanvas(card);
  } catch (e) {
    // ignore
  } finally {
    previewBusy = false;
    pumpPreviewQueue();
  }
}

function waitOnce(el, ev) {
  return new Promise((resolve) => {
    const fn = () => {
      el.removeEventListener(ev, fn);
      resolve();
    };
    el.addEventListener(ev, fn, { once: true, passive: true });
  });
}

async function renderPreviewToCanvas(card) {
  if (!previewVideo) return;
  if (!card || !card.canvas || !card.srcUrl) return;

  // if already painted (avoid repeats)
  if (card.__previewDone) return;
  card.__previewDone = true;

  previewVideo.src = card.srcUrl;
  previewVideo.load();

  // wait for data
  await Promise.race([
    waitOnce(previewVideo, "loadeddata"),
    waitOnce(previewVideo, "canplay"),
  ]);

  // seek tiny bit to force first frame
  try { previewVideo.currentTime = 0.001; } catch {}

  // give browser a tick
  await new Promise((r) => setTimeout(r, 30));

  const c = card.canvas;
  const ctx = c.getContext("2d");

  const vw = previewVideo.videoWidth || 1280;
  const vh = previewVideo.videoHeight || 720;

  // canvas size same ratio as card
  c.width = 1280;
  c.height = 720;

  // cover
  const scale = Math.max(c.width / vw, c.height / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (c.width - dw) / 2;
  const dy = (c.height - dh) / 2;

  try {
    ctx.drawImage(previewVideo, dx, dy, dw, dh);
  } catch (e) {
    // CORS taint or decode error -> keep placeholder
  }
}

// =========================
// Cards rendering (16:9 grid, no <video> inside)
// =========================

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

  const canvas = document.createElement("canvas");
  canvas.style.cssText = `
    width:100%;
    height:100%;
    display:block;
    background:#000;
  `;

  // play icon overlay
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

  wrap.appendChild(canvas);
  wrap.appendChild(icon);

  wrap.addEventListener("click", () => {
    if (!active) return;
    openVideoByIndex(idx);
  });

  const card = { wrap, canvas, url, srcUrl, __previewDone: false };

  // cache warm (doesn't affect playback)
  warmCache(srcUrl);

  // enqueue preview render
  // IMPORTANT: preview rendering may be blocked by CORS; then placeholder stays
  enqueuePreview(card);

  return card;
}

function render() {
  if (!listEl) return;

  listEl.innerHTML = "";
  cards = [];

  // grid of cards
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

// =========================
// Public API (viewer.js)
// =========================

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
  // leaving tab -> close player and show list
  closePlayerToCards();
}

// ===== NAV API for your custom panel (buttons near tabs) =====
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