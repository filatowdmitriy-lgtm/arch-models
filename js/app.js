// js/app.js
//
// Главная точка входа приложения:
// — Инициализация Telegram Mini App (если запущено внутри Telegram)
// — Сбор DOM-элементов интерфейса
// — Запуск галереи и вьюера
//
// ВАЖНО:
// Логика полностью идентична рабочей версии, переданной пользователем.
// Ничего не изменено, только убран debugLog и добавлены поясняющие комментарии.

import { initGallery } from "./gallery.js";
import { initViewer } from "./viewer.js";

/* ============================================================
   1. Telegram Mini App готовность и expand()
   ============================================================ */

(function () {
  if (window.Telegram && Telegram.WebApp) {
    try {
      Telegram.WebApp.ready();
      Telegram.WebApp.expand();
    } catch (e) {
      console.warn("Telegram WebApp init warning:", e);
    }
  }
})();

/* ============================================================
   2. СБОР ВСЕХ DOM-ЭЛЕМЕНТОВ ИНТЕРФЕЙСА
   ============================================================ */

const galleryEl = document.getElementById("gallery");
const viewerWrapperEl = document.getElementById("viewerWrapper");

// Верхняя панель
const modelLabelEl = document.getElementById("modelLabel");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const backBtn = document.getElementById("backBtn");

// Вкладки
const tab3dBtn = document.getElementById("tab3d");
const tabSchemeBtn = document.getElementById("tabScheme");
const tabVideoBtn = document.getElementById("tabVideo");

// 3D canvas
const canvasEl = document.getElementById("canvas");

// Схема
const schemeOverlayEl = document.getElementById("schemeOverlay");
const schemeImgEl = document.getElementById("schemeImage");

// Видео
const videoOverlayEl = document.getElementById("videoOverlay");
const videoEl = document.getElementById("videoPlayer");

// Загрузка
const loadingEl = document.getElementById("loading");
const loadingTextEl = document.getElementById("loadingText");
const progressBarEl = document.getElementById("progressBar");

// Статус
const statusEl = document.getElementById("status");

// debugLog удалён — поддержка сохранена, но сам элемент отсутствует
window.debugLog = { textContent: "" };

/* ============================================================
   3. ИНИЦИАЛИЗАЦИЯ VIEWER (передаём ВСЕ DOM-элементы)
   ============================================================ */

const viewer = initViewer({
  galleryEl,
  viewerWrapperEl,

  modelLabelEl,
  prevBtn,
  nextBtn,
  backBtn,

  tab3dBtn,
  tabSchemeBtn,
  tabVideoBtn,

  canvasEl,

  schemeOverlayEl,
  schemeImgEl,

  videoOverlayEl,
  videoEl,

  loadingEl,
  loadingTextEl,
  progressBarEl,
  statusEl
});

/* ============================================================
   4. ИНИЦИАЛИЗАЦИЯ ГАЛЕРЕИ
   ============================================================ */

initGallery(galleryEl, {
  onSelect: viewer.openModelById
});
