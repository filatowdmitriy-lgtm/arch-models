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
//   import { initScheme, setSchemeImages, activateScheme, deactivateScheme } from "./scheme.js";
//
//   initScheme({ overlayEl, imgEl, onUiVisibilityChange });
//   setSchemeImages(listOfUrls);
//   activateScheme();
//   deactivateScheme();
//

let overlay = null;
let img = null;

let images = [];        // массив URL схем
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
  onUiVisibilityChange = onUiVisibility;

  if (!overlay || !img) {
    console.error("initScheme: wrong DOM elements");
    return;
  }

  initEvents();
}

/* ============================================================
   УСТАНОВКА СПИСКА ИЗОБРАЖЕНИЙ (m.schemes)
   ============================================================ */

export function setSchemeImages(urlList) {
  images = Array.isArray(urlList) ? urlList.slice() : [];
  activeIndex = 0;

  if (img && images.length > 0) {
    img.src = images[0];
  }
}

/* ============================================================
   АКТИВАЦИЯ / ДЕАКТИВАЦИЯ РЕЖИМА
   ============================================================ */

export function activateScheme() {
  active = true;
  resetTransform(); // fit-to-screen
}

export function deactivateScheme() {
  active = false;
  showUi();         // при выходе показываем UI
}

/* ============================================================
   СБРОС (fit-to-screen)
   ============================================================ */

function resetTransform() {
  if (!active || !overlay || !img) return;

  // naturalWidth может ещё не быть доступен
  const perform = () => {
    baseScale = computeFitScale();
    userScale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  };

  if (!img.naturalWidth) {
    img.onload = () => {
      perform();
      img.onload = null;
    };
  } else {
    perform();
  }
}

/* ============================================================
   COMPUTE FIT SCALE
   ============================================================ */

function computeFitScale() {
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
  const w = img.naturalWidth || rect.width;
  const h = img.naturalHeight || rect.height;

  const total = baseScale * userScale;

  const imgW = w * total;
  const imgH = h * total;

  const baseX = (rect.width - imgW) / 2;
  const baseY = (rect.height - imgH) / 2;

  const x = baseX + tx;
  const y = baseY + ty;

  img.style.transform = `translate(${x}px, ${y}px) scale(${total})`;

  updateUiAutoHide();
}

/* ============================================================
   ZOOM-AT-POINT (колесо и pinch)
   ============================================================ */

function clampUserScale(s) {
  return Math.min(4, Math.max(1, s)); // диапазон 1–4 как в 8.html
}

function zoomAtPoint(clientX, clientY, newScale) {
  if (!active) return;

  newScale = clampUserScale(newScale);

  // Если очень близко к 1 → просто reset()
  if (Math.abs(newScale - 1) < 1e-4) {
    resetTransform();
    return;
  }

  const rect = overlay.getBoundingClientRect();
  const w = img.naturalWidth || rect.width;
  const h = img.naturalHeight || rect.height;

  const sx = clientX - rect.left;
  const sy = clientY - rect.top;

  const totalBefore = baseScale * userScale;
  const imgWBefore = w * totalBefore;
  const imgHBefore = h * totalBefore;
  const baseXBefore = (rect.width - imgWBefore) / 2;
  const baseYBefore = (rect.height - imgHBefore) / 2;

  const lx = (sx - (baseXBefore + tx)) / totalBefore;
  const ly = (sy - (baseYBefore + ty)) / totalBefore;

  const totalAfter = baseScale * newScale;
  const imgWAfter = w * totalAfter;
  const imgHAfter = h * totalAfter;

  const baseXAfter = (rect.width - imgWAfter) / 2;
  const baseYAfter = (rect.height - imgHAfter) / 2;

  tx = sx - (baseXAfter + lx * totalAfter);
  ty = sy - (baseYAfter + ly * totalAfter);

  userScale = newScale;

  applyTransform();
}

/* ============================================================
   UI AUTO-HIDE
   ============================================================ */

function updateUiAutoHide() {
  if (!active) {
    showUi();
    return;
  }

  const shouldHide = userScale > 1.1;

  if (shouldHide !== uiHidden) {
    uiHidden = shouldHide;
    if (onUiVisibilityChange) {
      onUiVisibilityChange(shouldHide);
    }
  }
}

function showUiTemporarily() {
  if (!uiHidden) return;

  // показать
  uiHidden = false;
  if (onUiVisibilityChange) {
    onUiVisibilityChange(false);
  }

  if (uiShowTimer) clearTimeout(uiShowTimer);

  uiShowTimer = setTimeout(() => {
    if (active && userScale > 1.1) {
      uiHidden = true;
      if (onUiVisibilityChange) {
        onUiVisibilityChange(true);
      }
    }
  }, 2000);
}

function showUi() {
  uiHidden = false;
  if (onUiVisibilityChange) {
    onUiVisibilityChange(false);
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

  img.src = images[activeIndex];
  resetTransform();
}

/* ============================================================
   СОБЫТИЯ МЫШИ И ТАЧА
   ============================================================ */

function initEvents() {
  if (!overlay) return;

  /* ----- МЫШЬ ----- */
  overlay.addEventListener("mousedown", (e) => {
    if (!active) return;

    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;

    swipeStartX = lastX;
    swipeStartY = lastY;
  });

  window.addEventListener("mouseup", () => {
    if (!isDragging) return;

    isDragging = false;
    swipeEndX = lastX;
    swipeEndY = lastY;
    handleSwipe();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging || !active) return;

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

    const delta = -e.deltaY * 0.0015;
    const newScale = userScale + delta;

    zoomAtPoint(e.clientX, e.clientY, newScale);
  }, { passive: false });


  /* ----- ТАЧ ----- */

  overlay.addEventListener("touchstart", (e) => {
    if (!active) return;

    if (e.touches.length === 1) {
      touchMode = "pan";
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

    if (touchMode === "pan" && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - lastX;
      const dy = t.clientY - lastY;

      lastX = t.clientX;
      lastY = t.clientY;

      if (userScale <= 1.001) return;

      tx += dx;
      ty += dy;
      applyTransform();

    } else if (touchMode === "zoom" && e.touches.length === 2) {
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

    if (touchMode === "pan" && e.touches.length === 0) {
      swipeEndX = lastX;
      swipeEndY = lastY;
      handleSwipe();
    }

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
      if (userScale <= 1.01) {
        zoomAtPoint(e.clientX, e.clientY, 2.0);
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
