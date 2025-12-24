// js/video.js
//
// CHANGED: новый UX видео:
// - список карточек (вертикальный скролл)
// - play на карточке -> fullscreen (как раньше), скрываем остальные
// - pause -> возвращаем список в тот же scrollTop
//
// НЕ трогаем: Telegram-логику, viewer.js вкладки, кэш-логику в cachedFetch.js (мы её только вызываем для прогрева).

import { cachedFetch } from "./cache/cachedFetch.js"; // ADDED (прогрев IDB-кэша)

let overlayEl = null; // ADDED
let listEl = null;    // ADDED
let emptyEl = null;   // ADDED

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let cards = []; // { wrap, video, url }
let activeCard = null;

let savedScrollTop = 0;

// ============================================================
// INIT
// ============================================================

export function initVideo(refs, callbacks = {}) { // CHANGED signature
  overlayEl = refs?.overlayEl || null;
  listEl = refs?.listEl || null;
  emptyEl = refs?.emptyEl || null;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  if (!overlayEl || !listEl) {
    console.error("initVideo: overlayEl/listEl not provided");
    return;
  }

  // на всякий: чистим
  listEl.innerHTML = "";
  cards = [];
  activeCard = null;
}

// ============================================================
// HELPERS
// ============================================================

function withInitData(url) {
  // ADDED: как в models.js, но для видео
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
  // ADDED: прогреваем IndexedDB-кэш, НЕ ломая streaming.
  // Видео играет по обычному src (быстро), а cachedFetch параллельно сохранит blob в IDB.
  try {
    cachedFetch(url).catch(() => {});
  } catch (e) {}
}

function stopAllExcept(exceptVideoEl) {
  cards.forEach((c) => {
    if (c.video !== exceptVideoEl) {
      try {
        c.video.pause();
      } catch (e) {}
    }
  });
}

function clearActive() {
  if (!activeCard) return;

  activeCard.wrap.classList.remove("active");

  // возвращаем scroll
  if (listEl) {
    const st = savedScrollTop;
    // microtask -> чтобы DOM успел показать список
    setTimeout(() => {
      listEl.scrollTop = st;
    }, 0);
  }

  activeCard = null;
}

function setActive(card) {
  if (!card) return;

  // запоминаем позицию списка
  if (listEl) savedScrollTop = listEl.scrollTop;

  // делаем активной
  cards.forEach((c) => c.wrap.classList.remove("active"));
  card.wrap.classList.add("active");
  activeCard = card;

  // остальные видео стопаем, чтобы не было “звуков из списка”
  stopAllExcept(card.video);
}

// ============================================================
// RENDER LIST
// ============================================================

function createCard(url) {
  const wrap = document.createElement("div");
  wrap.className = "video-card";

  const v = document.createElement("video");
v.controls = true;
v.preload = "auto";           // CHANGED
v.muted = true;               // ADDED (КРИТИЧНО ДЛЯ iOS)
v.playsInline = true;         // ADDED
v.setAttribute("playsinline", "");
v.setAttribute("webkit-playsinline", "");
  v.playsInline = true;


// === BLOB ЗАГРУЗКА (КАК РАНЬШЕ) ===
const srcUrl = withInitData(url);

  v.src = srcUrl;
v.preload = "none";
v.muted = true;
v.playsInline = true;
v.setAttribute("playsinline", "");
v.setAttribute("webkit-playsinline", "");
v.addEventListener("play", () => {
  // fullscreen + UI
  setActive(cardObj);
  if (onPlayCb) onPlayCb();

  // blob уже есть — ничего не делаем
  if (v.dataset.blobReady) return;

  // 🔥 ПАРАЛЛЕЛЬНО, БЕЗ await
  cachedFetch(srcUrl)
    .then(res => res.blob())
    .then(blob => {
      console.log("VIDEO BLOB:", blob.type, blob.size);

      const blobUrl = URL.createObjectURL(blob);

      // ⚠️ ВАЖНО: БЕЗ play()
      v.src = blobUrl;
      v.dataset.blobReady = "1";
    })
    .catch(e => {
      console.error("Video blob load failed:", e);
    });
});






  // metadata hack (как было) — чтобы таймлайн в Telegram не глючил
  v.addEventListener("loadedmetadata", () => {
    try {
      v.currentTime = 0.001;
      v.currentTime = 0;
    } catch (e) {}
  });

  // прогрев кэша (один раз, когда браузер хоть что-то начал грузить)
  let warmed = false;
  const warmOnce = () => {
    if (warmed) return;
    warmed = true;
    warmCache(srcUrl);
  };
  v.addEventListener("loadeddata", warmOnce, { passive: true });


  // PAUSE -> вернуть список
  v.addEventListener("pause", () => {
    // если видео реально “выключили”, а не мы во время смены модели
    clearActive();
    if (onPauseCb) onPauseCb();
  });

  wrap.appendChild(v);

  const cardObj = { wrap, video: v, url: srcUrl };
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

  videoList.forEach((url) => {
    const card = createCard(url);
    cards.push(card);
    listEl.appendChild(card.wrap);
  });
}

// ============================================================
// PUBLIC API (как было по именам)
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

  // гасим fullscreen-класс (viewer.js тоже снимает, но пусть будет дубль безопасно)
  document.body.classList.remove("video-playing"); // ADDED

  // пауза всех
  cards.forEach((c) => {
    try {
      c.video.pause();
    } catch (e) {}
  });

  clearActive();
}
