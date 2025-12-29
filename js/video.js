// js/video.js
//
// FINAL UI + STREAMING PLAYBACK (base: Variant B logic)
//
// СПЕЦИФИКАЦИЯ:
// 1) Cards mode:
//    - сетка карточек 16:9
//    - превью = первый кадр (img), в карточках НЕТ <video>
//    - скролл работает
//    - табы 3D/Построение/Видео видны (viewer.js)
//
// 2) Player mode:
//    - по клику на карточку скрываем cards, показываем ОДИН <video> на всю вкладку
//    - табы скрываем
//    - вместо табов показываем панель: [⬅ К карточкам] [⏮] [⏭]
//    - панель видна ТОЛЬКО на pause
//    - пауза НЕ выход в карточки
//
// Важно:
// - playback всегда через обычный srcUrl (стрим) => НЕ blob, НЕ full download
// - никаких cachedFetch/fetch-blob для playback. cachedFetch можно вернуть позже,
//   но сейчас он создаёт ощущение "скачал целиком" => отключаем для дедлайна.

let overlayEl = null;
let listEl = null;
let emptyEl = null;

// refs из viewer.js для управления табами
let tabsHostEl = null;
let tab3dBtn = null;
let tabSchemeBtn = null;
let tabVideoBtn = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = [];
let currentIndex = -1;

// Cards
let cards = []; // { wrap, img, srcUrl }

// Player
let playerWrap = null;
let playerVideo = null;
let playerLoading = null;

// Панель навигации (живет там же, где табы)
let navBarEl = null;
let navBackBtn = null;
let navPrevBtn = null;
let navNextBtn = null;

// режим
let mode = "cards"; // "cards" | "player"

// ============================================================
// INIT
// ============================================================

export function initVideo(refs, callbacks = {}) {
  overlayEl = refs?.overlayEl || null;
  listEl = refs?.listEl || null;
  emptyEl = refs?.emptyEl || null;

  // NEW: прокидываем из viewer.js
  tabsHostEl = refs?.tabsHostEl || null;
  tab3dBtn = refs?.tab3dBtn || null;
  tabSchemeBtn = refs?.tabSchemeBtn || null;
  tabVideoBtn = refs?.tabVideoBtn || null;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  if (!overlayEl || !listEl) {
    console.error("initVideo: overlayEl/listEl not provided");
    return;
  }

  // Список — сетка карточек
  listEl.innerHTML = "";
  listEl.style.display = "grid";
  listEl.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  listEl.style.gap = "12px";
  listEl.style.padding = "12px";
  listEl.style.overflowY = "auto";
  listEl.style.webkitOverflowScrolling = "touch";

  ensurePlayerDom();
  ensureNavBar();

  // старт
  showCardsMode();
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

function setEmptyVisible(isEmpty) {
  if (!emptyEl) return;
  emptyEl.style.display = isEmpty ? "block" : "none";
}

function hideTabsShowNav() {
  if (tab3dBtn) tab3dBtn.style.display = "none";
  if (tabSchemeBtn) tabSchemeBtn.style.display = "none";
  if (tabVideoBtn) tabVideoBtn.style.display = "none";
  if (navBarEl) navBarEl.style.display = "flex";
}

function showTabsHideNav() {
  if (navBarEl) navBarEl.style.display = "none";
  if (tab3dBtn) tab3dBtn.style.display = "";
  if (tabSchemeBtn) tabSchemeBtn.style.display = "";
  if (tabVideoBtn) tabVideoBtn.style.display = "";
}

function setNavVisible(visible) {
  // панель должна быть видна ТОЛЬКО на pause
  if (!navBarEl) return;
  navBarEl.style.visibility = visible ? "visible" : "hidden";
  navBarEl.style.pointerEvents = visible ? "auto" : "none";
}

function setLoading(on) {
  if (!playerLoading) return;
  playerLoading.style.display = on ? "flex" : "none";
}

function stopPlayer() {
  if (!playerVideo) return;
  try { playerVideo.pause(); } catch (e) {}
  try {
    playerVideo.removeAttribute("src");
    playerVideo.load();
  } catch (e) {}
  setLoading(false);
}

// ============================================================
// NAV BAR (вместо табов)
// ============================================================

function ensureNavBar() {
  if (navBarEl) return;

  // Если refs не передали — попробуем найти контейнер табов (на всякий)
  if (!tabsHostEl) {
    tabsHostEl = document.querySelector(".viewer-toolbar") || null;
  }
  if (!tabsHostEl) {
    console.warn("[video] tabsHostEl not provided; nav bar won't mount properly");
    return;
  }

  navBarEl = document.createElement("div");
  navBarEl.className = "video-nav-bar";
  navBarEl.style.cssText = `
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
  `;

  const left = document.createElement("button");
  left.type = "button";
  left.textContent = "⬅ К карточкам";
  left.style.cssText = baseBtnCss();

  const mid = document.createElement("div");
  mid.style.cssText = `display:flex; gap:10px; align-items:center; justify-content:center; flex:0 0 auto;`;

  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "⏮";
  prev.style.cssText = baseBtnCss(true);

  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "⏭";
  next.style.cssText = baseBtnCss(true);

  mid.appendChild(prev);
  mid.appendChild(next);

  navBarEl.appendChild(left);
  navBarEl.appendChild(mid);

  tabsHostEl.appendChild(navBarEl);

  navBackBtn = left;
  navPrevBtn = prev;
  navNextBtn = next;

  navBackBtn.addEventListener("click", () => {
    closePlayerToCards();
  });
  navPrevBtn.addEventListener("click", () => {
    if (currentIndex < 0) return;
    openVideoByIndex(currentIndex - 1, { autoplay: false }); // мы на паузе
  });
  navNextBtn.addEventListener("click", () => {
    if (currentIndex < 0) return;
    openVideoByIndex(currentIndex + 1, { autoplay: false });
  });

  // по умолчанию скрыта полностью
  setNavVisible(false);
}

function baseBtnCss(round = false) {
  if (round) {
    return `
      width: 44px; height: 34px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.22);
      background: rgba(255,255,255,0.10);
      color: rgba(255,255,255,0.92);
      font: 600 16px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    `;
  }
  return `
    height: 34px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.22);
    background: rgba(255,255,255,0.10);
    color: rgba(255,255,255,0.92);
    font: 600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    white-space: nowrap;
  `;
}

// ============================================================
// PLAYER DOM (внутри overlayEl, на всю область вкладки)
// ============================================================

function ensurePlayerDom() {
  if (playerWrap) return;

  // overlayEl обычно flex, делаем relative чтобы absolute player работал
  try {
    const st = window.getComputedStyle(overlayEl);
    if (st.position === "static") overlayEl.style.position = "relative";
  } catch (e) {
    overlayEl.style.position = "relative";
  }

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
  playerVideo.controls = true;
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

  // метадата хак (таймлайн)
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
    background: rgba(0,0,0,0.35);
    color: #fff;
    font: 600 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
  `;
  playerLoading.textContent = "Загрузка…";

  // События play/pause -> UI
  playerVideo.addEventListener("play", () => {
    setLoading(false);

    // при play панель скрыта
    setNavVisible(false);

    // viewer.js: спрятать остальной UI (как раньше)
    if (onPlayCb) onPlayCb();
    document.body.classList.add("video-playing");
  });

  playerVideo.addEventListener("pause", () => {
    // при pause панель видна
    setNavVisible(true);

    if (onPauseCb) onPauseCb();
    document.body.classList.remove("video-playing");
  });

  // buffering
  playerVideo.addEventListener("waiting", () => setLoading(true));
  playerVideo.addEventListener("playing", () => setLoading(false));
  playerVideo.addEventListener("canplay", () => setLoading(false));

  playerVideo.addEventListener("error", () => {
    setLoading(false);
    console.error("[video] player error:", playerVideo.error);
    // если ошибка — панель оставим видимой (чтобы можно было выйти)
    setNavVisible(true);
  });

  playerWrap.appendChild(playerVideo);
  playerWrap.appendChild(playerLoading);

  overlayEl.appendChild(playerWrap);
}

// ============================================================
// MODES
// ============================================================

function showCardsMode() {
  mode = "cards";
  currentIndex = -1;

  // player off
  if (playerWrap) playerWrap.style.display = "none";
  stopPlayer();

  // list on
  if (listEl) listEl.style.display = "grid";

  // табы видны
  showTabsHideNav();

  // viewer ui normal
  document.body.classList.remove("video-playing");
  setNavVisible(false);
}

function showPlayerMode() {
  mode = "player";

  // list off
  if (listEl) listEl.style.display = "none";

  // player on
  if (playerWrap) playerWrap.style.display = "flex";

  // табы скрыть, нав показать (но пока невидима до паузы)
  hideTabsShowNav();
  setNavVisible(false);
}

// ============================================================
// CARDS (16:9 + PREVIEW IMG, no <video> in cards)
// ============================================================

function createCard(rawUrl, idx) {
  const srcUrl = withInitData(rawUrl);

  const wrap = document.createElement("div");
  wrap.className = "video-card";
  wrap.style.cssText = `
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    background: #111;
    border: 1px solid rgba(255,255,255,0.08);
  `;

  const img = document.createElement("img");
  img.alt = `Видео ${idx + 1}`;
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #000;
  `;
  img.src = ""; // поставим позже

  // play icon overlay
  const icon = document.createElement("div");
  icon.style.cssText = `
    position: absolute;
    inset: 0;
    display:flex;
    align-items:center;
    justify-content:center;
    pointer-events:none;
  `;
  icon.innerHTML = `
    <div style="
      width:56px; height:56px;
      border-radius:999px;
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
    openVideoByIndex(idx, { autoplay: true });
  });

  // превью (асинхронно, не ломает UI)
  setCardPreview(img, srcUrl);

  return { wrap, img, srcUrl };
}

function renderCards() {
  if (!listEl) return;

  listEl.innerHTML = "";
  cards = [];
  currentIndex = -1;

  const has = Array.isArray(videoList) && videoList.length > 0;
  setEmptyVisible(!has);
  if (!has) return;

  // если 1 видео — делаем 1 колонку, чтобы было крупнее
  if (videoList.length === 1) {
    listEl.style.gridTemplateColumns = "repeat(1, minmax(0, 1fr))";
  } else {
    listEl.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  }

  videoList.forEach((u, idx) => {
    const card = createCard(u, idx);
    cards.push(card);
    listEl.appendChild(card.wrap);
  });
}

// Превью: делаем кадр через скрытый video+canvas (не вставляем video в карточку)
async function setCardPreview(imgEl, srcUrl) {
  if (!imgEl || !srcUrl) return;

  // кэш
  // (если превью уже снято — ставим мгновенно)
  // ключ: srcUrl
  try {
    // простая мем-кеш логика:
    if (imgEl.__prevKey === srcUrl && imgEl.src) return;
    imgEl.__prevKey = srcUrl;
  } catch (e) {}

  // быстрый fallback: тёмное превью до кадра
  imgEl.style.filter = "brightness(0.8)";

  // iOS / TG: генерация превью может быть нестабильной без user gesture.
  // Но мы пробуем. Если не выйдет — просто останется темный фон.
  try {
    const frameUrl = await captureFirstFrame(srcUrl);
    if (frameUrl) {
      imgEl.src = frameUrl;
      imgEl.style.filter = "";
    }
  } catch (e) {
    // молча
  }
}

// Снимаем первый кадр
function captureFirstFrame(srcUrl) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.playsInline = true;
    v.crossOrigin = "anonymous"; // если сервер разрешает CORS — получится
    v.src = srcUrl;

    const clean = () => {
      try { v.pause(); } catch (e) {}
      v.removeAttribute("src");
      try { v.load(); } catch (e) {}
    };

    const fail = () => {
      clean();
      resolve(null);
    };

    const onReady = () => {
      // пробуем прыгнуть на микросекунду чтобы появился кадр
      try {
        v.currentTime = 0.001;
      } catch (e) {
        // иногда нельзя — ок
      }

      // даём чуть времени декодеру
      setTimeout(() => {
        try {
          const w = v.videoWidth || 0;
          const h = v.videoHeight || 0;
          if (!w || !h) return fail();

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(v, 0, 0, w, h);

          // если CORS не разрешён, тут будет SecurityError
          const data = canvas.toDataURL("image/jpeg", 0.82);
          clean();
          resolve(data);
        } catch (e) {
          fail();
        }
      }, 120);
    };

    v.addEventListener("loadeddata", onReady, { once: true, passive: true });
    v.addEventListener("error", fail, { once: true, passive: true });

    // принудительно начинаем загрузку метадаты
    try { v.load(); } catch (e) {}
  });
}

// ============================================================
// PLAYBACK (стрим, iOS-safe gesture)
// ============================================================

function clampIndex(idx) {
  if (!videoList || videoList.length === 0) return -1;
  if (idx < 0) return videoList.length - 1;
  if (idx >= videoList.length) return 0;
  return idx;
}

function openVideoByIndex(idx, opts = { autoplay: true }) {
  if (!active) return;
  if (!videoList || !videoList.length) return;

  idx = clampIndex(idx);
  if (idx < 0) return;

  currentIndex = idx;

  const srcUrl = cards[idx]?.srcUrl || withInitData(videoList[idx]);

  showPlayerMode();

  // Ставим src (стрим)
  playerVideo.muted = true; // старт muted для iOS
  playerVideo.src = srcUrl;
  try { playerVideo.load(); } catch (e) {}

  setLoading(true);

  // Если autoplay=true — пытаемся play() прямо из клика по карточке (gesture!)
  if (opts.autoplay) {
    const p = playerVideo.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        // если iOS отклонил autoplay — оставим на паузе
        setLoading(false);
        // покажем панель (pause state)
        setNavVisible(true);
      });
    }
  } else {
    // мы открываем на паузе (переключение prev/next) — панель должна быть видна
    setLoading(false);
    setNavVisible(true);
  }

  // снять mute когда реально playing
  const unmuteOnce = () => {
    playerVideo.removeEventListener("playing", unmuteOnce);
    try { playerVideo.muted = false; } catch (e) {}
  };
  playerVideo.addEventListener("playing", unmuteOnce);
}

function closePlayerToCards() {
  // остановить и вернуться
  stopPlayer();
  showCardsMode();

  // viewer.js UI вернуть
  if (onPauseCb) onPauseCb();
}

// ============================================================
// PUBLIC API
// ============================================================

export function activateVideo() {
  active = true;
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : (list ? [list] : []);
  renderCards();
  // при смене списка — вернуться в cards
  showCardsMode();
}

export function deactivateVideo() {
  active = false;

  // если были в player — закрываем
  if (mode === "player") {
    closePlayerToCards();
  }

  // safety
  document.body.classList.remove("video-playing");
  setNavVisible(false);
  showTabsHideNav();

  stopPlayer();
}