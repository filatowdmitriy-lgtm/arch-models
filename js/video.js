// js/video.js
//
// ВЕРСИЯ: стабильный video UX для Telegram iOS + Desktop
//
// Идея:
// 1) В списке — карточки 16:9 (превью получаем через <video preload=metadata>, без controls)
// 2) Для проигрывания — ОДИН playerVideo (не много видео в скролле)
// 3) На клик по карточке: открываем player, ставим src = blobUrl (если уже готов) или обычный url,
//    play() вызывается СРАЗУ из gesture, muted=true (важно для iOS)
// 4) Пауза НЕ выкидывает в карточки (как ты просил)
// 5) Выход в карточки — кнопкой "◀︎" (вариант B), Prev/Next тоже там
//
// НЕ трогаем viewer.js. Viewer сам скрывает общий UI на play и показывает на pause через callbacks.

import { cachedFetch } from "./cache/cachedFetch.js";

// ---------------------------
// DOM refs (передаются из viewer.js)
let overlayEl = null;
let listEl = null;
let emptyEl = null;

// ---------------------------
// callbacks (viewer.js)
let onPlayCb = null;
let onPauseCb = null;

// ---------------------------
// state
let active = false;
let videoList = []; // array of ORIGINAL urls (без initData)
let currentIndex = -1;

// ---------------------------
// single player
let playerWrap = null;      // контейнер плеера
let playerVideo = null;     // ОДИН video элемент
let playerLoading = null;   // "loading" слой
let controlBar = null;      // панель управления (вариант B)

// ---------------------------
// cards
let cards = []; // { wrap, url, srcUrl, previewVideo }

// ---------------------------
// blob prefetch cache
const blobBySrcUrl = new Map();      // srcUrl -> blobUrl
const inflightBySrcUrl = new Map();  // srcUrl -> Promise
let lastPlayedBlobUrl = null;        // чтобы чистить за собой (аккуратно)

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

  // чистим список (overlay не трогаем)
  listEl.innerHTML = "";
  cards = [];
  currentIndex = -1;

  // создаём UI плеера один раз
  ensurePlayerUi();
  showListView();
}

function ensurePlayerUi() {
  if (playerWrap) return;

  // --- control bar (вариант B)
  controlBar = document.createElement("div");
  controlBar.className = "video-controlbar";
  controlBar.style.cssText = `
    position: sticky;
    top: 0;
    z-index: 5;
    display: none;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-radius: 12px;
    margin: 8px;
  `;

  const left = document.createElement("div");
  left.style.cssText = `display:flex; gap:8px; align-items:center;`;

  const right = document.createElement("div");
  right.style.cssText = `display:flex; gap:8px; align-items:center;`;

  const btnBack = mkBtn("◀︎", "Back to cards");
  btnBack.addEventListener("click", () => {
    closePlayer();
  });

  const btnPrev = mkBtn("⟨", "Previous");
  btnPrev.addEventListener("click", () => {
    playByIndex(modIndex(currentIndex - 1));
  });

  const btnNext = mkBtn("⟩", "Next");
  btnNext.addEventListener("click", () => {
    playByIndex(modIndex(currentIndex + 1));
  });

  const title = document.createElement("div");
  title.style.cssText = `
    color: #fff;
    font: 500 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    opacity: 0.95;
    max-width: 55vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `;
  title.textContent = "Видео";

  left.appendChild(btnBack);
  left.appendChild(title);

  right.appendChild(btnPrev);
  right.appendChild(btnNext);

  controlBar.appendChild(left);
  controlBar.appendChild(right);

  // --- player wrap
  playerWrap = document.createElement("div");
  playerWrap.className = "video-player-wrap";
  playerWrap.style.cssText = `
    display: none;
    width: 100%;
    padding: 8px;
    box-sizing: border-box;
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    position: relative;
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
  `;

  playerVideo = document.createElement("video");
  playerVideo.controls = true;
  playerVideo.preload = "metadata";
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.playsInline = true;
  playerVideo.style.cssText = `
    width: 100%;
    height: auto;
    display: block;
    background: #000;
  `;

  // metadata hack (как эталон)
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch (e) {}
  });

  // на play — скрываем нашу панель (viewer.js тоже скроет общий UI)
  playerVideo.addEventListener("play", () => {
    hideControlBar();
    if (onPlayCb) onPlayCb();
  });

  // на pause — показываем панель (и viewer.js вернёт общий UI)
  playerVideo.addEventListener("pause", () => {
    showControlBar();
    if (onPauseCb) onPauseCb();
  });

  // если видео закончилось — тоже показываем панель
  playerVideo.addEventListener("ended", () => {
    showControlBar();
    if (onPauseCb) onPauseCb();
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
    font: 500 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    background: rgba(0,0,0,0.35);
  `;
  playerLoading.textContent = "Загрузка…";

  box.appendChild(playerVideo);
  box.appendChild(playerLoading);

  playerWrap.appendChild(controlBar);
  playerWrap.appendChild(box);

  // добавляем в overlayEl (ВАЖНО: не перекрывать listEl абсолютом)
  overlayEl.appendChild(playerWrap);

  // события буферизации
  playerVideo.addEventListener("waiting", () => setLoading(true));
  playerVideo.addEventListener("playing", () => setLoading(false));
  playerVideo.addEventListener("canplay", () => setLoading(false));
}

function mkBtn(text, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.title = title;
  b.style.cssText = `
    appearance: none;
    border: 0;
    border-radius: 10px;
    padding: 10px 12px;
    min-width: 42px;
    background: rgba(255,255,255,0.14);
    color: #fff;
    font: 600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
  `;
  return b;
}

function setLoading(on) {
  if (!playerLoading) return;
  playerLoading.style.display = on ? "flex" : "none";
}

function showControlBar() {
  if (controlBar) controlBar.style.display = "flex";
}
function hideControlBar() {
  if (controlBar) controlBar.style.display = "none";
}

function showListView() {
  if (listEl) listEl.style.display = "block";
  if (playerWrap) playerWrap.style.display = "none";
}

function showPlayerView() {
  if (listEl) listEl.style.display = "none";
  if (playerWrap) playerWrap.style.display = "block";
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

// ============================================================
// BLOB PREFETCH (как эталон, но в фоне)
// ============================================================

function prefetchBlob(srcUrl) {
  if (!srcUrl) return;
  if (blobBySrcUrl.has(srcUrl)) return;

  if (inflightBySrcUrl.has(srcUrl)) return;

  const p = (async () => {
    try {
      const resp = await fetch(srcUrl);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      blobBySrcUrl.set(srcUrl, objUrl);
    } catch (e) {
      // не критично: если blob не удалось — играем по обычному url
      // console.warn("[video] blob prefetch failed:", e);
    } finally {
      inflightBySrcUrl.delete(srcUrl);
    }
  })();

  inflightBySrcUrl.set(srcUrl, p);
}

// ============================================================
// RENDER LIST (cards 16:9 + preview)
// ============================================================

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

    // blob prefetch в фоне (чтобы на клике не ждать)
    prefetchBlob(card.srcUrl);
  });
}

function createCard(url, index) {
  const srcUrl = withInitData(url);

  const wrap = document.createElement("div");
  wrap.className = "video-card";
  wrap.style.cssText = `
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
    background: #111;
    position: relative;
    margin: 10px 0;
  `;

  // preview video (НЕ controls, НЕ play)
  const prev = document.createElement("video");
  prev.muted = true;
  prev.playsInline = true;
  prev.setAttribute("playsinline", "");
  prev.setAttribute("webkit-playsinline", "");
  prev.preload = "metadata";
  prev.src = srcUrl;
  prev.controls = false;
  prev.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
  `;

  // metadata hack для превью
  prev.addEventListener("loadedmetadata", () => {
    try {
      prev.currentTime = 0.001;
      prev.pause();
    } catch (e) {}
  });

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

  // чуть-чуть прогреваем кеш (не влияет на play)
  warmCache(srcUrl);

  return { wrap, url, srcUrl, previewVideo: prev };
}

// ============================================================
// PLAYBACK (single player)
// ============================================================

function playByIndex(index) {
  if (!playerVideo) ensurePlayerUi();
  if (!videoList || videoList.length === 0) return;
  if (index < 0 || index >= videoList.length) return;

  currentIndex = index;

  const card = cards[index];
  const srcUrl = card ? card.srcUrl : withInitData(videoList[index]);

  // переключаем вид
  showPlayerView();
  showControlBar(); // на старте покажем, потом play спрячем

  // важно: iOS play часто требует muted=true на старте
  playerVideo.muted = true;

  // чистим прошлый blob (только тот, который реально стоял на playerVideo)
  if (lastPlayedBlobUrl) {
    try {
      URL.revokeObjectURL(lastPlayedBlobUrl);
    } catch (e) {}
    lastPlayedBlobUrl = null;
  }

  setLoading(true);

  // ставим src: если blob уже готов — ставим blob (как эталон)
  const blobUrl = blobBySrcUrl.get(srcUrl);
  if (blobUrl) {
    playerVideo.src = blobUrl;
    lastPlayedBlobUrl = blobUrl; // чистим потом
  } else {
    // если blob ещё не готов — играем по обычному url, а blob дотянем в фоне
    playerVideo.src = srcUrl;
    prefetchBlob(srcUrl);
  }

  playerVideo.load();

  // КРИТИЧНО: play вызываем СРАЗУ из gesture (мы сейчас в onClick)
  const p = playerVideo.play();
  if (p && typeof p.catch === "function") {
    p.catch((e) => {
      // если iOS отказал — оставляем controls, пользователь может нажать play вручную
      setLoading(false);
      // console.warn("[video] play() rejected:", e);
    });
  }

  // снимаем mute после старта (когда реально заиграло)
  const unmuteOnce = () => {
    playerVideo.removeEventListener("playing", unmuteOnce);
    // если юзер хочет звук — включаем после старта
    playerVideo.muted = false;
  };
  playerVideo.addEventListener("playing", unmuteOnce);
}

function closePlayer() {
  if (!playerVideo) {
    showListView();
    return;
  }

  try {
    playerVideo.pause();
  } catch (e) {}

  playerVideo.removeAttribute("src");
  try {
    playerVideo.load();
  } catch (e) {}

  setLoading(false);
  showListView();
}

// ============================================================
// PUBLIC API (как ожидает viewer.js)
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

  // viewer.js тоже это делает, но дубль безопасен
  document.body.classList.remove("video-playing");

  // закрываем player (но НЕ ломаем список)
  closePlayer();

  // чистим blob cache (чтобы не жрать память)
  // (если хочешь оставить кеш — можно убрать этот блок)
  for (const [, blobUrl] of blobBySrcUrl) {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch (e) {}
  }
  blobBySrcUrl.clear();
  inflightBySrcUrl.clear();
  lastPlayedBlobUrl = null;
}
