// js/viewer.js
//
// "Мозг" вьюера:
// - переключает галерею / экран просмотра;
// - управляет вкладками: 3D / Построение / Видео;
// - загружает модели (через models.js);
// - передаёт модели в threeViewer;
// - настраивает схемы и видео;
// - показывает / скрывает лоадер и статус;
// - навигация: предыдущая / следующая модель.
//
// НЕТ логики three.js (она в threeViewer.js).
// НЕТ логики зума схем (она в scheme.js).
// НЕТ логики blob-видео (она в video.js).
//
// Использование (из app.js):
//
//   import { initViewer } from "./viewer.js";
//   import { initGallery } from "./gallery.js";
//
//   const viewer = initViewer({ ...DOM элементы... });
//   initGallery(galleryEl, { onSelect: viewer.openModelById });
//

import { MODELS, loadModel, getModelMeta } from "./models.js";
import { initThree, setModel as threeSetModel, resize as threeResize } from "./threeViewer.js";
import {
  initScheme,
  setSchemeImages,
  activateScheme,
  deactivateScheme
} from "./scheme.js";
import {
  initVideo,
  loadVideo,
  activateVideo,
  deactivateVideo
} from "./video.js";

/* ===============================
   ВНУТРЕННЕЕ СОСТОЯНИЕ
   =============================== */

let dom = null;

let currentModelId = null;
let activeView = "3d"; // "3d" | "scheme" | "video"

/* ===============================
   ПУБЛИЧНЫЙ ИНТЕРФЕЙС
   =============================== */

/**
 * Инициализация вьюера.
 *
 * @param {object} refs - ссылки на DOM-элементы
 * @returns {object} API
 */
export function initViewer(refs) {
  // Ожидаемые элементы:
  // galleryEl, viewerWrapperEl, viewerToolbarEl,
  // backBtn, prevBtn, nextBtn,
  // modelLabelEl,
  // tab3dBtn, tabSchemeBtn, tabVideoBtn,
  // canvasEl,
  // schemeOverlayEl, schemeImgEl,
  // videoOverlayEl, videoEl,
  // loadingEl, loadingTextEl, progressBarEl,
  // statusEl
  dom = { ...refs };

  // Инициализируем 3D
  initThree(dom.canvasEl);

  // Инициализируем схему (передаём колбэк для UI hide)
  initScheme({
    overlayEl: dom.schemeOverlayEl,
    imgEl: dom.schemeImgEl,
    onUiVisibility: (hidden) => {
      // Схема просит скрыть/показать UI
      // Скрываем тулбар и статус (как setUiHidden в 8.html)
      if (activeView !== "scheme") {
        // если не в режиме схемы — всегда показываем UI
        setUiHidden(false);
        return;
      }
      setUiHidden(hidden);
    }
  });

  // Инициализируем видео
  initVideo(dom.videoEl);

  // Навешиваем обработчики UI
  setupUiHandlers();

  // Глобальный touchmove-block, когда открыт viewer
  setupGlobalTouchBlock();

  // Ресайз окна → три-вьюер + reset схемы при необходимости
  window.addEventListener("resize", handleResize);

  // Стартовое состояние: галерея показана, вьюер скрыт
  showGallery();

  return {
    openModelById,
    showGallery,
    handleResize
  };
}

/* ===============================
   ОБРАБОТКА RESIZE
   =============================== */

function handleResize() {
  // Три-вьюер: обновить aspect и размер
  threeResize();

  // Схемы: при активной вкладке — пересчитать fit-to-screen (как в 8.html)
  if (activeView === "scheme") {
    // повторная активация схемы → resetTransform()
    activateScheme();
  }
}

/* ===============================
   ОБРАБОТЧИКИ КНОПОК И ВКЛАДОК
   =============================== */

function setupUiHandlers() {
  const {
    backBtn,
    prevBtn,
    nextBtn,
    tab3dBtn,
    tabSchemeBtn,
    tabVideoBtn
  } = dom;

  // Кнопка "Назад к галерее"
  backBtn.addEventListener("click", () => {
    showGallery();
  });

  // Следующая/предыдущая модель
  nextBtn.addEventListener("click", () => {
    if (!currentModelId) {
      // если ничего не выбрано — открываем первую
      openModelById(MODELS[0].id);
      return;
    }
    let idx = getModelIndex(currentModelId);
    idx = (idx + 1) % MODELS.length;
    openModelById(MODELS[idx].id);
  });

  prevBtn.addEventListener("click", () => {
    if (!currentModelId) {
      openModelById(MODELS[0].id);
      return;
    }
    let idx = getModelIndex(currentModelId);
    idx = (idx - 1 + MODELS.length) % MODELS.length;
    openModelById(MODELS[idx].id);
  });

  // Вкладки
  tab3dBtn.addEventListener("click", () => {
    setViewMode("3d");
  });

  tabSchemeBtn.addEventListener("click", () => {
    const meta = getCurrentModelMeta();
    if (!meta || !meta.schemes || meta.schemes.length === 0) return;
    setViewMode("scheme");
  });

  tabVideoBtn.addEventListener("click", () => {
    const meta = getCurrentModelMeta();
    if (!meta || !meta.video) return;
    setViewMode("video");
  });
}

/* ===============================
   ГЛОБАЛЬНЫЙ BLOCK touchmove (как в 8.html)
   =============================== */

function setupGlobalTouchBlock() {
  const { viewerWrapperEl } = dom;

  document.addEventListener(
    "touchmove",
    (e) => {
      if (viewerWrapperEl && viewerWrapperEl.classList.contains("visible")) {
        e.preventDefault();
      }
    },
    { passive: false }
  );
}

/* ===============================
   НАВИГАЦИЯ ПО МОДЕЛЯМ
   =============================== */

function getModelIndex(id) {
  return MODELS.findIndex((m) => m.id === id);
}

function getCurrentModelMeta() {
  if (!currentModelId) return null;
  return getModelMeta(currentModelId);
}

/**
 * Открыть модель по её id.
 * Вызывается галереей через viewer.openModelById.
 */
function openModelById(modelId) {
  const meta = getModelMeta(modelId);
  if (!meta) return;

  currentModelId = modelId;

  // Обновляем подпись
  dom.modelLabelEl.textContent = meta.name;

  // Показываем вьюер, скрываем галерею
  hideGallery();
  showViewer();

  // Настраиваем вкладки под конкретную модель
  configureViewTabsForModel(meta);

  // Загружаем 3D модель
  startModelLoading(meta);
}

/* ===============================
   ЗАГРУЗКА МОДЕЛИ
   =============================== */

function startModelLoading(meta) {
  showLoading("Загрузка…", 0);
  setStatus("Загрузка: " + meta.name);

  loadModel(meta.id, {
    onProgress: (percent) => {
      if (typeof percent === "number") {
        showLoading("Загрузка: " + percent.toFixed(0) + "%", percent);
      } else {
        showLoading("Загрузка…", null);
      }
    },
    onStatus: (text) => {
      setStatus(text);
    }
  })
    .then(({ root }) => {
      // Передаём модель в threeViewer
      threeSetModel(root);

      hideLoading();
      // Дополнительно дублируем явный статус, как в 8.html
      setStatus("Модель загружена: " + meta.name);

      // При загрузке всегда переходим в 3D режим
      setViewMode("3d");
    })
    .catch((err) => {
      console.error("Ошибка загрузки модели:", err);
      hideLoading();
      setStatus("Ошибка загрузки модели");
      alert("Ошибка загрузки модели.");
    });
}

/* ===============================
   НАСТРОЙКА ВКЛАДОК ПОД МОДЕЛЬ
   =============================== */

function configureViewTabsForModel(meta) {
  const { tabSchemeBtn, tabVideoBtn } = dom;

  const hasScheme = meta.schemes && meta.schemes.length > 0;
  const hasVideo = !!meta.video;

  // ----- СХЕМЫ -----
  if (hasScheme) {
    tabSchemeBtn.classList.remove("disabled");
    setSchemeImages(meta.schemes);
  } else {
    tabSchemeBtn.classList.add("disabled");
    setSchemeImages([]);
  }

  // ----- ВИДЕО -----
  if (hasVideo) {
    tabVideoBtn.classList.remove("disabled");
    loadVideo(meta.video); // blob-загрузка видео
  } else {
    tabVideoBtn.classList.add("disabled");
    loadVideo(null); // сбрасываем видео
  }

  // По умолчанию всегда стартуем с 3D
  setViewMode("3d");
}

/* ===============================
   ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК / РЕЖИМОВ
   =============================== */

function setViewMode(mode) {
  activeView = mode;

  const {
    tab3dBtn,
    tabSchemeBtn,
    tabVideoBtn,
    schemeOverlayEl,
    videoOverlayEl
  } = dom;

  // Подсветка вкладок
  tab3dBtn.classList.toggle("active", mode === "3d");
  tabSchemeBtn.classList.toggle("active", mode === "scheme");
  tabVideoBtn.classList.toggle("active", mode === "video");

  // ----- СХЕМА -----
  if (schemeOverlayEl) {
    const isScheme = mode === "scheme";
    schemeOverlayEl.style.display = isScheme ? "flex" : "none";
    if (isScheme) {
      activateScheme();
    } else {
      deactivateScheme();
    }
  }

  // ----- ВИДЕО -----
  if (videoOverlayEl) {
    const isVideo = mode === "video";
    videoOverlayEl.style.display = isVideo ? "flex" : "none";

    if (isVideo) {
      activateVideo();
    } else {
      deactivateVideo(); // внутри — pause(), как в 8.html
    }
  }

  // При выходе из "Построения" всегда показываем UI
  if (mode !== "scheme") {
    setUiHidden(false);
  }
}

/* ===============================
   ПОКАЗ / СКРЫТИЕ ГАЛЕРЕИ / VIEWER
   =============================== */

function showGallery() {
  const { galleryEl, viewerWrapperEl } = dom;
  if (galleryEl) galleryEl.classList.remove("hidden");
  if (viewerWrapperEl) viewerWrapperEl.classList.remove("visible");

  setStatus("");
}

function hideGallery() {
  const { galleryEl } = dom;
  if (galleryEl) galleryEl.classList.add("hidden");
}

function showViewer() {
  const { viewerWrapperEl } = dom;
  if (viewerWrapperEl) viewerWrapperEl.classList.add("visible");
}

/* ===============================
   LOADING UI
   =============================== */

function showLoading(text, percent) {
  const { loadingEl, loadingTextEl, progressBarEl } = dom;
  if (!loadingEl || !loadingTextEl || !progressBarEl) return;

  loadingEl.style.display = "flex";
  loadingTextEl.textContent = text;

  if (typeof percent === "number") {
    progressBarEl.style.width = percent.toFixed(0) + "%";
  } else {
    progressBarEl.style.width = "15%";
  }
}

function hideLoading() {
  const { loadingEl } = dom;
  if (!loadingEl) return;
  loadingEl.style.display = "none";
}

function setStatus(text) {
  const { statusEl } = dom;
  if (!statusEl) return;
  statusEl.textContent = text || "";
}

/* ===============================
   UI HIDE/SHOW (toolbar + status)
   =============================== */

function setUiHidden(hidden) {
  const { viewerToolbarEl, statusEl } = dom;
  if (!viewerToolbarEl || !statusEl) return;

  if (hidden) {
    viewerToolbarEl.classList.add("ui-hidden");
    statusEl.classList.add("ui-hidden");
  } else {
    viewerToolbarEl.classList.remove("ui-hidden");
    statusEl.classList.remove("ui-hidden");
  }
}
