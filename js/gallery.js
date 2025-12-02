/* ============================================================
   gallery.js
   МОДУЛЬ: галерея моделей + навигация + выбор модели
   ============================================================ */

import { MODELS } from "./models.js";

/* ------------------------------------------------------------
   1) Внешние обработчики (устанавливаются через setHandlers)
   ------------------------------------------------------------ */

let onModelOpenHandler = null;    // вызывается при клике на карточку
let onNavigateHandler   = null;   // вызывается при Next / Prev

/**
 * viewer вызывает это, чтобы связать галерею с логикой вьюера.
 */
export function setGalleryHandlers({ onOpenModel, onNavigate }) {
  onModelOpenHandler = onOpenModel || null;
  onNavigateHandler  = onNavigate || null;
}

/* ------------------------------------------------------------
   2) Элементы DOM
   ------------------------------------------------------------ */

let galleryEl = null;

/**
 * galleryEl — это <div id="gallery">
 */
export function initGallery(domElement) {
  galleryEl = domElement;
  buildGallery();
}

/* ------------------------------------------------------------
   3) Построение галереи карточек
   ------------------------------------------------------------ */

export function buildGallery() {
  if (!galleryEl) return;

  galleryEl.innerHTML = "";

  MODELS.forEach((m) => {
    const card = document.createElement("div");
    card.className = "model-card";
    card.dataset.model = m.id;

    /* превью */
    const thumb = document.createElement("div");
    thumb.className = "model-thumb";
    thumb.textContent = m.thumbLetter || m.name.charAt(0);

    /* название */
    const caption = document.createElement("div");
    caption.className = "model-caption";
    caption.textContent = m.name;

    /* описание */
    const desc = document.createElement("div");
    desc.className = "model-desc";
    desc.textContent = m.desc;

    card.appendChild(thumb);
    card.appendChild(caption);
    card.appendChild(desc);

    /* при клике — открытие модели */
    card.addEventListener("click", () => {
      if (onModelOpenHandler) {
        onModelOpenHandler(m.id);
      }
    });

    galleryEl.appendChild(card);
  });
}

/* ------------------------------------------------------------
   4) Управление видимостью галереи
   ------------------------------------------------------------ */

export function showGallery() {
  if (galleryEl) {
    galleryEl.classList.remove("hidden");
  }
}

export function hideGallery() {
  if (galleryEl) {
    galleryEl.classList.add("hidden");
  }
}

/* ------------------------------------------------------------
   5) Навигация «следующая / предыдущая»
   ------------------------------------------------------------ */

export function getModelIndex(id) {
  return MODELS.findIndex((m) => m.id === id);
}

export function getNextModelId(currentId) {
  const idx = getModelIndex(currentId);
  if (idx === -1) return MODELS[0].id;
  return MODELS[(idx + 1) % MODELS.length].id;
}

export function getPrevModelId(currentId) {
  const idx = getModelIndex(currentId);
  if (idx === -1) return MODELS[0].id;
  return MODELS[(idx - 1 + MODELS.length) % MODELS.length].id;
}

/**
 * Вьюер вызывает это, чтобы выполнить переход к следующей модели.
 */
export function navigateNext(currentId) {
  const nextId = getNextModelId(currentId);
  if (onNavigateHandler) onNavigateHandler(nextId);
}

/**
 * Вьюер вызывает это, чтобы выполнить переход к предыдущей модели.
 */
export function navigatePrev(currentId) {
  const prevId = getPrevModelId(currentId);
  if (onNavigateHandler) onNavigateHandler(prevId);
}
