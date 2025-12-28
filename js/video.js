// js/video.js
//
// FINAL STABLE VERSION (deadline-safe)
//
// Архитектура:
// - список карточек (listEl)
// - один общий video-плеер (playerVideo) внутри overlayEl
// - click по карточке -> показываем playerVideo, скрываем listEl
// - pause/ended -> скрываем playerVideo, возвращаем listEl + scrollTop
//
// Важно для iOS/Telegram:
// - НЕЛЬЗЯ делать await fetch(blob) перед play() — теряется user gesture, и кнопка play становится “зачёркнутой”.
// - Поэтому стартуем с обычного URL (быстро + работает в iOS), а cachedFetch прогревает IDB кэш параллельно.

import { cachedFetch } from "./cache/cachedFetch.js";

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let cards = []; // { wrap, url, srcUrl }
let activeCard = null;
let savedScrollTop = 0;

let playerVideo = null;
let isShowingPlayer = false;

function isIOS() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
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

  // очистка списка
  listEl.innerHTML = "";
  cards = [];
  activeCard = null;

  // создаём ОДИН общий video-плеер
  if (playerVideo && playerVideo.parentNode) {
    try {
      playerVideo.pause();
    } catch (e) {}
    playerVideo.parentNode.removeChild(playerVideo);
  }

  playerVideo = document.createElement("video");
  playerVideo.controls = true;
  playerVideo.preload = "metadata";
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.playsInline = true;

  // iOS safe default (потом снимем mute после старта)
  playerVideo.muted = true;

  // важный hack для таймлайна в TG
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch (e) {}
  });

  // overlay должен быть контейнером
  // (не ломаем твою верстку — просто подстрахуемся)
  try {
    const cs = window.getComputedStyle(overlayEl);
    if (cs.position === "static") overlayEl.style.position = "relative";
  } catch (e) {}

  // стиль плеера: перекрывает весь overlay
  playerVideo.style.position = "absolute";
  playerVideo.style.inset = "0";
  playerVideo.style.width = "100%";
  playerVideo.style.height = "100%";
  playerVideo.style.background = "#000";
  playerVideo.style.display = "none";
  playerVideo.style.zIndex = "5";

  overlayEl.appendChild(playerVideo);

  // play -> наружу
  playerVideo.addEventListener("play", () => {
    // снимаем mute ПОСЛЕ того, как старт пошёл
    // (на iOS это работает лучше, чем unmute до play)
    try {
      playerVideo.muted = false;
    } catch (e) {}

    if (onPlayCb) onPlayCb();
  });

  // pause/ended -> вернуть список
  const onStop = () => {
    hidePlayerReturnList();
    if (onPauseCb) onPauseCb();
  };

  playerVideo.addEventListener("pause", onStop);
  playerVideo.addEventListener("ended", onStop);

  // стартовое состояние
  hidePlayerReturnList(true);
}

// ============================================================
// UI show/hide
// ============================================================

function showPlayerHideList() {
  if (!listEl || !playerVideo) return;

  if (!isShowingPlayer) {
    savedScrollTop = listEl.scrollTop || 0;
  }

  listEl.style.display = "none";
  playerVideo.style.display = "block";
  isShowingPlayer = true;
}

function hidePlayerReturnList(skipScrollRestore = false) {
  if (!listEl || !playerVideo) return;

  playerVideo.style.display = "none";
  listEl.style.display = "";
  isShowingPlayer = false;

  if (!skipScrollRestore) {
    const st = savedScrollTop;
    setTimeout(() => {
      try {
        listEl.scrollTop = st;
      } catch (e) {}
    }, 0);
  }

  // снять active у карточки
  if (activeCard?.wrap) activeCard.wrap.classList.remove("active");
  activeCard = null;
}

// ============================================================
// Cards
// ============================================================

function setActiveCard(cardObj) {
  cards.forEach((c) => c.wrap.classList.remove("active"));
  cardObj.wrap.classList.add("active");
  activeCard = cardObj;
}

function createCard(url) {
  const wrap = document.createElement("div");
  wrap.className = "video-card";

  // базовый стиль, чтобы карточки точно были “видны” и кликабельны
  wrap.style.width = "100%";
  wrap.style.aspectRatio = "16 / 9";
  wrap.style.borderRadius = "12px";
  wrap.style.overflow = "hidden";
  wrap.style.background = "rgba(255,255,255,0.06)";
  wrap.style.border = "1px solid rgba(255,255,255,0.08)";
  wrap.style.marginBottom = "12px";

  const srcUrl = withInitData(url);

  const cardObj = { wrap, url, srcUrl };

  // клик по карточке = запуск общего плеера
  wrap.addEventListener("click", () => {
    if (!active) return;
    playFromCard(cardObj);
  });

  return cardObj;
}

async function playFromCard(cardObj) {
  if (!playerVideo) return;

  setActiveCard(cardObj);
  showPlayerHideList();

  const srcUrl = cardObj.srcUrl;

  // iOS/Telegram: play должен быть синхронно после user gesture.
  // Поэтому НЕ делаем await fetch(blob) тут.
  try {
    playerVideo.muted = true; // iOS safe
  } catch (e) {}

  try {
    // ставим обычный URL и запускаем
    playerVideo.src = srcUrl;
    playerVideo.load();

    const p = playerVideo.play();

    // параллельно греем кэш (не блокирует)
    warmCache(srcUrl);

    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        console.warn("playerVideo.play() rejected:", err);
        // если не смогли стартануть — вернём список, чтобы UI не “завис”
        hidePlayerReturnList();
      });
    }
  } catch (e) {
    console.error("playFromCard failed:", e);
    hidePlayerReturnList();
  }
}

// ============================================================
// Render list
// ============================================================

function render() {
  if (!listEl) return;

  listEl.innerHTML = "";
  cards = [];
  activeCard = null;

  const has = Array.isArray(videoList) && videoList.length > 0;
  if (emptyEl) emptyEl.style.display = has ? "none" : "block";
  if (!has) return;

  videoList.forEach((url) => {
    const card = createCard(url);
    cards.push(card);
    listEl.appendChild(card.wrap);
  });
}

// ============================================================
// Public API
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

  // убрать fullscreen класс на всякий случай (viewer.js тоже делает)
  document.body.classList.remove("video-playing");

  // остановить плеер и вернуть список
  if (playerVideo) {
    try {
      playerVideo.pause();
    } catch (e) {}
    try {
      playerVideo.removeAttribute("src");
      playerVideo.load();
    } catch (e) {}
  }

  hidePlayerReturnList();
}
