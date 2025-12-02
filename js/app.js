// js/app.js
//
// Главный модуль приложения.
// Здесь мы:
// - получаем все нужные DOM элементы;
// - инициализируем viewer.js;
// - инициализируем gallery.js;
// - запускаем приложение.
//
// Логика интерфейса, схем, видео и three.js находится
// в отдельных модулях (viewer.js, threeViewer.js, scheme.js, video.js, models.js).

import { initGallery } from "./gallery.js";
import { initViewer } from "./viewer.js";

/* ============================================================
   Telegram Mini App: ready() + expand()
   ============================================================ */

(function () {
  if (window.Telegram && Telegram.WebApp) {
    try {
      Telegram.WebApp.ready();
      Telegram.WebApp.expand();
    } catch (e) {
      // молча игнорируем, если нет Telegram.WebApp
    }
  }
})();

/* ============================================================
   ПОЛУЧАЕМ ВСЕ DOM-ЭЛЕМЕНТЫ (под текущий index.html)
   ============================================================ */

const galleryEl        = document.getElementById("gallery");
const viewerWrapperEl  = document.getElementById("viewerWrapper");
const viewerToolbarEl  = document.querySelector(".viewer-toolbar");

const backBtn      = document.getElementById("backBtn");
const prevBtn      = document.getElementById("prevBtn");
const nextBtn      = document.getElementById("nextBtn");
const modelLabelEl = document.getElementById("modelLabel");

const tab3dBtn     = document.getElementById("tab3d");
const tabSchemeBtn = document.getElementById("tabScheme");
const tabVideoBtn  = document.getElementById("tabVideo");

const canvasEl        = document.getElementById("canvas");
const schemeOverlayEl = document.getElementById("schemeOverlay");
const schemeImgEl     = document.getElementById("schemeImage");
const videoOverlayEl  = document.getElementById("videoOverlay");
const videoEl         = document.getElementById("videoPlayer");

const loadingEl      = document.getElementById("loading");
const loadingTextEl  = document.getElementById("loadingText");
const progressBarEl  = document.getElementById("progressBar");
const statusEl       = document.getElementById("status");

// debugLog у тебя уже можно не использовать, если ты его убрал из index;
// но если div с id="debugLog" остался — эта строка безвредна:
window.debugLog = document.getElementById("debugLog");

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ VIEWER
   ============================================================ */

const viewer = initViewer({
  // корневой контейнер вьюера (если нужен в viewer.js)
  viewerWrapperEl,
  viewerToolbarEl,

  // навигация по моделям
  backBtn,
  prevBtn,
  nextBtn,
  modelLabelEl,

  // вкладки
  tab3dBtn,
  tabSchemeBtn,
  tabVideoBtn,

  // 3D
  canvasEl,

  // схемы
  schemeOverlayEl,
  schemeImgEl,

  // видео
  videoOverlayEl,
  videoEl,

  // загрузка / статус
  loadingEl,
  loadingTextEl,
  progressBarEl,
  statusEl
});

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ ГАЛЕРЕИ
   ============================================================ */

initGallery(galleryEl, {
  // При выборе карточки в галерее вызываем viewer.openModelById
  onSelect: viewer.openModelById
});

// Приложение инициализировано.
