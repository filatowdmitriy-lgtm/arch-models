// js/video.js
//
// ГОТОВАЯ стабильная версия:
// - карточки = div
// - один общий <video>
// - Telegram iOS: fetch -> blob -> objectURL (как эталон)
// - Desktop/Android: прямой src (стриминг, старт мгновенный)
// - pause НЕ закрывает плеер (возврат в карточки только по кнопке ✕)
// - защита от гонок + корректный revoke blob

let overlayEl = null;
let listEl = null;
let emptyEl = null;

let videoEl = null;
let closeBtn = null;

let currentBlobUrl = null;
let loadToken = 0;

let videoList = [];
let videoIndex = 0;

let active = false;
let isPlaying = false;

let onPlayCb = null;
let onPauseCb = null;

// свайп
let swipeStartX = 0;
let swipeStartY = 0;

function isTelegramWebView() {
  try {
    return !!(window.Telegram && window.Telegram.WebApp);
  } catch {
    return false;
  }
}

// Важно: iOS Safari/WebView часто блокирует/ломает play по URL в TG.
// Поэтому для TG+iOS используем blob, для остальных — обычный src.
function isIOS() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
}

function shouldUseBlob() {
  return isTelegramWebView() && isIOS();
}

function withInitData(url) {
  try {
    if (!window.TG_INIT_DATA) return url;
    const u = new URL(url, location.href);
    if (!u.searchParams.get("initData")) {
      u.searchParams.set("initData", window.TG_INIT_DATA);
    }
    return u.toString();
  } catch {
    return url;
  }
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

  createPlayer();
}

// ============================================================
// PLAYER
// ============================================================

function createPlayer() {
  if (videoEl) return;

  // контейнер overlayEl у тебя flex, поэтому делаем video absolute поверх
  videoEl = document.createElement("video");
  videoEl.controls = true;
  videoEl.preload = "metadata";
  videoEl.setAttribute("playsinline", "");
  videoEl.setAttribute("webkit-playsinline", "");
  videoEl.playsInline = true;

  // В Telegram iOS часто помогает старт через muted
  videoEl.muted = true;

  videoEl.style.position = "absolute";
  videoEl.style.inset = "0";
  videoEl.style.width = "100%";
  videoEl.style.height = "100%";
  videoEl.style.background = "#000";
  videoEl.style.display = "none";
  videoEl.style.zIndex = "10";

  // metadata hack — как в эталоне
  videoEl.addEventListener("loadedmetadata", () => {
    try {
      videoEl.currentTime = 0.001;
      videoEl.currentTime = 0;
    } catch {}
  });

  videoEl.addEventListener("play", () => {
    isPlaying = true;
    // снимаем mute ПОСЛЕ старта (iOS)
    try { videoEl.muted = false; } catch {}
    if (onPlayCb) onPlayCb();
  });

  // ❗ВАЖНО: pause НЕ закрывает плеер
  videoEl.addEventListener("pause", () => {
    isPlaying = false;
    if (onPauseCb) onPauseCb();
  });

  // свайп — только когда НЕ играет
  videoEl.addEventListener(
    "touchstart",
    (e) => {
      if (!active) return;
      if (isPlaying) return;
      if (!videoList || videoList.length <= 1) return;
      if (e.touches.length !== 1) return;

      const t = e.touches[0];
      swipeStartX = t.clientX;
      swipeStartY = t.clientY;
    },
    { passive: true }
  );

  videoEl.addEventListener(
    "touchend",
    (e) => {
      if (!active) return;
      if (isPlaying) return;
      if (!videoList || videoList.length <= 1) return;

      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - swipeStartX;
      const dy = t.clientY - swipeStartY;

      if (Math.abs(dx) <= Math.abs(dy)) return;

      const TH = 50;
      if (dx < -TH) nextVideo();
      if (dx > TH) prevVideo();
    },
    { passive: true }
  );

  // кнопка закрыть (вместо “возврат по pause”)
  closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "10px";
  closeBtn.style.right = "10px";
  closeBtn.style.zIndex = "11";
  closeBtn.style.width = "40px";
  closeBtn.style.height = "40px";
  closeBtn.style.borderRadius = "20px";
  closeBtn.style.border = "0";
  closeBtn.style.background = "rgba(0,0,0,0.55)";
  closeBtn.style.color = "#fff";
  closeBtn.style.fontSize = "18px";
  closeBtn.style.display = "none";

  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeVideo();
  });

  // overlayEl должен быть relative чтобы absolute работал предсказуемо
  const cs = getComputedStyle(overlayEl);
  if (cs.position === "static") overlayEl.style.position = "relative";

  overlayEl.appendChild(videoEl);
  overlayEl.appendChild(closeBtn);
}

// ============================================================
// LOAD (BLOB / DIRECT)
// ============================================================

async function loadVideo(url) {
  if (!videoEl) return;

  const token = ++loadToken;

  const finalUrl = withInitData(url);

  // перед загрузкой — стоп/сброс (уменьшает глюки в TG WebView)
  try { videoEl.pause(); } catch {}
  try {
    videoEl.removeAttribute("src");
    videoEl.load();
  } catch {}

  // ⚠️ revoke старого blob делаем ТОЛЬКО после сброса src
  if (currentBlobUrl) {
    try { URL.revokeObjectURL(currentBlobUrl); } catch {}
    currentBlobUrl = null;
  }

  if (!finalUrl) return;

  // iOS TG — blob
  if (shouldUseBlob()) {
    try {
      const resp = await fetch(finalUrl, { cache: "no-store" });
      const blob = await resp.blob();

      // если за время fetch уже выбрали другое видео — выходим без установки src
      if (token !== loadToken) return;

      const objUrl = URL.createObjectURL(blob);
      currentBlobUrl = objUrl;

      videoEl.src = objUrl;
      videoEl.load();
      return;
    } catch (e) {
      console.error("blob load error:", e);
      return;
    }
  }

  // остальные — прямой src (стриминг)
  try {
    videoEl.src = finalUrl;
    videoEl.load();
  } catch (e) {
    console.error("direct src error:", e);
  }
}

// ============================================================
// OPEN / CLOSE
// ============================================================

function openVideo(index) {
  if (!active) return;
  if (!videoList || !videoList.length) return;

  videoIndex = index;

  // показываем плеер
  listEl.style.display = "none";
  if (emptyEl) emptyEl.style.display = "none";

  videoEl.style.display = "block";
  closeBtn.style.display = "block";

  loadVideo(videoList[videoIndex]).then(() => {
    // iOS часто требует muted перед play
    try { videoEl.muted = true; } catch {}

    const p = videoEl.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  });
}

function closeVideo() {
  // закрытие только явным действием
  try { videoEl.pause(); } catch {}

  videoEl.style.display = "none";
  closeBtn.style.display = "none";

  listEl.style.display = "block";

  // сброс src + revoke blob
  try {
    videoEl.removeAttribute("src");
    videoEl.load();
  } catch {}

  if (currentBlobUrl) {
    try { URL.revokeObjectURL(currentBlobUrl); } catch {}
    currentBlobUrl = null;
  }
}

// ============================================================
// SWIPE
// ============================================================

function nextVideo() {
  if (!videoList || videoList.length <= 1) return;
  videoIndex = (videoIndex + 1) % videoList.length;
  loadVideo(videoList[videoIndex]);
}

function prevVideo() {
  if (!videoList || videoList.length <= 1) return;
  videoIndex = (videoIndex - 1 + videoList.length) % videoList.length;
  loadVideo(videoList[videoIndex]);
}

// ============================================================
// LIST
// ============================================================

function renderList() {
  listEl.innerHTML = "";

  const has = Array.isArray(videoList) && videoList.length > 0;
  if (emptyEl) emptyEl.style.display = has ? "none" : "block";
  if (!has) return;

  videoList.forEach((url, i) => {
    const card = document.createElement("div");
    card.className = "video-card";

    // карточки нейтральные, чтобы не "сливались"
    card.style.height = "150px";
    card.style.borderRadius = "12px";
    card.style.background = "rgba(255,255,255,0.10)";
    card.style.marginBottom = "12px";
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.justifyContent = "center";
    card.style.fontSize = "18px";
    card.style.userSelect = "none";

    card.textContent = "▶ Видео " + (i + 1);

    card.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openVideo(i);
    });

    listEl.appendChild(card);
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
  videoIndex = 0;
  renderList();
}

export function deactivateVideo() {
  active = false;

  // при выходе из вкладки — закрываем плеер полностью
  try { closeVideo(); } catch {}

  document.body.classList.remove("video-playing");
}
