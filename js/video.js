// js/video.js
//
// Рабочая версия под Telegram WebView (ПК + телефон).
//
// Задачи:
// - список карточек (скролл)
// - тап по карточке -> открываем ОДИН общий <video> (оверлей), стартуем play БЕЗ await (iOS)
// - pause/ended -> закрываем плеер, возвращаем список на тот же scrollTop
// - свайп по плееру (когда НЕ играет) -> prev/next
// - cachedFetch() используем только как прогрев (в фоне), не мешаем play
//
// Интерфейс (как у тебя в viewer.js):
// initVideo({ overlayEl, listEl, emptyEl }, { onPlay, onPause })
// activateVideo(), setVideoList(list), deactivateVideo()

import { cachedFetch } from "./cache/cachedFetch.js";

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let cards = [];
let activeCard = null;
let savedScrollTop = 0;

let playerVideo = null;
let isPlaying = false;
let currentIndex = 0;

// swipe
let swipeStartX = 0;
let swipeStartY = 0;

// blob cache (фоном)
const blobCache = new Map(); // url -> blobObjectUrl
const MAX_BLOB_CACHE = 3;

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
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

  // чистим список
  listEl.innerHTML = "";
  cards = [];
  activeCard = null;

  // создаём единый плеер (оверлей)
  ensurePlayer();
}

function ensurePlayer() {
  if (playerVideo) return;

  // overlay должен быть относительным, чтобы плеер мог лежать поверх списка
  try {
    const cs = window.getComputedStyle(overlayEl);
    if (cs.position === "static") {
      overlayEl.style.position = "relative";
    }
  } catch (e) {}

  playerVideo = document.createElement("video");
  playerVideo.controls = true;
  playerVideo.preload = "metadata";

  // Важно для Telegram + iOS
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.playsInline = true;

  // Стили: полноценный оверлей
  playerVideo.style.position = "absolute";
  playerVideo.style.left = "0";
  playerVideo.style.top = "0";
  playerVideo.style.width = "100%";
  playerVideo.style.height = "100%";
  playerVideo.style.display = "none";
  playerVideo.style.background = "#000";
  playerVideo.style.zIndex = "10";
  playerVideo.style.objectFit = "contain";
  playerVideo.style.pointerEvents = "none"; // когда скрыт — не мешаем списку

  // metadata hack (как эталон)
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch (e) {}
  });

  playerVideo.addEventListener("play", () => {
    isPlaying = true;

    // снимаем mute после старта (iOS)
    try {
      playerVideo.muted = false;
      playerVideo.removeAttribute("muted");
    } catch (e) {}

    if (onPlayCb) onPlayCb();
  });

  playerVideo.addEventListener("pause", () => {
    isPlaying = false;

    // если это была реальная пауза юзера — закрываем плеер и возвращаем список
    closePlayerToList();
    if (onPauseCb) onPauseCb();
  });

  playerVideo.addEventListener("ended", () => {
    isPlaying = false;
    closePlayerToList();
    if (onPauseCb) onPauseCb();
  });

  // свайп (как эталон): только когда активен режим, НЕ играет, и видео > 1
  playerVideo.addEventListener(
    "touchstart",
    (e) => {
      if (!active) return;
      if (isPlaying) return;
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
      if (!active) return;
      if (isPlaying) return;
      if (!videoList || videoList.length <= 1) return;

      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - swipeStartX;
      const dy = t.clientY - swipeStartY;

      // только горизонтальный свайп
      if (Math.abs(dx) <= Math.abs(dy)) return;

      const TH = 50;
      if (dx < -TH) nextVideo();
      if (dx > TH) prevVideo();
    },
    { passive: true }
  );

  overlayEl.appendChild(playerVideo);
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

// фоновый blob-кэш (не мешает play)
async function warmBlob(url) {
  if (!url) return;
  if (blobCache.has(url)) return;

  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);

    blobCache.set(url, objUrl);

    // простейший LRU: если много — удаляем первый
    if (blobCache.size > MAX_BLOB_CACHE) {
      const firstKey = blobCache.keys().next().value;
      const firstVal = blobCache.get(firstKey);
      blobCache.delete(firstKey);
      try {
        URL.revokeObjectURL(firstVal);
      } catch (e) {}
    }
  } catch (e) {
    // тихо — это только прогрев
  }
}

function stopAllCardsExcept(exceptVideoEl) {
  cards.forEach((c) => {
    if (c.videoEl && c.videoEl !== exceptVideoEl) {
      try {
        c.videoEl.pause();
      } catch (e) {}
    }
  });
}

function setActive(cardObj) {
  if (!cardObj) return;

  if (listEl) savedScrollTop = listEl.scrollTop;

  cards.forEach((c) => c.wrap.classList.remove("active"));
  cardObj.wrap.classList.add("active");
  activeCard = cardObj;

  stopAllCardsExcept(cardObj.videoEl);
}

function clearActive() {
  if (!activeCard) return;
  activeCard.wrap.classList.remove("active");
  activeCard = null;

  // возвращаем scroll
  if (listEl) {
    const st = savedScrollTop;
    setTimeout(() => {
      listEl.scrollTop = st;
    }, 0);
  }
}

// открыть общий плеер поверх списка
function openPlayer(url, cardObj, index) {
  if (!playerVideo) ensurePlayer();
  if (!playerVideo) return;

  const srcUrl = withInitData(url);
  currentIndex = typeof index === "number" ? index : 0;

  setActive(cardObj);

  // скрыть список
  if (listEl) listEl.style.visibility = "hidden";
  if (emptyEl) emptyEl.style.visibility = "hidden";

  // показать плеер
  playerVideo.style.display = "block";
  playerVideo.style.pointerEvents = "auto";

  // iOS: стартуем muted, чтобы play прошёл
  try {
    playerVideo.muted = true;
    playerVideo.setAttribute("muted", "");
  } catch (e) {}

  // ставим src (БЕЗ blob-await!)
  playerVideo.src = srcUrl;
  playerVideo.load();

  // play — без await (критично)
  const p = playerVideo.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {
      // если iOS отказал — пользователь может нажать play сам
    });
  }

  // прогревы в фоне
  warmCache(srcUrl);
  warmBlob(srcUrl).catch(() => {});
}

// закрыть плеер и вернуться к списку
function closePlayerToList() {
  if (!playerVideo) return;

  // скрываем плеер
  playerVideo.style.pointerEvents = "none";
  playerVideo.style.display = "none";

  // снимаем src (чтобы iOS не зависал на чёрном)
  try {
    playerVideo.pause();
  } catch (e) {}
  try {
    playerVideo.removeAttribute("src");
    playerVideo.load();
  } catch (e) {}

  // показываем список обратно
  if (listEl) listEl.style.visibility = "visible";
  if (emptyEl) emptyEl.style.visibility = "visible";

  clearActive();
}

// переключение видео внутри плеера (свайп)
function loadPlayerByIndex(idx) {
  if (!videoList || !videoList.length) return;
  if (!playerVideo) return;

  currentIndex = (idx + videoList.length) % videoList.length;

  const url = withInitData(videoList[currentIndex]);

  // в режиме свайпа мы НЕ автозапускаем, если сейчас не играет (как эталон)
  // но можем просто загрузить кадр
  try {
    playerVideo.muted = true;
    playerVideo.setAttribute("muted", "");
  } catch (e) {}

  playerVideo.src = url;
  playerVideo.load();

  // прогревы
  warmCache(url);
  warmBlob(url).catch(() => {});
}

function nextVideo() {
  if (isPlaying) return;
  if (!videoList || videoList.length <= 1) return;
  loadPlayerByIndex(currentIndex + 1);
}

function prevVideo() {
  if (isPlaying) return;
  if (!videoList || videoList.length <= 1) return;
  loadPlayerByIndex(currentIndex - 1);
}

// ============================================================
// RENDER LIST
// ============================================================

function createCard(url, index) {
  const wrap = document.createElement("div");
  wrap.className = "video-card";

  // Сделаем карточку видимой, но не “чёрный прямоугольник”.
  // Внутри будет мини-видео на паузе (первый кадр).
  wrap.style.width = "100%";
  wrap.style.borderRadius = "12px";
  wrap.style.overflow = "hidden";
  wrap.style.background = "rgba(255,255,255,0.06)";

  const v = document.createElement("video");
  v.muted = true;
  v.setAttribute("muted", "");
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");

  v.preload = "metadata";
  v.controls = false; // карточка = превью, контролы не нужны
  v.style.width = "100%";
  v.style.display = "block";
  v.style.aspectRatio = "16 / 9";
  v.style.objectFit = "cover";
  v.style.background = "#000";

  const srcUrl = withInitData(url);
  v.src = srcUrl;

  // metadata hack
  v.addEventListener("loadedmetadata", () => {
    try {
      v.currentTime = 0.001;
      v.currentTime = 0;
      v.pause();
    } catch (e) {}
  });

  // прогрев кэша (не мешает)
  let warmed = false;
  const warmOnce = () => {
    if (warmed) return;
    warmed = true;
    warmCache(srcUrl);
    warmBlob(srcUrl).catch(() => {});
  };
  v.addEventListener("loadeddata", warmOnce, { passive: true });

  wrap.appendChild(v);

  const cardObj = { wrap, videoEl: v, url: srcUrl, index };

  // КРИТИЧНО: гасим всплытие, чтобы Telegram не “открывал файл”
  wrap.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!active) return;
      openPlayer(url, cardObj, index);
    },
    { passive: false }
  );

  // iOS/Telegram: тапы иногда идут через touchstart
  wrap.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    { passive: false }
  );

  return cardObj;
}

function render() {
  if (!listEl) return;

  listEl.innerHTML = "";
  cards = [];
  activeCard = null;

  const has = Array.isArray(videoList) && videoList.length > 0;

  if (emptyEl) emptyEl.style.display = has ? "none" : "block";
  if (!has) return;

  videoList.forEach((url, i) => {
    const card = createCard(url, i);
    cards.push(card);
    listEl.appendChild(card.wrap);
  });
}

// ============================================================
// PUBLIC API
// ============================================================

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

  // дубль безопасно
  document.body.classList.remove("video-playing");

  // закрываем плеер, если открыт
  try {
    if (playerVideo && !playerVideo.paused) playerVideo.pause();
  } catch (e) {}
  closePlayerToList();

  // пауза карточек
  cards.forEach((c) => {
    try {
      c.videoEl.pause();
    } catch (e) {}
  });

  // blob-cache чистим (не обязательно, но чтобы не копилось)
  for (const [, objUrl] of blobCache) {
    try {
      URL.revokeObjectURL(objUrl);
    } catch (e) {}
  }
  blobCache.clear();
}
