// js/video.js
//
// Видео-вкладка (карточки):
// - список карточек (вертикальный скролл)
// - play на карточке -> fullscreen (через viewer.js), скрываем остальные
// - pause -> возвращаем список в тот же scrollTop
//
// iOS FIX:
// - НЕ полагаемся на streaming/range (в iOS Telegram часто "зачёркнут play")
// - грузим каждый ролик в blob заранее (очередью), потом даём controls
//
// НЕ трогаем: Telegram-логику, viewer.js вкладки, cachedFetch.js (используем только как прогрев).

import { cachedFetch } from "./cache/cachedFetch.js";

/* ===============================
   STATE
   =============================== */

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let cards = []; // { wrap, video, url, blobUrl, blobState }
let activeCard = null;
let savedScrollTop = 0;

// очередь blob-загрузок, чтобы не убить сеть
let blobQueue = [];
let blobLoading = false;

/* ===============================
   INIT
   =============================== */

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

  // чистим
  listEl.innerHTML = "";
  cards = [];
  activeCard = null;

  blobQueue = [];
  blobLoading = false;
}

/* ===============================
   HELPERS
   =============================== */

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

function stopAllExcept(exceptVideoEl) {
  cards.forEach((c) => {
    if (c.video !== exceptVideoEl) {
      try {
        // чтобы pause-хендлер не делал clearActive()/UI flicker
        c.__internalPause = true;
        c.video.pause();
      } catch (e) {}
    }
  });
}

function clearActive() {
  if (!activeCard) return;

  activeCard.wrap.classList.remove("active");

  if (listEl) {
    const st = savedScrollTop;
    setTimeout(() => {
      listEl.scrollTop = st;
    }, 0);
  }

  activeCard = null;
}

function setActive(card) {
  if (!card) return;

  if (listEl) savedScrollTop = listEl.scrollTop;

  cards.forEach((c) => c.wrap.classList.remove("active"));
  card.wrap.classList.add("active");
  activeCard = card;

  stopAllExcept(card.video);
}

/* ===============================
   BLOB LOADER (queue)
   =============================== */

function enqueueBlob(card) {
  if (!card || !card.video || !card.url) return;

  // already queued/loaded
  if (card.blobState === "queued" || card.blobState === "loading" || card.blobState === "ready") return;

  card.blobState = "queued";
  blobQueue.push(card);
  pumpBlobQueue();
}

async function pumpBlobQueue() {
  if (blobLoading) return;
  blobLoading = true;

  while (blobQueue.length) {
    const card = blobQueue.shift();
    if (!card || !card.video) continue;

    // если карточку уже пересоздали/удалили
    if (!cards.includes(card)) continue;

    // если уже готово — пропускаем
    if (card.blobState === "ready") continue;

    card.blobState = "loading";

    try {
      // если был старый blobUrl — чистим
      if (card.blobUrl) {
        try { URL.revokeObjectURL(card.blobUrl); } catch (e) {}
        card.blobUrl = null;
      }

      const resp = await fetch(card.url);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);

      card.blobUrl = objUrl;

      // ставим blob в video
      card.video.src = objUrl;
      card.video.load();

      // включаем контролы ТОЛЬКО когда src уже blob
      card.video.controls = true;

      card.blobState = "ready";
    } catch (err) {
      console.error("blob load failed:", err);

      // fallback: оставим прямой url (на ПК может работать)
      try {
        card.video.src = card.url;
        card.video.load();
        card.video.controls = true;
      } catch (e) {}

      card.blobState = "error";
    }
  }

  blobLoading = false;
}

/* ===============================
   RENDER LIST
   =============================== */

function createCard(url) {
  const wrap = document.createElement("div");
  wrap.className = "video-card";

  const v = document.createElement("video");

  // iOS/Telegram critical
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.playsInline = true;

  // ВАЖНО:
  // пока blob не готов — controls выключены (иначе iOS рисует "зачёркнутый play")
  v.controls = false;

  // metadata нужно для таймлайна/хаков
  v.preload = "metadata";

  const srcUrl = withInitData(url);

  // создаём объект карточки ДО использования в обработчиках
  const cardObj = {
    wrap,
    video: v,
    url: srcUrl,
    blobUrl: null,
    blobState: "init",
    __internalPause: false
  };

  // metadata hack (как в эталоне) — чтобы таймлайн не глючил
  v.addEventListener("loadedmetadata", () => {
    try {
      v.currentTime = 0.001;
      v.currentTime = 0;
    } catch (e) {}
  });

  // Прогрев кэша (IDB) — безопасно
  warmCache(srcUrl);

  // ВАЖНО: blob грузим заранее (в фоне), чтобы на iOS play был доступен
  enqueueBlob(cardObj);

  // PLAY -> fullscreen + hide UI
  v.addEventListener("play", () => {
    if (!active) {
      // если вкладка не активна — не даём проигрывать
      try { v.pause(); } catch (e) {}
      return;
    }

    // на iOS полезно стартовать muted -> потом снять (но без ломания)
    // (если звук всё равно не нужен — можно убрать)
    try {
      if (v.muted !== false) v.muted = false;
    } catch (e) {}

    setActive(cardObj);
    if (onPlayCb) onPlayCb();
  });

  // PAUSE -> вернуть список
  v.addEventListener("pause", () => {
    // если мы сами гасили другие видео — не трогаем UI
    if (cardObj.__internalPause) {
      cardObj.__internalPause = false;
      return;
    }

    clearActive();
    if (onPauseCb) onPauseCb();
  });

  wrap.appendChild(v);

  return cardObj;
}

function destroyAllCards() {
  // ревокаем blob-и
  cards.forEach((c) => {
    if (c && c.blobUrl) {
      try { URL.revokeObjectURL(c.blobUrl); } catch (e) {}
      c.blobUrl = null;
    }
    if (c && c.video) {
      try { c.video.pause(); } catch (e) {}
      try { c.video.removeAttribute("src"); c.video.load(); } catch (e) {}
    }
  });

  cards = [];
  activeCard = null;
  blobQueue = [];
  blobLoading = false;
}

function render() {
  if (!listEl) return;

  listEl.innerHTML = "";
  destroyAllCards();

  const has = Array.isArray(videoList) && videoList.length > 0;
  if (emptyEl) emptyEl.style.display = has ? "none" : "block";
  if (!has) return;

  videoList.forEach((url) => {
    const card = createCard(url);
    cards.push(card);
    listEl.appendChild(card.wrap);
  });
}

/* ===============================
   PUBLIC API
   =============================== */

export function activateVideo() {
  active = true;
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : (list ? [list] : []);
  render();
}

export function deactivateVideo() {
  active = false;

  // на всякий гасим fullscreen-класс
  document.body.classList.remove("video-playing");

  // пауза всех
  cards.forEach((c) => {
    try {
      c.__internalPause = true;
      c.video.pause();
    } catch (e) {}
  });

  clearActive();
}
