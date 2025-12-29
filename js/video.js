// js/video.js
//
// ЦЕЛЬ: карточки 16:9 + превью + стабильный запуск на Telegram iOS
// Архитектура: список карточек + ОДИН fullscreen video поверх (fixed).
// Важно: на iOS нельзя ждать fetch/blob ДО play (теряется user gesture).
// Поэтому: play() сразу по srcUrl, muted=true. Прогрев/cachedFetch — после старта.

import { cachedFetch } from "./cache/cachedFetch.js";

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];   // original urls
let cards = [];       // { wrap, url, srcUrl, preview }
let currentIndex = -1;

// Единственный fullscreen player
let playerWrap = null;
let playerVideo = null;
let playerLoading = null;

// ============================================================
// INIT
// ============================================================

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

  // чистим список
  listEl.innerHTML = "";
  cards = [];
  currentIndex = -1;

  ensurePlayer();
  showList();
}

// ============================================================
// HELPERS
// ============================================================

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

function modIndex(i) {
  if (!videoList || videoList.length === 0) return -1;
  return (i + videoList.length) % videoList.length;
}

function setLoading(on) {
  if (!playerLoading) return;
  playerLoading.style.display = on ? "flex" : "none";
}

function showList() {
  if (listEl) listEl.style.display = "block";
  if (playerWrap) playerWrap.style.display = "none";
}

function showPlayer() {
  if (listEl) listEl.style.display = "none";
  if (playerWrap) playerWrap.style.display = "flex";
}

// ============================================================
// FULLSCREEN PLAYER (fixed, center, 100%)
// ============================================================

function ensurePlayer() {
  if (playerWrap) return;

  // fullscreen fixed wrap (всегда по центру и на весь экран)
  playerWrap = document.createElement("div");
  playerWrap.id = "singleVideoPlayer";
  playerWrap.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: none;
    align-items: center;
    justify-content: center;
    background: #000;
    padding: 0;
    margin: 0;
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
  `;

  playerVideo = document.createElement("video");
  playerVideo.controls = true;
  playerVideo.preload = "metadata";
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.playsInline = true;

  // чтобы занимал весь экран и был по центру
  playerVideo.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
    display: block;
  `;

  // metadata hack как в эталоне
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch (e) {}
  });

  // loading overlay
  playerLoading = document.createElement("div");
  playerLoading.style.cssText = `
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    color: #fff;
    font: 600 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    background: rgba(0,0,0,0.35);
  `;
  playerLoading.textContent = "Загрузка…";

  // events -> viewer.js
  playerVideo.addEventListener("play", () => {
    setLoading(false);
    if (onPlayCb) onPlayCb();
  });

  // ВАЖНО: pause НЕ закрывает плеер (как ты хотел)
  playerVideo.addEventListener("pause", () => {
    if (onPauseCb) onPauseCb();
  });

  // если ошибка — покажем загрузку OFF и выведем в консоль причину
  playerVideo.addEventListener("error", () => {
    setLoading(false);
    const err = playerVideo.error;
    console.error("[video] player error:", err);
  });

  // buffering
  playerVideo.addEventListener("waiting", () => setLoading(true));
  playerVideo.addEventListener("playing", () => setLoading(false));
  playerVideo.addEventListener("canplay", () => setLoading(false));

  box.appendChild(playerVideo);
  box.appendChild(playerLoading);

  playerWrap.appendChild(box);

  // добавляем в body, а не в overlayEl — чтобы ТОЧНО быть fullscreen и не зависеть от layout viewer
  document.body.appendChild(playerWrap);
}

// ============================================================
// PREVIEW (карточки 16:9 + первый кадр)
// ============================================================

function createCard(url, index) {
  const srcUrl = withInitData(url);

  const wrap = document.createElement("div");
  wrap.className = "video-card";
  wrap.style.cssText = `
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    background: #111;
    margin: 10px 0;
  `;

  // preview video (без controls)
  const prev = document.createElement("video");
  prev.muted = true;
  prev.controls = false;
  prev.preload = "metadata";
  prev.setAttribute("playsinline", "");
  prev.setAttribute("webkit-playsinline", "");
  prev.playsInline = true;
  prev.src = srcUrl;
  prev.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
    background: #000;
  `;

  // заставляем показать первый кадр:
  // На iOS часто "loadedmetadata" не даёт кадра. Надо "loadeddata" или "canplay".
  const snapFirstFrame = () => {
    try {
      // трюк: сдвинуться на микросекунду
      prev.currentTime = 0.001;
      prev.pause();
    } catch (e) {}
    prev.removeEventListener("loadeddata", snapFirstFrame);
    prev.removeEventListener("canplay", snapFirstFrame);
  };
  prev.addEventListener("loadeddata", snapFirstFrame, { passive: true });
  prev.addEventListener("canplay", snapFirstFrame, { passive: true });

  // play icon overlay
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
      width: 56px; height: 56px;
      border-radius: 999px;
      background: rgba(0,0,0,0.45);
      display:flex; align-items:center; justify-content:center;
    ">
      <div style="
        width:0; height:0;
        border-top:10px solid transparent;
        border-bottom:10px solid transparent;
        border-left:16px solid #fff;
        margin-left: 4px;
      "></div>
    </div>
  `;

  wrap.appendChild(prev);
  wrap.appendChild(icon);

  wrap.addEventListener("click", () => {
    if (!active) return;
    playByIndex(index);
  });

  // лёгкий прогрев кеша (не мешает)
  warmCache(srcUrl);

  return { wrap, url, srcUrl, preview: prev };
}

function render() {
  if (!listEl) return;

  listEl.innerHTML = "";
  cards = [];
  currentIndex = -1;

  const has = Array.isArray(videoList) && videoList.length > 0;
  if (emptyEl) emptyEl.style.display = has ? "none" : "block";
  if (!has) return;

  videoList.forEach((url, idx) => {
    const card = createCard(url, idx);
    cards.push(card);
    listEl.appendChild(card.wrap);
  });
}

// ============================================================
// PLAYBACK (iOS-safe: play сразу, muted)
// ============================================================

function playByIndex(index) {
  if (!playerVideo) ensurePlayer();
  if (!videoList || videoList.length === 0) return;
  if (index < 0 || index >= videoList.length) return;

  currentIndex = index;

  const srcUrl =
    (cards[index] && cards[index].srcUrl) ? cards[index].srcUrl : withInitData(videoList[index]);

  showPlayer();

  // ВАЖНО ДЛЯ iOS: сначала muted=true, потом play() из gesture
  playerVideo.muted = true;
  playerVideo.src = srcUrl;
  playerVideo.load();

  setLoading(true);

  const p = playerVideo.play();

  // прогрев кеша после старта (не блокирует gesture)
  warmCache(srcUrl);

  if (p && typeof p.catch === "function") {
    p.catch((e) => {
      // если iOS отказал — покажем controls, пользователь может нажать play сам
      setLoading(false);
      console.warn("[video] play() rejected:", e);
    });
  }

  // снимаем mute ТОЛЬКО когда реально пошло playing
  const unmuteOnce = () => {
    playerVideo.removeEventListener("playing", unmuteOnce);
    playerVideo.muted = false;
  };
  playerVideo.addEventListener("playing", unmuteOnce);
}

// ВЫХОД в карточки — отдельная функция (позже повесим на кнопку)
function closePlayerToCards() {
  try {
    playerVideo.pause();
  } catch (e) {}

  playerVideo.removeAttribute("src");
  try {
    playerVideo.load();
  } catch (e) {}

  setLoading(false);
  showList();
}

// ============================================================
// PUBLIC API (viewer.js)
// ============================================================

export function activateVideo() {
  active = true;
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : (list ? [list] : []);
  render();
}

export function deactivateVideo() {
  active = false;

  // viewer.js тоже снимает, но дубль безопасен
  document.body.classList.remove("video-playing");

  // при выходе из вкладки — гасим плеер и возвращаем список
  if (playerWrap && playerWrap.style.display !== "none") {
    closePlayerToCards();
  }
}
