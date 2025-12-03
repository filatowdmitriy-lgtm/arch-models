// js/viewer.js
//
// Главный "дирижёр" логики интерфейса.
// Связывает:
//   • галерею
//   • загрузку моделей
//   • three.js рендер
//   • схему (zoom/pan)
//   • видео (blob player)
// Также управляет вкладками, кнопками навигации,
// лоадером, статусом и UI-поведенческими мелочами.
//
// ЛОГИКА НЕ ИЗМЕНЕНА. Добавлены только комментарии.

import { MODELS, getModelMeta, loadModel } from "./models.js";
import {
  initThree,
  setModel as threeSetModel,
  resize as threeResize,
  resetCameraSoft
} from "./threeViewer.js";

import {
  initScheme,
  setSchemeImages,
  activateScheme,
  deactivateScheme,
  resetSchemeTransform
} from "./scheme.js";

import {
  initVideo,
  loadVideo,
  activateVideo,
  deactivateVideo
} from "./video.js";

/* ============================================================
   ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ВНУТРИ VIEWER
   ============================================================ */

let dom = null;

// id текущей модели
let currentModelId = null;

// активная вкладка: "3d" | "scheme" | "video"
let activeView = "3d";

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ VIEWER — главный вход из app.js
   ============================================================ */

export function initViewer(refs) {
  // refs — это объект со ссылками на все DOM-элементы.
  dom = { ...refs };

  // Инициализация всех подсистем (3D, схемы, видео)
  initThree(dom.canvasEl);
  initScheme({
    overlayEl: dom.schemeOverlayEl,
    imgEl: dom.schemeImgEl,
    onUiVisibility: handleSchemeUiVisibility
  });
  initVideo(dom.videoEl);

  // Подключаем обработчики UI: вкладки, кнопки Prev/Next, кнопка "Галерея"
  setupUiHandlers();

  // На window resize пересчитываем размеры 3D, принимаем такие же меры для схемы
  window.addEventListener("resize", handleResize);

  // В начале — показывается галерея, viewer скрыт
  dom.viewerWrapperEl.classList.remove("visible");
  dom.galleryEl.classList.remove("hidden");

  // Возвращаем наружу API
  return {
    openModelById,
    showGallery,
    handleResize
  };
}

/* ============================================================
   ОТКРЫТИЕ МОДЕЛИ ЧЕРЕЗ id (вызывается галереей или switchModel)
   ============================================================ */

function openModelById(id) {
  const meta = getModelMeta(id);
  if (!meta) return;

  currentModelId = id;

  // Переключаем экраны: галерею скрываем, viewer показываем
  dom.galleryEl.classList.add("hidden");
  dom.viewerWrapperEl.classList.add("visible");

  // Обновляем заголовок модели
  dom.modelLabelEl.textContent = meta.name || "";

  // Блокируем/разблокируем вкладки "Схема" и "Видео" в зависимости от доступности
  configureViewTabsForModel(meta);

  // Запускаем загрузку 3D модели
  loadSelectedModel(meta);
}

/* ============================================================
   НАСТРОЙКА ВКЛАДОК В ЗАВИСИМОСТИ ОТ МОДЕЛИ
   ============================================================ */

function configureViewTabsForModel(meta) {
  // Вкладка "Схема"
  if (meta.schemes && meta.schemes.length > 0) {
    dom.tabSchemeBtn.classList.remove("disabled");
  } else {
    dom.tabSchemeBtn.classList.add("disabled");
  }

  // Вкладка "Видео"
  if (meta.video) {
    dom.tabVideoBtn.classList.remove("disabled");
  } else {
    dom.tabVideoBtn.classList.add("disabled");
  }
}

/* ============================================================
   ГЛАВНАЯ ФУНКЦИЯ ЗАГРУЗКИ МОДЕЛИ
   ============================================================ */

function loadSelectedModel(meta) {
  showLoading("Загрузка…", 0);
  setStatus("Загрузка: " + meta.name);

  // Асинхронная загрузка модели
  loadModel(meta.id, {
    onProgress: (percent) => {
      // Обновляем полоску прогресса
      showLoading("Загрузка: " + percent.toFixed(0) + "%", percent);
    },
    onStatus: (text) => {
      setStatus(text);
    }
  })
    .then(({ root }) => {
      // Передаём трёхмерную модель в three.js
      threeSetModel(root);

      hideLoading();
      setStatus("Модель загружена: " + meta.name);

      // По умолчанию — включаем 3D-вкладку
      setViewMode("3d");
    })
    .catch((err) => {
      console.error("Ошибка загрузки модели:", err);
      hideLoading();
      setStatus("Ошибка загрузки модели");
    });

  // Параллельно (НЕ ждём) подготавливаем схемы и видео
  setupSchemeAndVideo(meta);
}

/* ============================================================
   ЗАПОЛНЕНИЕ СХЕМ & ВИДЕО ДЛЯ ЭТОЙ МОДЕЛИ
   ============================================================ */

function setupSchemeAndVideo(meta) {
  // Схемы
  if (meta.schemes && meta.schemes.length > 0) {
    setSchemeImages(meta.schemes);
  } else {
    setSchemeImages([]);
  }

  // Видео
  if (meta.video) {
    loadVideo(meta.video);
  } else {
    deactivateVideo();
  }
}

/* ============================================================
   ПОВЕДЕНИЕ UI ПРИ ЗУМЕ СХЕМЫ (auto-hide toolbar/status)
   ============================================================ */

function handleSchemeUiVisibility(hidden) {
  // Схема сама говорит: "спрячь UI" или "покажи UI"
  // Но только если мы на вкладке "scheme"
  if (activeView !== "scheme") return;
  setUiHidden(hidden);
}

/* ============================================================
   ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
   ============================================================ */

function setupUiHandlers() {
  // Кнопка "Галерея"
  dom.backBtn.addEventListener("click", showGallery);

  // Переключение между вкладками
  dom.tab3dBtn.addEventListener("click", () => setViewMode("3d"));
  dom.tabSchemeBtn.addEventListener("click", () => setViewMode("scheme"));
  dom.tabVideoBtn.addEventListener("click", () => setViewMode("video"));

  // Prev / Next (смена модели)
  dom.prevBtn.addEventListener("click", () => switchModel(-1));
  dom.nextBtn.addEventListener("click", () => switchModel(1));
}

/* ============================================================
   ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ВИДА: 3D / SCHEME / VIDEO
   ============================================================ */

function setViewMode(mode) {
  if (activeView === mode) return;
  activeView = mode;

  const {
    tab3dBtn, tabSchemeBtn, tabVideoBtn,
    canvasEl, schemeOverlayEl, videoOverlayEl
  } = dom;

  // Сбрасываем активные классы на всех вкладках
  tab3dBtn.classList.remove("active");
  tabSchemeBtn.classList.remove("active");
  tabVideoBtn.classList.remove("active");

  switch (mode) {
    case "3d":
      tab3dBtn.classList.add("active");

      // Показываем 3D
      canvasEl.style.display = "block";
      deactivateScheme();
      deactivateVideo();
      schemeOverlayEl.style.display = "none";
      videoOverlayEl.style.display = "none";

      setUiHidden(false);

      // Мягкая коррекция камеры
      resetCameraSoft();
      break;

    case "scheme":
      tabSchemeBtn.click();
      tabSchemeBtn.classList.add("active");

      canvasEl.style.display = "none";
      deactivateVideo();

      schemeOverlayEl.style.display = "flex";
      videoOverlayEl.style.display = "none";

      // Вход в режим схемы = fit-to-screen
      resetSchemeTransform();

      setUiHidden(false);
      activateScheme();
      break;

    case "video":
      tabVideoBtn.classList.add("active");

      canvasEl.style.display = "none";
      deactivateScheme();

      schemeOverlayEl.style.display = "none";
      videoOverlayEl.style.display = "flex";

      setUiHidden(false);
      activateVideo();
      break;
  }
}

/* ============================================================
   СКРЫТИЕ И ПОКАЗ ГАЛЕРЕИ
   ============================================================ */

function showGallery() {
  // При выходе — выключаем видео
  deactivateVideo();

  // Переключаем на галерею
  dom.viewerWrapperEl.classList.remove("visible");
  dom.galleryEl.classList.remove("hidden");

  currentModelId = null;
  activeView = "3d";

  // Возвращаем UI и камеру в норму
  setUiHidden(false);
  resetCameraSoft();
  resetSchemeTransform();

  setStatus("");
}

/* ============================================================
   ПЕРЕКЛЮЧЕНИЕ МОДЕЛИ PREV/NEXT
   ============================================================ */

function switchModel(direction) {
  if (!currentModelId) {
    if (MODELS.length > 0) openModelById(MODELS[0].id);
    return;
  }

  const idx = MODELS.findIndex((m) => m.id === currentModelId);
  if (idx === -1) {
    if (MODELS.length > 0) openModelById(MODELS[0].id);
    return;
  }

  let nextIndex = idx + direction;
  if (nextIndex < 0) nextIndex = MODELS.length - 1;
  if (nextIndex >= MODELS.length) nextIndex = 0;

  openModelById(MODELS[nextIndex].id);
}

/* ============================================================
   ЛОАДЕР И СТАТУС
   ============================================================ */

function showLoading(text, percent) {
  dom.loadingEl.style.display = "flex";
  dom.loadingTextEl.textContent = text;

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

function setStatus(text) {
  dom.statusEl.textContent = text || "";
}

/* ============================================================
   RESIZE — пересчёт размеров 3D и схемы
   ============================================================ */

function handleResize() {
  threeResize();
  if (activeView === "scheme") {
    activateScheme(); // схема пересчитывает центрирование
  }
}

/* ============================================================
   СКРЫТИЕ/ПОКАЗ UI (тулбар + статус)
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
