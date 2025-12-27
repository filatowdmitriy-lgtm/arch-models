// js/scheme.js
//
// Модуль просмотра схем.
// Реализует:
// - fit-to-screen масштабирование;
// - zoomAtPoint (колёсико и pinch);
// - панорамирование;
// - свайпы между схемами (если их несколько);
// - double tap zoom/reset;
// - авто-скрытие UI при большом масштабе;
// - временное появление UI при тапе.
//
// НЕ знает о viewer, three.js, моделях и видео.
// Работает строго с overlayElement и imgElement.
//
// Использование:
// import { initScheme, setSchemeImages, activateScheme, deactivateScheme } from "./scheme.js";
// initScheme({ overlayEl: ..., imgEl: ..., onUiVisibility: (hidden) => {} });
// setSchemeImages(model.schemes);
// activateScheme();
// deactivateScheme();

import { cachedFetch } from "./cache/cachedFetch.js";
let currentSchemeBlobUrl = null;
let preloadedScheme = {
  index: null,
  blobUrl: null
};

let overlay = null;
let img = null;

let images = [];  // массив URL схем
let activeIndex = 0;


// Масштаб
let baseScale = 1;      // fit-to-screen
let userScale = 1;      // zoom от 1 до 4
// Смещения
let tx = 0;
let ty = 0;

// Drag state
let isDragging = false;
let lastX = 0;
let lastY = 0;

// Touch state
let touchMode = null;
let lastPinchDist = 0;

// Swipe detection
let swipeStartX = 0;
let swipeStartY = 0;
let swipeEndX = 0;
let swipeEndY = 0;

// === ADDED: swipe-follow state (drag + snap) ===
let swipeFollowX = 0;
let swipeAnimating = false;
// === END ADDED ===

// UI auto-hide
let uiHidden = false;
let uiShowTimer = null;

// Callback в viewer.js
let onUiVisibilityChange = null;

// Текущий режим вкладки: активирована схема или нет
let active = false;


/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */

export function initScheme({ overlayEl, imgEl, onUiVisibility }) {
  overlay = overlayEl;
  img = imgEl;
  onUiVisibilityChange = onUiVisibility || null;

  if (!overlay || !img) {
    console.error("scheme.js: overlay/img not provided");
    return;
  }

  // Сбрасываем стиль, чтобы управлять трансформами сами
  img.style.transformOrigin = "0 0";
  img.style.userSelect = "none";
  img.draggable = false;

  // На загрузку картинки — сброс трансформа
  img.addEventListener("load", () => {
    if (!active) return;
    resetTransform();
  });

  attachEvents();
}

/* ============================================================
   УСТАНОВКА СПИСКА ИЗОБРАЖЕНИЙ (m.schemes)
   ============================================================ */

export async function setSchemeImages(urlList) {
  images = Array.isArray(urlList) ? urlList.slice() : [];
  activeIndex = 0;

  if (!images.length || !img) return;

  await loadSchemeAtIndex(0);
}
async function loadSchemeAtIndex(index) {
  if (!images[index] || !img) return;

  // ОСВОБОЖДАЕМ ПРЕДЫДУЩУЮ СХЕМУ
  if (currentSchemeBlobUrl) {
    URL.revokeObjectURL(currentSchemeBlobUrl);
    currentSchemeBlobUrl = null;
  }

  try {
    // если схема уже предзагружена — используем её
if (preloadedScheme.index === index && preloadedScheme.blobUrl) {
  currentSchemeBlobUrl = preloadedScheme.blobUrl;
  preloadedScheme.index = null;
  preloadedScheme.blobUrl = null;
} else {
  const blob = await cachedFetch(images[index]);
  currentSchemeBlobUrl = URL.createObjectURL(blob);
}

activeIndex = index;
img.src = currentSchemeBlobUrl;

// preload следующей схемы
preloadScheme((index + 1) % images.length);
  } catch (err) {
    console.error("Scheme load failed:", images[index], err);
  }
}

async function preloadScheme(index) {
  if (!images[index]) return;
  if (preloadedScheme.index === index) return;

  // освобождаем предыдущий preload
  if (preloadedScheme.blobUrl) {
    URL.revokeObjectURL(preloadedScheme.blobUrl);
    preloadedScheme.blobUrl = null;
  }

  try {
    const blob = await cachedFetch(images[index]);
    const blobUrl = URL.createObjectURL(blob);

    preloadedScheme.index = index;
    preloadedScheme.blobUrl = blobUrl;
  } catch (err) {
    console.warn("Scheme preload failed:", images[index], err);
  }
}


/* ============================================================
   АКТИВАЦИЯ / ДЕАКТИВ
   ============================================================ */

export function activateScheme() {
  active = true;
  resetTransform();
}

export function deactivateScheme() {
  active = false;
  hideUi(false);

  if (currentSchemeBlobUrl) {
    URL.revokeObjectURL(currentSchemeBlobUrl);
    currentSchemeBlobUrl = null;
  }
  if (preloadedScheme.blobUrl) {
  URL.revokeObjectURL(preloadedScheme.blobUrl);
  preloadedScheme.blobUrl = null;
  preloadedScheme.index = null;
}
}




/* ============================================================
   TRANSFORM HELPERS
   ============================================================ */

function computeFitScale() {
  if (!overlay || !img) return 1;

  const rect = overlay.getBoundingClientRect();
  const w = img.naturalWidth || rect.width;
  const h = img.naturalHeight || rect.height;

  if (!w || !h) return 1;

  const scale = Math.min(rect.width / w, rect.height / h);
  return scale > 0 ? scale : 1;
}

/* ============================================================
   APPLY TRANSFORM
   ============================================================ */

function applyTransform() {
  if (!overlay || !img) return;

  const rect = overlay.getBoundingClientRect();

  const total = baseScale * userScale;

  const imgW = (img.naturalWidth || rect.width) * total;
  const imgH = (img.naturalHeight || rect.height) * total;

  const baseX = (rect.width - imgW) / 2;
  const baseY = (rect.height - imgH) / 2;

  // === ADDED: swipe-follow (drag) offset + transition control ===
  const swipeX = (touchMode === "swipe" ? swipeFollowX : 0);
  if (!swipeAnimating) img.style.transition = "none";
  // === END ADDED ===

  const x = baseX + tx + swipeX;
  const y = baseY + ty;

  img.style.transform = `translate(${x}px, ${y}px) scale(${total})`;

  updateUiAutoHide();
}

/* ============================================================
   ZOOM-AT-POINT (колесо и pinch)
   ============================================================ */

function zoomAtPoint(clientX, clientY, newUserScale) {
  if (!overlay || !img) return;

  const rect = overlay.getBoundingClientRect();

  const prevUser = userScale;
  const nextUser = Math.max(1, Math.min(4, newUserScale));

  if (Math.abs(nextUser - prevUser) < 0.0001) return;

  // Координата точки в overlay
  const px = clientX - rect.left;
  const py = clientY - rect.top;

  const prevTotal = baseScale * prevUser;
  const nextTotal = baseScale * nextUser;

  // Позиция картинки в overlay до изменения
  const imgWPrev = (img.naturalWidth || rect.width) * prevTotal;
  const imgHPrev = (img.naturalHeight || rect.height) * prevTotal;

  const baseXPrev = (rect.width - imgWPrev) / 2;
  const baseYPrev = (rect.height - imgHPrev) / 2;

  const beforeX = baseXPrev + tx;
  const beforeY = baseYPrev + ty;

  // Точка в координатах картинки (до масштаба)
  const ix = (px - beforeX) / prevTotal;
  const iy = (py - beforeY) / prevTotal;

  // Позиция картинки в overlay после изменения
  const imgWNext = (img.naturalWidth || rect.width) * nextTotal;
  const imgHNext = (img.naturalHeight || rect.height) * nextTotal;

  const baseXNext = (rect.width - imgWNext) / 2;
  const baseYNext = (rect.height - imgHNext) / 2;

  // Хотим чтобы ix/iy остались под курсором px/py
  const afterX = px - ix * nextTotal;
  const afterY = py - iy * nextTotal;

  tx = afterX - baseXNext;
  ty = afterY - baseYNext;

  userScale = nextUser;

  // Если возвращаемся к 1 — сбрасываем пан
  if (userScale <= 1.001) {
    userScale = 1;
    tx = 0;
    ty = 0;
  }

  applyTransform();
}

/* ============================================================
   RESET TRANSFORM (fit-to-screen)
   ============================================================ */

function resetTransform() {
  if (!active || !overlay || !img) return;
   if (!img.complete) return;

  // naturalWidth может ещё не быть доступен
  const perform = () => {
    baseScale = computeFitScale();
    userScale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  };

if (!img.naturalWidth) return;
perform();
}

/* ============================================================
   UI AUTO HIDE
   ============================================================ */

function hideUi(hidden) {
  uiHidden = hidden;

  if (onUiVisibilityChange) {
    onUiVisibilityChange(hidden);
  }
}

function showUiTemporarily() {
  hideUi(false);
  if (uiShowTimer) clearTimeout(uiShowTimer);
  uiShowTimer = setTimeout(() => hideUi(true), 1200);
}

function updateUiAutoHide() {
  // Скрываем UI только если сильно приблизили
  if (userScale > 1.15) {
    hideUi(true);
  } else {
    hideUi(false);
  }
}

/* ============================================================
   SWIPE BETWEEN IMAGES
   ============================================================ */

function handleSwipe() {
  if (images.length <= 1) return;
  if (userScale !== 1) return; // свайпы только на fit-масштабе

  const dx = swipeEndX - swipeStartX;
  const dy = swipeEndY - swipeStartY;

  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;

  const dir = dx < 0 ? 1 : -1;
  activeIndex = (activeIndex + dir + images.length) % images.length;

 loadSchemeAtIndex(activeIndex);


}


/* ============================================================
   EVENTS
   ============================================================ */

function attachEvents() {
  if (!overlay) return;

  /* ----- MOUSE PAN ----- */

  overlay.addEventListener("mousedown", (e) => {
    if (!active) return;

    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  window.addEventListener("mousemove", (e) => {
    if (!active) return;
    if (!isDragging) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    lastX = e.clientX;
    lastY = e.clientY;

    if (userScale <= 1.001) return; // при fit-масштабе пан не работает

    tx += dx;
    ty += dy;
    applyTransform();
  });

  overlay.addEventListener("wheel", (e) => {
    if (!active) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    const newScale = userScale + delta;

    zoomAtPoint(e.clientX, e.clientY, newScale);
  }, { passive: false });


  /* ----- ТАЧ ----- */

  overlay.addEventListener("touchstart", (e) => {
    if (!active) return;

    if (e.touches.length === 1) {
      // === ADDED: choose swipe mode on fit scale ===
      // На fit-масштабе (userScale≈1) и при наличии нескольких схем — это свайп.
      touchMode = (userScale <= 1.001 && images.length > 1) ? "swipe" : "pan";
      swipeFollowX = 0;
      swipeAnimating = false;
      // === END ADDED ===
      const t = e.touches[0];
      lastX = t.clientX;
      lastY = t.clientY;

      swipeStartX = lastX;
      swipeStartY = lastY;
    } else if (e.touches.length === 2) {
      touchMode = "zoom";
      lastPinchDist = pinchDist(e.touches[0], e.touches[1]);
    }
  }, { passive: false });

  overlay.addEventListener("touchmove", (e) => {
    if (!active) return;
    e.preventDefault();
if (touchMode === "swipe" && e.touches.length === 1) {
  const t = e.touches[0];
  swipeFollowX = t.clientX - swipeStartX;
  lastX = t.clientX;
  lastY = t.clientY;
  applyTransform();
  return;
}

    if (touchMode === "pan" && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - lastX;
      const dy = t.clientY - lastY;

      lastX = t.clientX;
      lastY = t.clientY;

      // === END ADDED ===

      if (userScale <= 1.001) return;

      tx += dx;
      ty += dy;
      applyTransform();

    } else if (
      touchMode === "zoom" &&
      e.touches.length === 2
    ) {
      const dist = pinchDist(e.touches[0], e.touches[1]);
      const delta = (dist - lastPinchDist) * 0.005;

      lastPinchDist = dist;

      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      zoomAtPoint(cx, cy, userScale + delta);
    }
  }, { passive: false });

  window.addEventListener("touchend", (e) => {
    if (!active) return;

    // === ADDED: swipe-follow snap / change on touchend ===
    if ((touchMode === "pan" || touchMode === "swipe") && e.touches.length === 0) {
      swipeEndX = lastX;
      swipeEndY = lastY;

      if (touchMode === "swipe") {
        // критерии как в handleSwipe, но с анимацией
        const dx = swipeEndX - swipeStartX;
        const dy = swipeEndY - swipeStartY;

        if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) && images.length > 1 && userScale === 1) {
          const rect = overlay.getBoundingClientRect();
          const dir = dx < 0 ? 1 : -1; // влево -> next, вправо -> prev

          swipeAnimating = true;
          img.style.transition = "transform 0.22s ease-out";
          swipeFollowX = dx < 0 ? -rect.width : rect.width;
          applyTransform();

          const onDone = async () => {
  img.removeEventListener("transitionend", onDone);

  activeIndex = (activeIndex + dir + images.length) % images.length;

  // 🔹 СНАЧАЛА меняем картинку (она уже preloaded)
  await loadSchemeAtIndex(activeIndex);

  // 🔹 ПОТОМ сбрасываем transform
  swipeFollowX = 0;
  swipeAnimating = false;
  img.style.transition = "none";
  applyTransform();
};

          img.addEventListener("transitionend", onDone);
        } else {
          // не дотянули — возвращаемся
          swipeAnimating = true;
          img.style.transition = "transform 0.18s ease-out";
          swipeFollowX = 0;
          applyTransform();

          const onBack = () => {
            img.removeEventListener("transitionend", onBack);
            swipeAnimating = false;
            img.style.transition = "none";
            applyTransform();
          };
          img.addEventListener("transitionend", onBack);
        }
      } else {
        // старое поведение для пан-режима (zoom > 1)
        handleSwipe();
      }
    }
    // === END ADDED ===

    if (e.touches.length === 0) {
      touchMode = null;
    }
  });

  /* ----- DOUBLE TAP / CLICK + UI TEMP ----- */

  let lastTapTime = 0;

  overlay.addEventListener("click", (e) => {
    if (!active) return;

    const now = Date.now();
    const dt = now - lastTapTime;
    lastTapTime = now;

    if (dt < 300) {
      // double tap
      if (userScale <= 1) {
        zoomAtPoint(e.clientX, e.clientY, 2);
      } else {
        resetTransform();
      }
      return;
    }

    // single tap
    if (userScale > 1.1) {
      showUiTemporarily();
    }
  });
}

/* ============================================================
   HELPERS
   ============================================================ */

function pinchDist(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
