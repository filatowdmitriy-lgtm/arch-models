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
let playerHostEl = null;
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
  // === HOST под единый video (в DOM) ===
playerHostEl = overlayEl.querySelector("#videoPlayerHost");
if (!playerHostEl) {
  playerHostEl = document.createElement("div");
  playerHostEl.id = "videoPlayerHost";
  playerHostEl.style.width = "100%";
  playerHostEl.style.display = "none"; // показываем только при проигрывании
  playerHostEl.style.marginTop = "12px";

  // ВАЖНО: вставляем рядом со списком, а не поверх него
  // (иначе клики по карточкам могут пропадать)
  listEl.insertAdjacentElement("afterend", playerHostEl);
} else {
  playerHostEl.style.display = "none";
}


  // на всякий: чистим
  listEl.innerHTML = "";
  cards = [];
  activeCard = null;
  // если раньше уже создавали video — удалим из DOM
if (playerVideo && playerVideo.parentNode) {
  try { playerVideo.pause(); } catch (e) {}
  playerVideo.parentNode.removeChild(playerVideo);
}
playerVideo = null;

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
  if (playerHostEl) playerHostEl.style.display = "none";
  if (onPauseCb) onPauseCb();
});

// === ВСТАВЛЯЕМ video в DOM ===
playerVideo.style.width = "100%";
playerVideo.style.aspectRatio = "16 / 9";
playerVideo.style.background = "#000";
playerVideo.style.borderRadius = "12px";
playerVideo.style.display = "block";

if (playerHostEl) {
  playerHostEl.innerHTML = "";          // на всякий
  playerHostEl.appendChild(playerVideo);
}

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

// setActive(cardObj);


  // очищаем старый blobUrl
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

try {
  // 1️⃣ СРАЗУ ставим src (обычный URL)
  if (playerHostEl) playerHostEl.style.display = "block";

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

  // визуал, чтобы карточка была видна
  wrap.style.width = "100%";
  wrap.style.aspectRatio = "16 / 9";
  wrap.style.background = "#000";
  wrap.style.borderRadius = "12px";
  wrap.style.overflow = "hidden";

  // ⬅️ ВАЖНО: cardObj создаём ДО addEventListener
  const cardObj = { wrap, url };

  wrap.addEventListener("click", () => {
    if (!active) return;
    playVideoFromCard(url, cardObj);
  });

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
   console.log("[video] activateVideo");
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
if (playerHostEl) {
  playerHostEl.style.display = "none";
}



  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  clearActive();
}

