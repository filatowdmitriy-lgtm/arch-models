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
//   const viewer = initViewer({ ...DOM элементы... });
//   initGallery(galleryEl, {
//     onSelect: viewer.openModelById
//   });

import { MODELS, getModelMeta, loadModel } from "./models.js";
import {
  initThree,
  setModel as threeSetModel,
  resizeViewport,
  resetCameraSoft,
  getCurrentCameraState
} from "./threeViewer.js";

import {
  initScheme,
  showScheme,
  hideScheme,
  resetSchemeTransform,
  setSchemeImages
} from "./scheme.js";

import {
  initVideo,
  showVideo,
  hideVideo,
  prepareVideoSource,
  deactivateVideo
} from "./video.js";

/* ===============================
   ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
   =============================== */

let dom = null;

let currentModelId = null; // id выбранной модели
let activeView = "3d";     // "3d" | "scheme" | "video"

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ VIEWER'A
   ============================================================ */

export function initViewer(refs) {
  // refs содержит все DOM-ссылки, которые даёт app.js:
  // galleryEl, viewerWrapperEl,
  // modelLabelEl, prevBtn, nextBtn, backBtn,
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
      // Скрываем тулбар и статус
      if (activeView !== "scheme") return;
      setUiHidden(hidden);
    }
  });

  // Инициализируем видео
  initVideo(dom.videoEl);

  // Заводим обработчики UI
  setupTabs();
  setupNavButtons();

  // Общий resize
  window.addEventListener("resize", handleResize);

  // Изначально показываем только галерею
  dom.viewerWrapperEl.classList.remove("visible");
  dom.galleryEl.classList.remove("hidden");

  return {
    openModelById,
    showGallery,
    handleResize
  };
}

/* ============================================================
   ОТКРЫТИЕ МОДЕЛИ ПО ID И ПЕРЕХОД ИЗ ГАЛЕРЕИ В VIEWER
   ============================================================ */

function openModelById(id) {
  const meta = getModelMeta(id);
  if (!meta) return;

  currentModelId = id;

  // Переключаем основной экран: прячем галерею, показываем viewer
  dom.galleryEl.classList.add("hidden");
  dom.viewerWrapperEl.classList.add("visible");

  // Обновляем подпись модели
  dom.modelLabelEl.textContent = meta.name || "";

  // Обновляем доступность вкладок (схема/видео)
  updateTabAvailability(meta);

  // Запускаем загрузку модели
  startModelLoading(meta);
}

/* ============================================================
   ВКЛАДКИ: 3D / ПОСТРОЕНИЕ / ВИДЕО
   ============================================================ */

function setupTabs() {
  const { tab3dBtn, tabSchemeBtn, tabVideoBtn } = dom;

  tab3dBtn.addEventListener("click", () => {
    setViewMode("3d");
  });

  tabSchemeBtn.addEventListener("click", () => {
    setViewMode("scheme");
  });

  tabVideoBtn.addEventListener("click", () => {
    setViewMode("video");
  });
}

function setViewMode(mode) {
  if (activeView === mode) return;
  activeView = mode;

  const {
    tab3dBtn,
    tabSchemeBtn,
    tabVideoBtn,
    canvasEl,
    schemeOverlayEl,
    videoOverlayEl
  } = dom;

  // Сбрасываем активный класс на кнопках вкладок
  tab3dBtn.classList.remove("active");
  tabSchemeBtn.classList.remove("active");
  tabVideoBtn.classList.remove("active");

  // Скрываем/показываем соответствующие панели
  if (mode === "3d") {
    tab3dBtn.classList.add("active");

    canvasEl.style.display = "block";
    hideScheme();
    hideVideo();
    schemeOverlayEl.style.display = "none";
    videoOverlayEl.style.display = "none";

    // Показываем UI
    setUiHidden(false);

    // Мягко подстраиваем камеру под текущую сцену
    resetCameraSoft();

  } else if (mode === "scheme") {
    tabSchemeBtn.classList.add("active");

    canvasEl.style.display = "none";
    hideVideo();

    schemeOverlayEl.style.display = "flex";
    videoOverlayEl.style.display = "none";

    // При входе в режим схем — fit-to-screen
    resetSchemeTransform();

    // UI управляется схемой (через onUiVisibility), но при входе показываем
    setUiHidden(false);

  } else if (mode === "video") {
    tabVideoBtn.classList.add("active");

    canvasEl.style.display = "none";
    hideScheme();

    schemeOverlayEl.style.display = "none";
    videoOverlayEl.style.display = "flex";

    // Видео само управляет своим UI, общие контролы показываем
    setUiHidden(false);
  }
}

/* ============================================================
   ОБНОВЛЕНИЕ ДОСТУПНОСТИ ВКЛАДОК СХЕМА/ВИДЕО
   ============================================================ */

function updateTabAvailability(meta) {
  const { tabSchemeBtn, tabVideoBtn } = dom;

  if (meta.schemes && meta.schemes.length > 0) {
    tabSchemeBtn.classList.remove("disabled");
  } else {
    tabSchemeBtn.classList.add("disabled");
  }

  if (meta.video) {
    tabVideoBtn.classList.remove("disabled");
  } else {
    tabVideoBtn.classList.add("disabled");
  }
}

/* ============================================================
   ЗАПУСК ЗАГРУЗКИ МОДЕЛИ
   ============================================================ */

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
      // Дополнительно дублируем явный статус
      setStatus("Модель загружена: " + meta.name);

      // При загрузке всегда переходим в 3D режим
      setViewMode("3d");
    })
    .catch((err) => {
      console.error("Ошибка загрузки модели:", err);
      hideLoading();
      setStatus("Ошибка загрузки модели");
    });

  // Параллельно настраиваем схемы и видео
  setupSchemeAndVideo(meta);
}

/* ============================================================
   СХЕМЫ И ВИДЕО (подготовка при выборе модели)
   ============================================================ */

function setupSchemeAndVideo(meta) {
  // Схемы: если есть массив ссылок — устанавливаем в scheme.js
  if (meta.schemes && meta.schemes.length > 0) {
    setSchemeImages(meta.schemes);
    dom.tabSchemeBtn.classList.remove("disabled");
  } else {
    setSchemeImages([]);
    dom.tabSchemeBtn.classList.add("disabled");
  }

  // Видео: если есть ссылка — готовим источник
  if (meta.video) {
    prepareVideoSource(meta.video);
    dom.tabVideoBtn.classList.remove("disabled");
  } else {
    deactivateVideo(); // внутри — pause()
    dom.tabVideoBtn.classList.add("disabled");
  }
}

/* ============================================================
   НАВИГАЦИЯ: PREV / NEXT / BACK
   ============================================================ */

function setupNavButtons() {
  const { prevBtn, nextBtn, backBtn } = dom;

  prevBtn.addEventListener("click", () => {
    switchModel(-1);
  });

  nextBtn.addEventListener("click", () => {
    switchModel(1);
  });

  backBtn.addEventListener("click", () => {
    showGallery();
  });
}

function switchModel(direction) {
  if (!currentModelId) {
    if (MODELS.length > 0) {
      openModelById(MODELS[0].id);
    }
    return;
  }

  const idx = MODELS.findIndex((m) => m.id === currentModelId);
  if (idx === -1) {
    if (MODELS.length > 0) {
      openModelById(MODELS[0].id);
    }
    return;
  }

  let nextIndex = idx + direction;
  if (nextIndex < 0) nextIndex = MODELS.length - 1;
  if (nextIndex >= MODELS.length) nextIndex = 0;

  const nextMeta = MODELS[nextIndex];
  if (!nextMeta) return;

  openModelById(nextMeta.id);
}

/* ============================================================
   ПОКАЗ ГАЛЕРЕИ И СКРЫТИЕ VIEWER’A
   ============================================================ */

function showGallery() {
  // Останавливаем видео при выходе из вьюера
  deactivateVideo();

  dom.viewerWrapperEl.classList.remove("visible");
  dom.galleryEl.classList.remove("hidden");

  // Сбрасываем активную модель и режим
  currentModelId = null;
  activeView = "3d";

  // Возвращаем UI
  setUiHidden(false);

  // Можно дополнительно сбросить камеру / схему / статус, если нужно
  resetCameraSoft();
  resetSchemeTransform();
  setStatus("");
}

/* ============================================================
   LOADING (лоадер, прогресс-бар)
   ============================================================ */

function showLoading(text, percent) {
  dom.loadingEl.style.display = "flex";
  dom.loadingTextEl.textContent = text || "Загрузка…";

  if (typeof percent === "number") {
    const clamped = Math.max(0, Math.min(100, percent));
    dom.progressBarEl.style.width = clamped + "%";
  } else {
    dom.progressBarEl.style.width = "0%";
  }
}

function hideLoading() {
  dom.loadingEl.style.display = "none";
  dom.progressBarEl.style.width = "0%";
}

/* ============================================================
   СТАТУС (надпись внизу)
   ============================================================ */

function setStatus(text) {
  dom.statusEl.textContent = text || "";
}

/* ============================================================
   RESIZE (пробрасываем в threeViewer)
   ============================================================ */

function handleResize() {
  resizeViewport();
}

/* ============================================================
   UI HIDE/SHOW (toolbar + status)
   ============================================================ */

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
