// js/video.js
//
// FINAL SPEC (фиксируем):
// 1) Вкладка Видео имеет 2 режима:
//    - Cards Mode: сетка карточек 16:9, превью = первый кадр, НЕТ <video> в карточках, табы 3D/Схема/Видео видимы
//    - Player Mode: карточки скрыты, один <video> занимает всю область вкладки, табы скрыты,
//      вместо табов появляется Video Nav Panel: [К карточкам] [Prev] [Next]
// 2) Video Nav Panel видна ТОЛЬКО когда видео на паузе
// 3) Выход из Player Mode: кнопка "К карточкам" ИЛИ переключение вкладки (deactivateVideo)
// 4) iOS/TG: нельзя await fetch/blob ДО play(). Поэтому:
//    - на клик: src=url + muted=true + play() сразу
//    - blob догружаем после старта (в фоне), при успехе подменяем src -> blob, сохраняя currentTime.
//
// НЕ трогаем cachedFetch.js — используем только warmCache().

import { cachedFetch } from "./cache/cachedFetch.js";

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let toolbarEl = null;
let tab3dBtn = null;
let tabSchemeBtn = null;
let tabVideoBtn = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];     // raw urls
let srcList = [];       // urls with initData
let currentIndex = -1;

// режимы
let isPlayerMode = false;

// ===== Player DOM (one <video>) =====
let playerWrap = null;     // container inside overlayEl
let playerVideo = null;    // the only <video>
let playerLoading = null;  // loading overlay

// ===== Nav panel (replaces tabs) =====
let navBar = null;
let btnBack = null;
let btnPrev = null;
let btnNext = null;

// ===== blob for TG iOS (only current) =====
let currentBlobUrl = null;
let blobLoading = false;

// ===== preview generator (single hidden decoder, NOT in cards) =====
let previewDecoder = null;

// ============================================================
// INIT
// ============================================================

export function initVideo(refs, callbacks = {}) {
  overlayEl = refs?.overlayEl || null;
  listEl = refs?.listEl || null;
  emptyEl = refs?.emptyEl || null;

  // toolbar / tabs host
  toolbarEl = refs?.toolbarEl || document.querySelector(".viewer-toolbar") || null;
  tab3dBtn = refs?.tab3dBtn || null;
  tabSchemeBtn = refs?.tabSchemeBtn || null;
  tabVideoBtn = refs?.tabVideoBtn || null;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  if (!overlayEl || !listEl) {
    console.error("initVideo: overlayEl/listEl not provided");
    return;
  }

  ensurePlayerDom();
  ensureNavBar();

  // старт всегда в cards mode
  showCardsMode(true);
}

// ============================================================
// HELPERS
// ============================================================

function isIOS() {
  const ua = navigator.userAgent || "";
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
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

function setLoading(on) {
  if (!playerLoading) return;
  playerLoading.style.display = on ? "flex" : "none";
}

function revokeBlob() {
  if (currentBlobUrl) {
    try { URL.revokeObjectURL(currentBlobUrl); } catch (e) {}
    currentBlobUrl = null;
  }
}

function hideTabsShowNav(showNav) {
  // табы (кнопки режимов)
  if (tab3dBtn) tab3dBtn.style.display = showNav ? "none" : "";
  if (tabSchemeBtn) tabSchemeBtn.style.display = showNav ? "none" : "";
  if (tabVideoBtn) tabVideoBtn.style.display = showNav ? "none" : "";

  // наша панель
  if (navBar) navBar.style.display = showNav ? "flex" : "none";
}

function showCardsMode(force = false) {
  if (!force && !isPlayerMode) return;

  isPlayerMode = false;
  if (listEl) listEl.style.display = "grid";
  if (playerWrap) playerWrap.style.display = "none";

  hideTabsShowNav(false);

  // стоп и очистка плеера
  if (playerVideo) {
    try { playerVideo.pause(); } catch (e) {}
    try {
      playerVideo.removeAttribute("src");
      playerVideo.load();
    } catch (e) {}
  }
  revokeBlob();
  blobLoading = false;

  // viewer.js пусть снимет video-playing при необходимости
  document.body.classList.remove("video-playing");
}

function showPlayerMode() {
  isPlayerMode = true;

  if (listEl) listEl.style.display = "none";
  if (playerWrap) playerWrap.style.display = "flex";

  // ВАЖНО: табы скрываем сразу, а панель покажем только на pause
  hideTabsShowNav(true);
  setNavVisible(false);
}

function setNavVisible(visible) {
  if (!navBar) return;
  // панель видна только когда paused
  navBar.style.visibility = visible ? "visible" : "hidden";
  navBar.style.pointerEvents = visible ? "auto" : "none";
}

// ============================================================
// PLAYER DOM
// ============================================================

function ensurePlayerDom() {
  if (playerWrap) return;

  // контейнер занимает всю вкладку (как 3D/Схема), внутри overlayEl
  playerWrap = document.createElement("div");
  playerWrap.className = "video-player-wrap";
  playerWrap.style.cssText = `
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    background: #000;
    overflow: hidden;
  `;

  playerVideo = document.createElement("video");
  playerVideo.preload = "metadata";
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.playsInline = true;

  // native controls: всегда есть, но UI будет вести себя так:
  // - когда играет: мы прячем нашу панель, controls остаются нативные
  // - когда пауза: показываем нашу панель, controls нативные видны (пользователь жмёт play)
  playerVideo.controls = true;

  playerVideo.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
    display: block;
  `;

  // таймлайн hack как в эталоне
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch (e) {}
  });

  playerLoading = document.createElement("div");
  playerLoading.style.cssText = `
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    color: #fff;
    font: 600 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    background: rgba(0,0,0,0.35);
  `;
  playerLoading.textContent = "Загрузка…";

  // events
  playerVideo.addEventListener("play", () => {
    setLoading(false);

    // Панель СКРЫТА на play
    setNavVisible(false);

    // viewer.js скрывает основной UI
    if (onPlayCb) onPlayCb();
    document.body.classList.add("video-playing");
  });

  playerVideo.addEventListener("pause", () => {
    // Панель ВИДНА только на pause
    if (isPlayerMode) setNavVisible(true);

    // viewer UI остаётся скрыт (мы не возвращаем табы)
    if (onPauseCb) onPauseCb();
    document.body.classList.remove("video-playing");
  });

  playerVideo.addEventListener("waiting", () => setLoading(true));
  playerVideo.addEventListener("playing", () => setLoading(false));
  playerVideo.addEventListener("canplay", () => setLoading(false));

  playerVideo.addEventListener("error", () => {
    setLoading(false);
    console.error("[video] player error:", playerVideo.error);
    // на паузе панель всё равно покажем, чтобы можно было выйти
    if (isPlayerMode) setNavVisible(true);
  });

  playerWrap.appendChild(playerVideo);
  playerWrap.appendChild(playerLoading);
  overlayEl.appendChild(playerWrap);
}

// ============================================================
// NAV BAR (replaces tabs location)
// ============================================================

function ensureNavBar() {
  if (navBar) return;

  if (!toolbarEl) {
    console.warn("[video] toolbarEl not found; nav bar will not mount");
    return;
  }

  navBar = document.createElement("div");
  navBar.className = "video-nav-bar";
  navBar.style.cssText = `
    display: none;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
  `;

  const mkBtn = (text) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.style.cssText = `
      appearance: none;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.95);
      border-radius: 999px;
      padding: 10px 12px;
      font: 600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    `;
    return b;
  };

  btnBack = mkBtn("⬅ К карточкам");
  btnPrev = mkBtn("⏮");
  btnNext = mkBtn("⏭");

  btnBack.addEventListener("click", () => {
    closeToCards();
  });

  btnPrev.addEventListener("click", () => {
    // переключение по панели допустимо только когда paused (панель видима)
    if (!isPlayerMode) return;
    switchTo(modIndex(currentIndex - 1), { autoplay: false });
  });

  btnNext.addEventListener("click", () => {
    if (!isPlayerMode) return;
    switchTo(modIndex(currentIndex + 1), { autoplay: false });
  });

  navBar.appendChild(btnBack);
  navBar.appendChild(btnPrev);
  navBar.appendChild(btnNext);

  // Вставляем в toolbarEl в КОНЕЦ (обычно там ряд табов)
  toolbarEl.appendChild(navBar);

  // по умолчанию спрятана
  setNavVisible(false);
}

function modIndex(i) {
  if (!videoList || videoList.length === 0) return -1;
  return (i + videoList.length) % videoList.length;
}

// ============================================================
// PREVIEWS (карточки без <video>)
// ============================================================

function ensurePreviewDecoder() {
  if (previewDecoder) return;

  previewDecoder = document.createElement("video");
  previewDecoder.muted = true;
  previewDecoder.preload = "metadata";
  previewDecoder.setAttribute("playsinline", "");
  previewDecoder.setAttribute("webkit-playsinline", "");
  previewDecoder.playsInline = true;
  previewDecoder.controls = false;

  // не в DOM — просто decoder
}

async function getFirstFrameDataUrl(srcUrl) {
  ensurePreviewDecoder();
  const v = previewDecoder;

  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(val);
    };

    const cleanup = () => {
      v.onloadedmetadata = null;
      v.onloadeddata = null;
      v.onseeked = null;
      v.onerror = null;
    };

    v.onerror = () => finish(null);

    v.onloadedmetadata = () => {
      // пробуем сместиться на микрофрейм
      try { v.currentTime = 0.05; } catch (e) {
        // если нельзя seek — попробуем loadeddata
      }
    };

    v.onloadeddata = () => {
      // если нет seek — пробуем сразу рисовать
      snap();
    };

    v.onseeked = () => {
      snap();
    };

    const snap = () => {
      try {
        const w = v.videoWidth || 0;
        const h = v.videoHeight || 0;
        if (!w || !h) return finish(null);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(v, 0, 0, w, h);

        // может упасть из-за CORS — тогда вернём null
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        finish(dataUrl);
      } catch (e) {
        finish(null);
      }
    };

    try {
      v.src = srcUrl;
      v.load();
    } catch (e) {
      finish(null);
    }

    // safety timeout
    setTimeout(() => finish(null), 2500);
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
    position: relative;
    background: #111;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  `;

  const img = document.createElement("img");
  img.alt = `Видео ${index + 1}`;
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #000;
  `;
  // пока грузится — оставим пустым (фон виден)
  img.src = "";

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

  wrap.appendChild(img);
  wrap.appendChild(icon);

  wrap.addEventListener("click", () => {
    if (!active) return;
    openFromCards(index);
  });

  // прогрев кеша не мешает
  warmCache(srcUrl);

  // асинхронно пробуем первый кадр
  getFirstFrameDataUrl(srcUrl).then((dataUrl) => {
    if (dataUrl) img.src = dataUrl;
  });

  return { wrap, url, srcUrl };
}

function render() {
  if (!listEl) return;

  listEl.innerHTML = "";

  // сетка карточек
  listEl.style.display = "grid";
  listEl.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  listEl.style.gap = "12px";
  listEl.style.padding = "12px";
  listEl.style.overflowY = "auto";
  listEl.style.webkitOverflowScrolling = "touch";

  const has = Array.isArray(videoList) && videoList.length > 0;
  if (emptyEl) emptyEl.style.display = has ? "none" : "block";
  if (!has) return;

  srcList = videoList.map(withInitData);

  videoList.forEach((url, idx) => {
    const card = createCard(url, idx);
    listEl.appendChild(card.wrap);
  });
}

// ============================================================
// OPEN / SWITCH / CLOSE
// ============================================================

function openFromCards(index) {
  showPlayerMode();
  switchTo(index, { autoplay: true });
}

function closeToCards() {
  showCardsMode(true);
  // когда закрыли — viewer UI можно показать (но viewer.js у тебя решает сам)
  // мы ничего не ломаем, только выключаем свой режим
}

function switchTo(index, { autoplay }) {
  if (!playerVideo) return;
  if (!videoList || videoList.length === 0) return;

  if (index < 0) index = videoList.length - 1;
  if (index >= videoList.length) index = 0;

  currentIndex = index;

  // очистка blob прошлого видео
  revokeBlob();
  blobLoading = false;

  const srcUrl = srcList[index] || withInitData(videoList[index]);

  // IMPORTANT for iOS: play() must be in the same gesture, no await before it.
  playerVideo.muted = true;
  playerVideo.src = srcUrl;
  playerVideo.load();

  setLoading(true);

  if (autoplay) {
    // autoplay attempt (muted) immediately
    const p = playerVideo.play();

    // прогрев кэша после старта
    warmCache(srcUrl);

    if (p && typeof p.catch === "function") {
      p.catch((e) => {
        // если отказано — оставляем paused, панель появится (потому что paused)
        setLoading(false);
        console.warn("[video] play() rejected:", e);
        // показать панель, чтобы можно было выйти/переключить
        setNavVisible(true);
      });
    }

    // unmute only after real playing
    const unmuteOnce = () => {
      playerVideo.removeEventListener("playing", unmuteOnce);
      try { playerVideo.muted = false; } catch (e) {}
    };
    playerVideo.addEventListener("playing", unmuteOnce);
  } else {
    // без autoplay: держим paused, но готовы к play нативной кнопкой
    try { playerVideo.pause(); } catch (e) {}
    setLoading(false);
    setNavVisible(true);
  }

  // iOS helper: blob after start (or after load) to avoid "crossed play" in TG iOS
  if (isIOS()) {
    // НЕ await
    setTimeout(() => loadBlobAfterStart(srcUrl), 0);
  }
}

async function loadBlobAfterStart(srcUrl) {
  if (!playerVideo) return;
  if (!srcUrl) return;
  if (blobLoading) return;
  blobLoading = true;

  try {
    // если уже blob — не делаем
    if (playerVideo.src && playerVideo.src.startsWith("blob:")) return;

    const resp = await fetch(srcUrl);
    const blob = await resp.blob();

    revokeBlob();
    const objUrl = URL.createObjectURL(blob);
    currentBlobUrl = objUrl;

    // сохраняем состояние
    const wasPaused = playerVideo.paused;
    let t = 0;
    try { t = playerVideo.currentTime || 0; } catch (e) {}

    playerVideo.src = objUrl;
    playerVideo.load();

    // восстановим time и поведение
    playerVideo.addEventListener(
      "loadedmetadata",
      () => {
        try {
          playerVideo.currentTime = 0.001;
          playerVideo.currentTime = 0;
        } catch (e) {}

        try {
          if (t > 0.2) playerVideo.currentTime = t;
        } catch (e) {}

        if (!wasPaused) {
          // если было playing — попробуем продолжить (muted не трогаем)
          const p = playerVideo.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
      },
      { once: true, passive: true }
    );
  } catch (e) {
    // игнор — остаёмся на direct url
  } finally {
    blobLoading = false;
  }
}

// ============================================================
// PUBLIC API (viewer.js)
// ============================================================

export function activateVideo() {
  active = true;
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : (list ? [list] : []);
  currentIndex = -1;

  render();

  // всегда в cards mode при обновлении списка
  showCardsMode(true);
}

export function deactivateVideo() {
  active = false;

  // при уходе из вкладки — закрываем плеер в карточки
  if (isPlayerMode) {
    showCardsMode(true);
  }

  // safety
  document.body.classList.remove("video-playing");
}