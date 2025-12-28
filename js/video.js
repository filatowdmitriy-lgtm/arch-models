// js/video.js
//
// FINAL (stable + mobile-safe)
//
// UX:
// - список карточек (listEl)
// - один общий video (playerVideo) внутри overlayEl
// - click card -> стартуем play (user gesture), и ТОЛЬКО ПОСЛЕ "playing" скрываем список
// - pause НЕ возвращает в список (плеер остаётся)
// - return в список: выход из fullscreen / ended / deactivateVideo
//
// Важно для Telegram iOS:
// - НЕЛЬЗЯ делать await fetch(blob) до play()
// - НЕЛЬЗЯ скрывать UI до фактического старта, иначе получаешь "полсекунды плеер -> чёрный экран"

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

let listDisplayDefault = ""; // что вернуть после hide
let playerDisplayDefault = "block";

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

  // запомним как список отображается по умолчанию (flex / block / etc)
  try {
    listDisplayDefault = window.getComputedStyle(listEl).display || "";
  } catch (e) {
    listDisplayDefault = "";
  }

  // очистим список
  listEl.innerHTML = "";
  cards = [];
  activeCard = null;

  // пересоздадим общий плеер (чтобы не тащить старые слушатели)
  if (playerVideo && playerVideo.parentNode) {
    try { playerVideo.pause(); } catch (e) {}
    try { playerVideo.removeAttribute("src"); playerVideo.load(); } catch (e) {}
    playerVideo.parentNode.removeChild(playerVideo);
  }

  playerVideo = document.createElement("video");
  playerVideo.controls = true;
  playerVideo.preload = "metadata";
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.playsInline = true;

  // iOS/TG: начинаем muted, снимаем mute после старта
  playerVideo.muted = true;

  // таймлайн hack
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch (e) {}
  });

  // overlay как контейнер
  try {
    const cs = window.getComputedStyle(overlayEl);
    if (cs.position === "static") overlayEl.style.position = "relative";
  } catch (e) {}

  // плеер покрывает весь overlay
  playerVideo.style.position = "absolute";
  playerVideo.style.inset = "0";
  playerVideo.style.width = "100%";
  playerVideo.style.height = "100%";
  playerVideo.style.background = "#000";
  playerVideo.style.zIndex = "10";
  playerVideo.style.display = "none"; // покажем только после 'playing'

  overlayEl.appendChild(playerVideo);

  // Когда видео реально ПОШЛО — только тогда скрываем список
  playerVideo.addEventListener("playing", () => {
    showPlayerHideList();

    // снимаем mute после фактического старта
    try { playerVideo.muted = false; } catch (e) {}

    if (onPlayCb) onPlayCb();
  });

  // Пауза НЕ возвращает в список (это твоя главная жалоба на ПК)
  // Возврат делаем только при выходе из fullscreen/ended/deactivate.

  playerVideo.addEventListener("ended", () => {
    hidePlayerReturnList();
    if (onPauseCb) onPauseCb();
  });

  // iOS Safari / Telegram iOS: событие выхода из fullscreen
  playerVideo.addEventListener("webkitendfullscreen", () => {
    hidePlayerReturnList();
    if (onPauseCb) onPauseCb();
  });

  // обычный fullscreen api (Android / desktop)
  document.addEventListener("fullscreenchange", () => {
    // если вышли из fullscreen — вернём список
    if (!document.fullscreenElement && isShowingPlayer) {
      // не трогаем если видео продолжает быть на экране как inline — но в нашем UX возвращаем список
      hidePlayerReturnList();
      if (onPauseCb) onPauseCb();
    }
  });

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

  // скрываем список
  listEl.style.display = "none";

  // показываем плеер
  playerVideo.style.display = playerDisplayDefault;
  isShowingPlayer = true;
}

function hidePlayerReturnList(skipScrollRestore = false) {
  if (!listEl || !playerVideo) return;

  // скрываем плеер
  playerVideo.style.display = "none";
  isShowingPlayer = false;

  // возвращаем список
  listEl.style.display = listDisplayDefault || "";

  if (!skipScrollRestore) {
    const st = savedScrollTop;
    setTimeout(() => {
      try { listEl.scrollTop = st; } catch (e) {}
    }, 0);
  }

  // снимаем active у карточек
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

  // лёгкая видимость карточек (не превью, но хотя бы кликабельно)
  wrap.style.width = "100%";
  wrap.style.aspectRatio = "16 / 9";
  wrap.style.borderRadius = "12px";
  wrap.style.overflow = "hidden";
  wrap.style.background = "rgba(255,255,255,0.06)";
  wrap.style.border = "1px solid rgba(255,255,255,0.08)";
  wrap.style.marginBottom = "12px";

  const srcUrl = withInitData(url);
  const cardObj = { wrap, url, srcUrl };

  wrap.addEventListener("click", () => {
    if (!active) return;
    playFromCard(cardObj);
  });

  return cardObj;
}

function playFromCard(cardObj) {
  if (!playerVideo) return;

  setActiveCard(cardObj);

  const srcUrl = cardObj.srcUrl;

  // КЛЮЧЕВО: НЕ скрываем список сразу.
  // Скрываем только на событии "playing".
  // Поэтому если play() сорвётся — UI не уйдёт в чёрный экран.

  try {
    // iOS safe: сначала muted=true
    playerVideo.muted = true;

    // ставим URL
    playerVideo.src = srcUrl;

    // ВАЖНО: не вызываем load() перед play() (иногда ломает user gesture в webview)
    const p = playerVideo.play();

    // кэш прогреваем параллельно
    warmCache(srcUrl);

    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        console.warn("playerVideo.play() rejected:", err);

        // если не стартануло — убеждаемся что плеер скрыт, а список на месте
        try { playerVideo.pause(); } catch (e) {}
        try { playerVideo.removeAttribute("src"); playerVideo.load(); } catch (e) {}
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

  document.body.classList.remove("video-playing");

  if (playerVideo) {
    try { playerVideo.pause(); } catch (e) {}
    try { playerVideo.removeAttribute("src"); playerVideo.load(); } catch (e) {}
  }

  hidePlayerReturnList();
}
