// js/video.js
//
// FINAL (Spec-compliant):
// - Cards mode: 16:9 grid, preview = first frame, NO <video> in cards (only <img>)
// - Player mode: single <video> in tab area, full size
// - Tabs hidden in player mode; in their place show Video Nav panel ONLY when paused:
//   [ ⬅ К карточкам ] [ ⏮ ] [ ⏭ ]
//
// iOS/TG stability:
// - DO NOT fetch/blob before play (gesture loss)
// - Set direct srcUrl, play() muted within the click handler
// - In parallel (iOS only) load blob and swap src to remove "struck play"
//
// NOTE: We keep cachedFetch warmup but do NOT change its logic.

import { cachedFetch } from "./cache/cachedFetch.js";

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let active = false;
let onPlayCb = null;   // viewer.js callback (can hide whole UI)
let onPauseCb = null;  // viewer.js callback

let videoList = [];
let currentIndex = 0;

// Cards state
let cards = []; // { wrap, img, url, srcUrl }

// Player state
let playerWrap = null;
let playerVideo = null;
let isPlayerOpen = false;

// Blob (iOS helper)
let currentBlobUrl = null;
let loadingBlob = false;

// Toolbar integration (replace tabs with our panel)
let toolbarEl = null;
let tabsToHide = [];
let videoNavEl = null;

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
  } catch (e) {
    return url;
  }
}

function warmCache(url) {
  try {
    cachedFetch(url).catch(() => {});
  } catch (e) {}
}

function revokeCurrentBlob() {
  if (currentBlobUrl) {
    try { URL.revokeObjectURL(currentBlobUrl); } catch (e) {}
    currentBlobUrl = null;
  }
}

function modIndex(i) {
  if (!videoList || videoList.length === 0) return 0;
  return (i + videoList.length) % videoList.length;
}

/* =========================
   Toolbar / Nav panel
   ========================= */

function ensureToolbar() {
  if (toolbarEl) return;

  // viewer.js sometimes sets it, but we also find it ourselves
  toolbarEl = document.querySelector(".viewer-toolbar") || null;
  if (!toolbarEl) return;

  // find tab buttons by text (robust enough for your UI)
  const btns = Array.from(toolbarEl.querySelectorAll("button, .btn, .tab, [role='button']"));
  const tabTexts = new Set(["3D", "3Д", "Построение", "Видео", "Video"]);
  tabsToHide = btns.filter((b) => {
    const t = (b.textContent || "").trim();
    return tabTexts.has(t);
  });

  // create nav panel (hidden by default)
  videoNavEl = document.createElement("div");
  videoNavEl.className = "video-nav-panel";
  videoNavEl.style.cssText = `
    display: none;
    width: 100%;
    gap: 10px;
    align-items: center;
    justify-content: center;
    padding: 6px 8px;
    box-sizing: border-box;
  `;

  const mkBtn = (label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = `
      appearance: none;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.92);
      border-radius: 999px;
      padding: 10px 14px;
      font: 600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    `;
    return b;
  };

  const btnBack = mkBtn("⬅ К карточкам");
  const btnPrev = mkBtn("⏮");
  const btnNext = mkBtn("⏭");

  btnBack.addEventListener("click", () => {
    closePlayerToCards();
  });
  btnPrev.addEventListener("click", () => {
    if (!isPlayerOpen) return;
    openByIndex(modIndex(currentIndex - 1), /*autoplay*/ false);
  });
  btnNext.addEventListener("click", () => {
    if (!isPlayerOpen) return;
    openByIndex(modIndex(currentIndex + 1), /*autoplay*/ false);
  });

  videoNavEl.appendChild(btnBack);
  videoNavEl.appendChild(btnPrev);
  videoNavEl.appendChild(btnNext);

  // Put panel into toolbar (same container as tabs)
  toolbarEl.appendChild(videoNavEl);
}

function setTabsVisible(visible) {
  ensureToolbar();
  if (!tabsToHide || !tabsToHide.length) return;
  tabsToHide.forEach((b) => {
    b.style.display = visible ? "" : "none";
  });
}

function setVideoNavVisible(visible) {
  ensureToolbar();
  if (!videoNavEl) return;
  videoNavEl.style.display = visible ? "flex" : "none";
}

/* =========================
   Player DOM
   ========================= */

function ensurePlayerDom() {
  if (!overlayEl) return;
  if (playerWrap) return;

  // IMPORTANT: we keep player INSIDE overlayEl so it occupies "tab area" like 3D/scheme
  // and respects your layout/safe area.
  playerWrap = document.createElement("div");
  playerWrap.className = "video-player-wrap";
  playerWrap.style.cssText = `
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    background: #000;
  `;

  playerVideo = document.createElement("video");
  playerVideo.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
    display: block;
  `;

  playerVideo.preload = "metadata";
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.playsInline = true;

  // native controls always ON (you wanted native buttons)
  playerVideo.controls = true;

  // metadata hack (as in your working file)
  playerVideo.addEventListener(
    "loadedmetadata",
    () => {
      try {
        playerVideo.currentTime = 0.001;
        playerVideo.currentTime = 0;
      } catch (e) {}
    },
    { passive: true }
  );

  // When playing: hide nav panel (and tabs are already hidden in player mode)
  playerVideo.addEventListener("play", () => {
    // hide panel while playing
    setVideoNavVisible(false);

    // If viewer.js hides UI via callback — ok.
    if (onPlayCb) onPlayCb();

    document.body.classList.add("video-playing");

    // Try unmute after start (iOS policy)
    Promise.resolve().then(() => {
      try { playerVideo.muted = false; } catch (e) {}
    });
  });

  // When paused: SHOW nav panel (spec), keep tabs hidden
  playerVideo.addEventListener("pause", () => {
    document.body.classList.remove("video-playing");

    // viewer.js onPauseCb обычно показывает UI.
    // Нам нужно: toolbar видим, но табы скрыты, и показываем наш nav.
    if (onPauseCb) onPauseCb();

    setTabsVisible(false);
    setVideoNavVisible(true);
  });

  // If errors: still allow user to exit via nav (pause usually happens)
  playerVideo.addEventListener("error", () => {
    // Force UI visible so user can press "К карточкам"
    if (onPauseCb) onPauseCb();
    setTabsVisible(false);
    setVideoNavVisible(true);

    console.error("[video] player error:", playerVideo.error);
  });

  playerWrap.appendChild(playerVideo);
  overlayEl.appendChild(playerWrap);
}

/* =========================
   iOS blob helper (from your working file)
   ========================= */

async function loadBlobForCurrent(srcUrl) {
  if (!playerVideo) return;
  if (!srcUrl) return;

  if (loadingBlob) return;
  loadingBlob = true;

  try {
    // if already blob: do nothing
    if (playerVideo.src && playerVideo.src.startsWith("blob:")) return;

    const resp = await fetch(srcUrl);
    const blob = await resp.blob();

    revokeCurrentBlob();
    const objUrl = URL.createObjectURL(blob);
    currentBlobUrl = objUrl;

    const wasPaused = playerVideo.paused;
    const wasTime = (() => {
      try { return playerVideo.currentTime || 0; } catch (e) { return 0; }
    })();

    playerVideo.src = objUrl;
    playerVideo.load();

    playerVideo.addEventListener(
      "loadedmetadata",
      () => {
        try {
          playerVideo.currentTime = 0.001;
          playerVideo.currentTime = 0;
        } catch (e) {}

        try {
          if (wasTime > 0.2) playerVideo.currentTime = wasTime;
        } catch (e) {}

        // If was playing — try continue (muted)
        if (!wasPaused) {
          const p = playerVideo.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
      },
      { once: true, passive: true }
    );
  } catch (e) {
    // ignore
  } finally {
    loadingBlob = false;
  }
}

/* =========================
   Open / Close Player
   ========================= */

function showCardsMode() {
  isPlayerOpen = false;

  if (playerWrap) playerWrap.style.display = "none";
  if (listEl) listEl.style.display = "grid";

  // restore tabs
  setVideoNavVisible(false);
  setTabsVisible(true);

  document.body.classList.remove("video-playing");

  // viewer.js: show UI
  if (onPauseCb) onPauseCb();
}

function showPlayerMode() {
  isPlayerOpen = true;

  if (listEl) listEl.style.display = "none";
  if (playerWrap) playerWrap.style.display = "flex";

  // tabs hidden in player mode always
  setTabsVisible(false);
  // nav panel visible only on pause; start hidden until pause
  setVideoNavVisible(false);
}

function openByIndex(idx, autoplay = true) {
  if (!active) return;
  if (!videoList || !videoList.length) return;

  ensurePlayerDom();
  ensureToolbar();

  idx = modIndex(idx);
  currentIndex = idx;

  const raw = videoList[currentIndex];
  const srcUrl = withInitData(raw);

  // warm cache (not affecting play)
  warmCache(srcUrl);

  showPlayerMode();

  // CRITICAL iOS: play must be called from user gesture, no awaits before it
  // We do: set src, muted, play()
  try {
    playerVideo.muted = true;
    playerVideo.src = srcUrl;
    playerVideo.load();
  } catch (e) {}

  // When opening:
  // - if autoplay requested: try play muted
  // - if not: pause (user will press native play), but show nav immediately
  if (autoplay) {
    const p = playerVideo.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        // autoplay rejected -> show nav (paused state), user can hit play native
        try { playerVideo.pause(); } catch (e) {}
        if (onPauseCb) onPauseCb();
        setTabsVisible(false);
        setVideoNavVisible(true);
      });
    }
  } else {
    try { playerVideo.pause(); } catch (e) {}
    if (onPauseCb) onPauseCb();
    setTabsVisible(false);
    setVideoNavVisible(true);
  }

  // iOS: load blob in parallel (do NOT await)
  if (isIOS()) {
    loadBlobForCurrent(srcUrl);
  }

  // viewer.js: hide UI while playing (it will re-show on pause)
  // We still call onPlayCb now to be consistent (it hides toolbar/status),
  // but pause-handler will bring toolbar back with our nav.
  if (onPlayCb) onPlayCb();
  document.body.classList.add("video-playing");
}

function closePlayerToCards() {
  // stop and cleanup
  if (playerVideo) {
    try { playerVideo.pause(); } catch (e) {}
    try {
      playerVideo.removeAttribute("src");
      playerVideo.load();
    } catch (e) {}
  }

  revokeCurrentBlob();
  loadingBlob = false;

  showCardsMode();
}

/* =========================
   Cards (16:9 grid) + preview extraction
   NO <video> in cards:
   - we create an offscreen video ONLY to grab first frame -> img src
   ========================= */

function styleCardsGrid() {
  if (!listEl) return;

  // Grid 2 columns on wide, 1 on narrow
  listEl.style.display = "grid";
  listEl.style.gridTemplateColumns = "repeat(1, minmax(0, 1fr))";
  listEl.style.gap = "12px";
  listEl.style.padding = "12px";
  listEl.style.boxSizing = "border-box";
  listEl.style.overflowY = "auto";
  listEl.style.webkitOverflowScrolling = "touch";

  // Use media query-like behavior via JS resize
  const applyCols = () => {
    const w = listEl.clientWidth || window.innerWidth || 0;
    if (w >= 680) listEl.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    else listEl.style.gridTemplateColumns = "repeat(1, minmax(0, 1fr))";
  };
  applyCols();
  window.addEventListener("resize", applyCols, { passive: true });
}

function extractFirstFrameToImg(srcUrl, imgEl) {
  // Offscreen video: not in cards, not visible
  // NOTE: if server blocks CORS, canvas may be tainted -> we just fail silently.
  const v = document.createElement("video");
  v.preload = "metadata";
  v.muted = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.playsInline = true;

  // Try to enable canvas extraction when possible
  // If same-origin, ok. If not, may fail — that's fine.
  v.crossOrigin = "anonymous";

  v.src = srcUrl;

  const cleanup = () => {
    try { v.pause(); } catch (e) {}
    v.removeAttribute("src");
    try { v.load(); } catch (e) {}
  };

  const snap = () => {
    try {
      const w = v.videoWidth || 0;
      const h = v.videoHeight || 0;
      if (!w || !h) {
        cleanup();
        return;
      }

      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(v, 0, 0, w, h);

      const dataUrl = c.toDataURL("image/jpeg", 0.82);
      if (dataUrl && dataUrl.startsWith("data:image/")) {
        imgEl.src = dataUrl;
      }
    } catch (e) {
      // ignore
    } finally {
      cleanup();
    }
  };

  // On some iOS, need loadeddata/canplay + small seek
  v.addEventListener(
    "loadeddata",
    () => {
      try {
        v.currentTime = 0.05;
      } catch (e) {}
      // give a tick for frame
      setTimeout(snap, 60);
    },
    { once: true, passive: true }
  );

  v.addEventListener(
    "error",
    () => {
      cleanup();
    },
    { once: true, passive: true }
  );
}

function createCard(url, idx) {
  const srcUrl = withInitData(url);

  const wrap = document.createElement("div");
  wrap.className = "video-card";
  wrap.style.cssText = `
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 14px;
    overflow: hidden;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    cursor: pointer;
    user-select: none;
  `;

  // Preview image (NOT video)
  const img = document.createElement("img");
  img.alt = `Видео ${idx + 1}`;
  img.decoding = "async";
  img.loading = "lazy";
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #000;
  `;

  // Fallback placeholder (black)
  img.src = "";

  // Play overlay
  const icon = document.createElement("div");
  icon.style.cssText = `
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  `;
  icon.innerHTML = `
    <div style="
      width: 62px; height: 62px;
      border-radius: 999px;
      background: rgba(0,0,0,0.45);
      display:flex; align-items:center; justify-content:center;
      border: 1px solid rgba(255,255,255,0.12);
      backdrop-filter: blur(2px);
    ">
      <div style="
        width:0; height:0;
        border-top:11px solid transparent;
        border-bottom:11px solid transparent;
        border-left:18px solid #fff;
        margin-left: 4px;
      "></div>
    </div>
  `;

  wrap.appendChild(img);
  wrap.appendChild(icon);

  // Click -> open player and autoplay (gesture-safe)
  wrap.addEventListener("click", () => {
    if (!active) return;
    openByIndex(idx, /*autoplay*/ true);
  });

  // Warm cache (ok)
  warmCache(srcUrl);

  // Extract preview in background
  extractFirstFrameToImg(srcUrl, img);

  return { wrap, img, url, srcUrl };
}

function render() {
  if (!listEl) return;

  listEl.innerHTML = "";
  cards = [];
  currentIndex = 0;

  styleCardsGrid();

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

  ensureToolbar();
  ensurePlayerDom();

  // start in cards mode
  showCardsMode();
}

export function activateVideo() {
  active = true;
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : (list ? [list] : []);
  currentIndex = 0;
  render();

  // If no videos, ensure player closed
  if (!videoList.length) {
    closePlayerToCards();
  }
}

export function deactivateVideo() {
  active = false;

  // Leaving video tab => close player to cards (spec)
  if (isPlayerOpen) {
    closePlayerToCards();
  }

  // Safety cleanup
  document.body.classList.remove("video-playing");
  revokeCurrentBlob();

  if (playerVideo) {
    try {
      playerVideo.pause();
      playerVideo.removeAttribute("src");
      playerVideo.load();
    } catch (e) {}
  }

  // restore tabs if user left tab
  setVideoNavVisible(false);
  setTabsVisible(true);
}