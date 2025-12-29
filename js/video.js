// js/video.js
//
// FINAL (фиксируем):
//
// 1) Cards Mode
//    - сетка карточек 16:9
//    - превью = первый кадр
//    - НИКАКИХ <video> В КАРТОЧКАХ (только <img>)
//    - скролл работает
//    - видны стандартные табы: [3D] [Построение] [Видео]
//
// 2) Player Mode
//    - по клику на карточку открывается один-единственный <video>
//    - видео занимает всю область вкладки (как 3D/Схема)
//    - табы режимов скрываются
//    - в ИХ МЕСТЕ появляется панель навигации
//      [ ⬅ К карточкам ] [ ⏮ ] [ ⏭ ]
//    - панель ВИДНА ТОЛЬКО когда видео на паузе
//    - при play панель скрыта
//
// iOS/TG критично:
// - нельзя делать await fetch/blob ДО play() (теряется user gesture).
// - поэтому: playerVideo.src = srcUrl -> play() сразу, muted=true.
// - никаких blob для основного воспроизведения (только стриминг).
//
// Дополнительно:
// - превью первого кадра делаем через offscreen <video> + canvas (не в карточке).
//   Если canvas будет tainted (CORS) — просто оставляем плейсхолдер.

import { cachedFetch } from "./cache/cachedFetch.js";

let overlayEl = null;
let listEl = null;
let emptyEl = null;
let tabsEl = null; // .viewer-tabs (контейнер табов в тулбаре)

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = []; // raw urls (как в models.js)
let cards = [];     // { wrap, img, srcUrl }
let currentIndex = -1;

let playerWrap = null;
let playerVideo = null;
let loadingEl = null;

let navPanel = null;     // панель вместо табов
let tabsParent = null;   // родитель tabsEl (куда вставляем панель)
let tabsDisplayBackup = ""; // чтобы вернуть display табам

let isPlayerOpen = false;

// ============================
// HELPERS
// ============================

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

function clampIndex(i) {
  if (!videoList || videoList.length === 0) return -1;
  if (i < 0) return videoList.length - 1;
  if (i >= videoList.length) return 0;
  return i;
}

function setLoading(on) {
  if (!loadingEl) return;
  loadingEl.style.display = on ? "flex" : "none";
}

// ============================
// PREVIEW (first frame)
// ============================

let previewQueue = [];
let previewBusy = false;

function enqueuePreview(srcUrl, imgEl) {
  previewQueue.push({ srcUrl, imgEl });
  runPreviewQueue();
}

function runPreviewQueue() {
  if (previewBusy) return;
  if (!previewQueue.length) return;
  previewBusy = true;

  const { srcUrl, imgEl } = previewQueue.shift();

  // offscreen video (НЕ в DOM)
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "metadata";
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.playsInline = true;

  // ❗️ не ставим crossOrigin принудительно: если сервер не отдаёт CORS — canvas станет tainted,
  // но тогда просто fallback без preview.
  v.src = srcUrl;

  const cleanup = () => {
    try { v.pause(); } catch (e) {}
    try { v.removeAttribute("src"); v.load(); } catch (e) {}
    previewBusy = false;
    setTimeout(runPreviewQueue, 0);
  };

  const fail = () => cleanup();

  v.addEventListener(
    "error",
    () => fail(),
    { once: true, passive: true }
  );

  v.addEventListener(
    "loadeddata",
    async () => {
      try {
        // дергаем первый кадр (иногда нужно microseek)
        try { v.currentTime = 0.001; } catch (e) {}

        // ждём seeked, если требуется
        await new Promise((res) => {
          let done = false;
          const finish = () => { if (done) return; done = true; res(); };
          v.addEventListener("seeked", finish, { once: true, passive: true });
          // если seeked не придёт — всё равно продолжаем
          setTimeout(finish, 250);
        });

        const canvas = document.createElement("canvas");
        const w = v.videoWidth || 640;
        const h = v.videoHeight || 360;
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(v, 0, 0, w, h);

        // если CORS запретил — тут вылетит SecurityError
        const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
        imgEl.src = dataUrl;
        imgEl.style.opacity = "1";
      } catch (e) {
        // fallback: оставляем плейсхолдер
      } finally {
        cleanup();
      }
    },
    { once: true, passive: true }
  );
}

// ============================
// UI: cards list
// ============================

function createCard(rawUrl, idx) {
  const srcUrl = withInitData(rawUrl);

  const wrap = document.createElement("div");
  wrap.className = "video-card";
  wrap.style.cssText = `
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 14px;
    overflow: hidden;
    position: relative;
    background: #111;
    cursor: pointer;
  `;

  const img = document.createElement("img");
  img.alt = `Видео ${idx + 1}`;
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: 0;
    transition: opacity 180ms ease;
    background: #000;
  `;

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
      width: 58px; height: 58px;
      border-radius: 999px;
      background: rgba(0,0,0,0.45);
      display:flex; align-items:center; justify-content:center;
    ">
      <div style="
        width:0; height:0;
        border-top:11px solid transparent;
        border-bottom:11px solid transparent;
        border-left:18px solid #fff;
        margin-left: 4px;
      "></div>
    </div>
  `;

  wrap.appendChild(img);
  wrap.appendChild(icon);

  wrap.addEventListener("click", () => {
    if (!active) return;
    openPlayer(idx);
  });

  // лёгкий прогрев кеша (не блокирует play)
  warmCache(srcUrl);

  // превью в фоне (очередь, чтобы не убить iOS)
  enqueuePreview(srcUrl, img);

  return { wrap, img, srcUrl };
}

function renderCards() {
  if (!listEl) return;

  listEl.innerHTML = "";
  cards = [];
  currentIndex = -1;

  const has = Array.isArray(videoList) && videoList.length > 0;
  if (emptyEl) emptyEl.style.display = has ? "none" : "block";
  if (!has) return;

  // сетка (адаптив)
  listEl.style.display = "grid";
  listEl.style.gridTemplateColumns = "1fr";
  listEl.style.gap = "12px";
  listEl.style.padding = "12px";
  listEl.style.overflowY = "auto";
  listEl.style.webkitOverflowScrolling = "touch";

  videoList.forEach((u, idx) => {
    const c = createCard(u, idx);
    cards.push(c);
    listEl.appendChild(c.wrap);
  });
}

// ============================
// UI: player + nav panel
// ============================

function ensurePlayerDom() {
  if (playerWrap) return;
  if (!overlayEl) return;

  overlayEl.style.position = overlayEl.style.position || "relative";

  playerWrap = document.createElement("div");
  playerWrap.className = "video-player-wrap";
  playerWrap.style.cssText = `
    position: absolute;
    inset: 0;
    display: none;
    background: #000;
    align-items: center;
    justify-content: center;
  `;

  // video element
  playerVideo = document.createElement("video");
  playerVideo.controls = true;
  playerVideo.preload = "metadata";
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.playsInline = true;

  playerVideo.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
    display: block;
  `;

  // metadata hack (таймлайн)
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch (e) {}
  });

  // loading overlay
  loadingEl = document.createElement("div");
  loadingEl.style.cssText = `
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    color: #fff;
    font: 600 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    background: rgba(0,0,0,0.35);
  `;
  loadingEl.textContent = "Загрузка…";

  // events
  playerVideo.addEventListener("play", () => {
    setLoading(false);
    hideNavPanel(); // панель должна быть скрыта на play
    if (onPlayCb) onPlayCb();
    document.body.classList.add("video-playing");
  });

  playerVideo.addEventListener("pause", () => {
    // панель должна появляться ТОЛЬКО на паузе
    showNavPanel();
    if (onPauseCb) onPauseCb();
    document.body.classList.remove("video-playing");
  });

  playerVideo.addEventListener("waiting", () => setLoading(true));
  playerVideo.addEventListener("playing", () => setLoading(false));
  playerVideo.addEventListener("canplay", () => setLoading(false));

  playerVideo.addEventListener("error", () => {
    setLoading(false);
    console.error("[video] player error:", playerVideo.error);
  });

  playerWrap.appendChild(playerVideo);
  playerWrap.appendChild(loadingEl);
  overlayEl.appendChild(playerWrap);
}

function ensureNavPanel() {
  if (navPanel) return;
  if (!tabsEl) return;

  tabsParent = tabsEl.parentElement; // .viewer-tabs-row
  if (!tabsParent) return;

  navPanel = document.createElement("div");
  navPanel.className = "video-nav-panel";
  navPanel.style.cssText = `
    display: none;
    width: 100%;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  `;

  const left = document.createElement("button");
  left.type = "button";
  left.textContent = "⬅ К карточкам";
  left.style.cssText = `
    appearance: none;
    border: 0;
    background: rgba(255,255,255,0.10);
    color: rgba(255,255,255,0.92);
    padding: 10px 12px;
    border-radius: 12px;
    font: 600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
  `;

  const mid = document.createElement("div");
  mid.style.cssText = `display:flex; gap:10px;`;

  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "⏮";
  prev.style.cssText = `
    appearance: none;
    border: 0;
    background: rgba(255,255,255,0.10);
    color: rgba(255,255,255,0.92);
    width: 44px;
    height: 40px;
    border-radius: 12px;
    font: 700 16px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
  `;

  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "⏭";
  next.style.cssText = `
    appearance: none;
    border: 0;
    background: rgba(255,255,255,0.10);
    color: rgba(255,255,255,0.92);
    width: 44px;
    height: 40px;
    border-radius: 12px;
    font: 700 16px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
  `;

  mid.appendChild(prev);
  mid.appendChild(next);

  navPanel.appendChild(left);
  navPanel.appendChild(mid);

  // вставляем панель рядом с табами, не уничтожая сами табы
  tabsParent.appendChild(navPanel);

  left.addEventListener("click", () => {
    closePlayerToCards();
  });

  prev.addEventListener("click", () => {
    if (!isPlayerOpen) return;
    // только когда paused (по UX панель видна на pause)
    openPlayer(clampIndex(currentIndex - 1));
  });

  next.addEventListener("click", () => {
    if (!isPlayerOpen) return;
    openPlayer(clampIndex(currentIndex + 1));
  });
}

function hideTabsShowPanel() {
  if (!tabsEl || !navPanel) return;
  tabsDisplayBackup = tabsEl.style.display || "";
  tabsEl.style.display = "none";
  navPanel.style.display = "flex";
}

function showTabsHidePanel() {
  if (!tabsEl || !navPanel) return;
  navPanel.style.display = "none";
  tabsEl.style.display = tabsDisplayBackup;
}

function showNavPanel() {
  if (!isPlayerOpen) return;
  ensureNavPanel();
  hideTabsShowPanel();
}

function hideNavPanel() {
  // на play панель должна скрываться, но табы не возвращаем (мы все ещё в player mode)
  if (!isPlayerOpen) return;
  if (!navPanel) return;
  navPanel.style.display = "none";
}

// ============================
// MODE SWITCH
// ============================

function showCardsMode() {
  isPlayerOpen = false;
  if (playerWrap) playerWrap.style.display = "none";
  if (listEl) listEl.style.display = "grid";
  showTabsHidePanel();
}

function showPlayerMode() {
  isPlayerOpen = true;
  if (listEl) listEl.style.display = "none";
  if (playerWrap) playerWrap.style.display = "flex";
  // панель показываем только если paused — поэтому пока скрыта
  hideNavPanel();
  if (tabsEl) tabsEl.style.display = "none"; // tab-бар прячем сразу, чтобы не мигал
}

// ============================
// PLAYBACK
// ============================

function openPlayer(index) {
  if (!active) return;
  if (!videoList || videoList.length === 0) return;

  index = clampIndex(index);
  currentIndex = index;

  ensurePlayerDom();
  ensureNavPanel();

  const srcUrl = cards[index]?.srcUrl || withInitData(videoList[index]);

  showPlayerMode();

  // iOS/TG safe: play сразу по gesture
  playerVideo.muted = true;
  playerVideo.src = srcUrl;
  playerVideo.load();

  setLoading(true);

  const p = playerVideo.play();
  warmCache(srcUrl);

  if (p && typeof p.catch === "function") {
    p.catch((e) => {
      // если autoplay не прошёл — пользователь нажмёт play в native controls
      setLoading(false);
      console.warn("[video] play() rejected:", e);
      // на паузе панель должна быть видна:
      showNavPanel();
    });
  }

  // снимаем mute после старта (когда реально пошло playing)
  const unmuteOnce = () => {
    playerVideo.removeEventListener("playing", unmuteOnce);
    try { playerVideo.muted = false; } catch (e) {}
  };
  playerVideo.addEventListener("playing", unmuteOnce, { passive: true });
}

function closePlayerToCards() {
  if (!playerVideo) {
    showCardsMode();
    return;
  }

  try { playerVideo.pause(); } catch (e) {}

  try {
    playerVideo.removeAttribute("src");
    playerVideo.load();
  } catch (e) {}

  setLoading(false);

  document.body.classList.remove("video-playing");
  if (onPauseCb) onPauseCb();

  showCardsMode();
}

// ============================
// PUBLIC API (viewer.js)
// ============================

export function initVideo(refs, callbacks = {}) {
  overlayEl = refs?.overlayEl || null;
  listEl = refs?.listEl || null;
  emptyEl = refs?.emptyEl || null;
  tabsEl = refs?.tabsEl || null;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  if (!overlayEl || !listEl) {
    console.error("initVideo: overlayEl/listEl not provided");
    return;
  }

  ensurePlayerDom();
  ensureNavPanel();

  showCardsMode();
}

export function activateVideo() {
  active = true;
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : (list ? [list] : []);
  renderCards();
  showCardsMode();
}

export function deactivateVideo() {
  active = false;

  // при выходе из вкладки видео — закрываем player
  if (isPlayerOpen) {
    closePlayerToCards();
  }

  // safety
  document.body.classList.remove("video-playing");
}