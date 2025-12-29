// js/video.js
//
// VARIANT B (Gallery -> Fullscreen Player)
//
// UX:
// - список карточек (без inline-видео)
// - тап по карточке -> fullscreen player, autoplay (если возможно)
// - тап по видео: playing -> pause, paused -> play
// - native controls показываем ТОЛЬКО когда paused
// - swipe down (когда paused) -> выйти в список
// - swipe left/right (когда paused) -> prev/next
// - Esc (ПК) -> выйти в список
//
// iOS/TG:
// - пытаемся autoplay muted (gesture) на прямом URL
// - параллельно подгружаем blob (если iOS) чтобы убрать "зачеркнутый play"
// - если autoplay не смог, пользователь тапает play на паузе (controls видны) — и играет

import { cachedFetch } from "./cache/cachedFetch.js";

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
let playerTitle = null;

let isOpen = false;
let isPlaying = false;

let currentBlobUrl = null; // только для текущего видео (objectURL)
let loadingBlob = false;

// swipe state
let swipeStartX = 0;
let swipeStartY = 0;

/* =========================
   Utils
   ========================= */

function isIOS() {
  const ua = navigator.userAgent || "";
  // iPhone/iPad/iPod + iPadOS (MacIntel with touch)
  const iOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS;
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

function setControlsVisible(visible) {
  if (!playerVideo) return;
  playerVideo.controls = !!visible;
}

function setTitle() {
  if (!playerTitle) return;
  const n = videoList?.length ? (currentIndex + 1) : 0;
  playerTitle.textContent = videoList?.length ? `Видео ${n}` : "";
}

function showList() {
  if (!overlayEl || !listEl) return;

  isOpen = false;
  isPlaying = false;

  // Плеер скрываем
  if (playerWrap) playerWrap.style.display = "none";
  // Список показываем
  listEl.style.display = "flex";

  // на всякий
  setControlsVisible(false);

  // важное: не оставляем playing-класс
  document.body.classList.remove("video-playing");

  // viewer.js пусть показывает UI
  if (onPauseCb) onPauseCb();
}

function showPlayer() {
  if (!overlayEl || !listEl || !playerWrap) return;

  isOpen = true;

  // список прячем
  listEl.style.display = "none";
  // плеер показываем
  playerWrap.style.display = "flex";
}

/* =========================
   Blob loader (iOS helper)
   ========================= */

async function loadBlobForCurrent(srcUrl) {
  if (!playerVideo) return;
  if (!srcUrl) return;

  // не грузим повторно
  if (loadingBlob) return;
  loadingBlob = true;

  try {
    // если уже blob стоит — не трогаем
    if (playerVideo.src && playerVideo.src.startsWith("blob:")) return;

    const resp = await fetch(srcUrl);
    const blob = await resp.blob();

    revokeCurrentBlob();
    const objUrl = URL.createObjectURL(blob);
    currentBlobUrl = objUrl;

    // ВАЖНО: ставим blob только если мы всё ещё на этом видео
    // (srcUrl совпадает с текущим планом)
    // Переустановку делаем аккуратно:
    const wasPaused = playerVideo.paused;
    const wasTime = (() => {
      try { return playerVideo.currentTime || 0; } catch (e) { return 0; }
    })();

    playerVideo.src = objUrl;
    playerVideo.load();

    // восстановим позицию после load (если получится)
    playerVideo.addEventListener(
      "loadedmetadata",
      () => {
        try {
          // таймлайн хак (как эталон)
          playerVideo.currentTime = 0.001;
          playerVideo.currentTime = 0;
        } catch (e) {}

        try {
          if (wasTime > 0.2) playerVideo.currentTime = wasTime;
        } catch (e) {}

        // если до этого видео играло — попробуем продолжить
        if (!wasPaused) {
          safePlay(true);
        }
      },
      { once: true, passive: true }
    );
  } catch (e) {
    // игнор — останется прямой srcUrl
    // console.warn("blob load failed", e);
  } finally {
    loadingBlob = false;
  }
}

/* =========================
   Playback controls
   ========================= */

function safePlay(forceMuted = false) {
  if (!playerVideo) return;

  // controls скрываем во время play
  setControlsVisible(false);

  // iOS-friendly: стартуем muted
  if (forceMuted) playerVideo.muted = true;

  const p = playerVideo.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {
      // если play() отклонён (iOS/Telegram), просто оставляем на паузе с controls=true
      isPlaying = false;
      setControlsVisible(true);
      if (onPauseCb) onPauseCb();
    });
  }
}

function safePause() {
  if (!playerVideo) return;
  try { playerVideo.pause(); } catch (e) {}
}

/* =========================
   Open / close / switch
   ========================= */

function setSourceForIndex(idx) {
  if (!playerVideo) return;

  revokeCurrentBlob();
  loadingBlob = false;

  currentIndex = idx;

  const raw = videoList[currentIndex];
  const srcUrl = withInitData(raw);

  // прогрев кэша (не влияет на play)
  warmCache(srcUrl);

  // ставим прямой URL сразу (быстро)
  playerVideo.src = srcUrl;
  playerVideo.load();

  // таймлайн hack (как эталон)
  // (на каждом новом видео — один раз)
  // NOTE: onloadedmetadata ниже уже есть, но сделаем подстраховку:
  // будет один раз на новое видео
  setTitle();

  // на старте показываем плеер, но controls прячем (мы управляем сами)
  setControlsVisible(false);

  // iOS: параллельно грузим blob, чтобы убрать "зачеркнутую кнопку"
  if (isIOS()) {
    // не await — чтобы не ломать gesture
    loadBlobForCurrent(srcUrl);
  }

  // autoplay попытка (muted)
  safePlay(true);
}

function openVideoByIndex(idx) {
  if (!active) return;
  if (!videoList || !videoList.length) return;

  if (idx < 0) idx = videoList.length - 1;
  if (idx >= videoList.length) idx = 0;

  showPlayer();
  setSourceForIndex(idx);

  // viewer.js: скрыть UI и поставить video-playing
  if (onPlayCb) onPlayCb();
  document.body.classList.add("video-playing");
}

function closePlayerToList() {
  // остановить
  safePause();

  // очистить src чтобы не продолжало грузить
  if (playerVideo) {
    try {
      playerVideo.removeAttribute("src");
      playerVideo.load();
    } catch (e) {}
  }

  revokeCurrentBlob();

  showList();
}

/* =========================
   Player DOM & handlers
   ========================= */

function ensurePlayerDom() {
  if (!overlayEl) return;
  if (playerWrap) return;

  playerWrap = document.createElement("div");
  playerWrap.className = "video-player-wrap";
  playerWrap.style.position = "absolute";
  playerWrap.style.inset = "0";
  playerWrap.style.display = "none";
  playerWrap.style.flexDirection = "column";
  playerWrap.style.alignItems = "center";
  playerWrap.style.justifyContent = "center";
  playerWrap.style.background = "#000";

  // заголовок (минимальный, без крестиков)
  playerTitle = document.createElement("div");
  playerTitle.style.position = "absolute";
  playerTitle.style.top = "12px";
  playerTitle.style.left = "12px";
  playerTitle.style.right = "12px";
  playerTitle.style.textAlign = "center";
  playerTitle.style.color = "rgba(255,255,255,0.75)";
  playerTitle.style.fontSize = "14px";
  playerTitle.style.pointerEvents = "none"; // чтобы тап не ломал
  playerWrap.appendChild(playerTitle);

  playerVideo = document.createElement("video");
  playerVideo.style.width = "100%";
  playerVideo.style.height = "100%";
  playerVideo.style.objectFit = "contain";
  playerVideo.style.background = "#000";

  playerVideo.preload = "metadata";
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.playsInline = true;

  // По умолчанию controls скрыты — показываем только на паузе
  playerVideo.controls = false;

  // таймлайн hack как в эталоне
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

  playerVideo.addEventListener("play", () => {
    isPlaying = true;

    // controls убираем всегда на play
    setControlsVisible(false);

    // если стартовали muted — снимаем mute после старта
    // (не всегда можно сразу, поэтому через microtask)
    Promise.resolve().then(() => {
      try { playerVideo.muted = false; } catch (e) {}
    });

    if (onPlayCb) onPlayCb();
    document.body.classList.add("video-playing");
  });

  playerVideo.addEventListener("pause", () => {
    isPlaying = false;

    // controls показываем ТОЛЬКО на паузе
    setControlsVisible(true);

    if (onPauseCb) onPauseCb();
    document.body.classList.remove("video-playing");
  });

  // tap-to-toggle:
  // - если играет -> pause
  // - если пауза -> play
  // ВАЖНО: controls видны только на pause, поэтому play делаем жестом по видео
  playerVideo.addEventListener("click", () => {
    // если controls сейчас видны, браузер может сам обрабатывать клики
    // но нам нужно стабильное поведение:
    if (!isOpen) return;

    if (isPlaying) {
      safePause();
      return;
    }

    // если paused — play
    // начинаем muted, чтобы iOS не отказывал
    safePlay(true);
  });

  // Swipe navigation (только когда paused)
  playerVideo.addEventListener(
    "touchstart",
    (e) => {
      if (!isOpen) return;
      if (isPlaying) return; // только когда пауза
      if (!videoList || videoList.length <= 1) return;
      if (!e.touches || e.touches.length !== 1) return;

      const t = e.touches[0];
      swipeStartX = t.clientX;
      swipeStartY = t.clientY;
    },
    { passive: true }
  );

  playerVideo.addEventListener(
    "touchend",
    (e) => {
      if (!isOpen) return;
      if (isPlaying) return;
      if (!e.changedTouches || !e.changedTouches[0]) return;

      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStartX;
      const dy = t.clientY - swipeStartY;

      // swipe down to exit (когда paused)
      if (dy > 70 && Math.abs(dy) > Math.abs(dx)) {
        closePlayerToList();
        return;
      }

      // horizontal swipe to prev/next (когда paused)
      if (!videoList || videoList.length <= 1) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;

      const TH = 50;
      if (dx < -TH) openVideoByIndex(currentIndex + 1);
      if (dx > TH) openVideoByIndex(currentIndex - 1);
    },
    { passive: true }
  );

  playerWrap.appendChild(playerVideo);
  overlayEl.appendChild(playerWrap);

  // Esc to exit (desktop)
  window.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") {
      closePlayerToList();
    }
  });
}

/* =========================
   Cards rendering
   ========================= */

function createCard(url, idx) {
  const wrap = document.createElement("div");
  wrap.className = "video-card";

  // минимальный стиль карточки (чтобы было видно)
  wrap.style.width = "100%";
  wrap.style.borderRadius = "16px";
  wrap.style.background = "rgba(255,255,255,0.06)";
  wrap.style.border = "1px solid rgba(255,255,255,0.08)";
  wrap.style.padding = "18px 16px";
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.justifyContent = "space-between";
  wrap.style.gap = "12px";

  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.flexDirection = "column";
  left.style.gap = "6px";

  const title = document.createElement("div");
  title.textContent = `Видео ${idx + 1}`;
  title.style.color = "rgba(255,255,255,0.92)";
  title.style.fontSize = "16px";
  title.style.fontWeight = "600";

  const hint = document.createElement("div");
  hint.textContent = "Тап — открыть";
  hint.style.color = "rgba(255,255,255,0.55)";
  hint.style.fontSize = "12px";

  left.appendChild(title);
  left.appendChild(hint);

  const play = document.createElement("div");
  play.textContent = "▶";
  play.style.width = "36px";
  play.style.height = "36px";
  play.style.borderRadius = "999px";
  play.style.display = "flex";
  play.style.alignItems = "center";
  play.style.justifyContent = "center";
  play.style.background = "rgba(255,255,255,0.10)";
  play.style.color = "rgba(255,255,255,0.9)";
  play.style.flex = "0 0 auto";

  wrap.appendChild(left);
  wrap.appendChild(play);

  wrap.addEventListener("click", () => {
    if (!active) return;
    // прогрев на всякий (не мешает)
    warmCache(withInitData(url));
    openVideoByIndex(idx);
  });

  return { wrap };
}

function render() {
  if (!listEl) return;

  listEl.innerHTML = "";
  cards = [];

  // чтобы список нормально скроллился в твоём overlay
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

  // старт: список виден, плеер скрыт
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

  // если плеер открыт — закрываем
  if (isOpen) closePlayerToList();

  // safety
  document.body.classList.remove("video-playing");

  // чистим ресурсы
  revokeCurrentBlob();

  if (playerVideo) {
    try {
      playerVideo.pause();
      playerVideo.removeAttribute("src");
      playerVideo.load();
    } catch (e) {}
  }
}