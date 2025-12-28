// js/video.js
//
// CHANGED: новый UX видео:
// - список карточек (вертикальный скролл)
// - play на карточке -> fullscreen (как раньше), скрываем остальные
// - pause -> возвращаем список в тот же scrollTop
//
// НЕ трогаем: Telegram-логику, viewer.js вкладки, кэш-логику в cachedFetch.js (мы её только вызываем для прогрева).

import { cachedFetch } from "./cache/cachedFetch.js"; // ADDED (прогрев IDB-кэша)
let playerVideo = null;
let currentBlobUrl = null;
let overlayEl = null; // ADDED
let listEl = null;    // ADDED
let emptyEl = null;   // ADDED

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let cards = []; // { wrap, url }
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
  // === SINGLE VIDEO PLAYER (как в рабочей версии) ===
playerVideo = document.createElement("video");
playerVideo.controls = true;
playerVideo.preload = "metadata";
playerVideo.setAttribute("playsinline", "");
playerVideo.setAttribute("webkit-playsinline", "");
playerVideo.playsInline = true;

// metadata hack — КРИТИЧНО для Telegram iOS
playerVideo.addEventListener("loadedmetadata", () => {
  try {
    playerVideo.currentTime = 0.001;
    playerVideo.currentTime = 0;
  } catch (e) {}
});

// play / pause → viewer
playerVideo.addEventListener("play", () => {
  if (onPlayCb) onPlayCb();
});
playerVideo.addEventListener("pause", () => {
  if (onPauseCb) onPauseCb();
});

// добавляем поверх списка
overlayEl.appendChild(playerVideo);
playerVideo.style.display = "none";
playerVideo.style.width = "100%";
playerVideo.style.aspectRatio = "16 / 9";
playerVideo.style.background = "#000";
playerVideo.style.borderRadius = "12px";
playerVideo.style.overflow = "hidden";

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

async function playVideoFromCard(url, cardObj) {
  if (!playerVideo) return;

  const srcUrl = withInitData(url);

  // делаем карточку активной (для скрытия остальных)
  setActive(cardObj);

  // очищаем старый blobUrl
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

try {
  // 1️⃣ СРАЗУ ставим src (обычный URL)
  playerVideo.src = srcUrl;

  // 2️⃣ СРАЗУ play — БЕЗ await fetch перед этим
  const playPromise = playerVideo.play();

  // 3️⃣ Уже ПОСЛЕ play — греем кэш / blob (НЕ блокирует)
  warmCache(srcUrl);

  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch((e) => {
      console.warn("play() rejected:", e);
    });
  }
} catch (e) {
  console.error("playVideoFromCard failed:", e);
}

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

}

// ============================================================
// RENDER LIST
// ============================================================

function createCard(url) {
  const wrap = document.createElement("div");
  wrap.className = "video-card";
  // чтобы карточка была видимой даже если внутри пусто
wrap.style.width = "100%";
wrap.style.aspectRatio = "16 / 9";
wrap.style.background = "#000";
wrap.style.borderRadius = "12px";
wrap.style.overflow = "hidden";


wrap.addEventListener("click", () => {
  if (!active) return;
  playVideoFromCard(url, cardObj);
});

  const cardObj = { wrap, url };
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

  document.body.classList.remove("video-playing");

  if (playerVideo) {
    try { playerVideo.pause(); } catch (e) {}
    playerVideo.removeAttribute("src");
    playerVideo.load();
  }
  if (playerVideo) {
  playerVideo.style.display = "none";
}


  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  clearActive();
}

