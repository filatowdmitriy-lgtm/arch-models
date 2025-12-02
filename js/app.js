// js/app.js
//
// Главный модуль приложения.
// Здесь мы:
// - получаем все нужные DOM элементы;
// - инициализируем viewer.js;
// - инициализируем gallery.js;
// - запускаем приложение.
// 
// Логика интерфейса, схем, видео и three.js полностью находится в отдельных модулях.
//

import { initGallery } from "./gallery.js";
import { initViewer } from "./viewer.js";

// Telegram Mini App: ready() + expand()
// Полный перенос поведения из 8.html
(function () {
  if (window.Telegram && Telegram.WebApp) {
    try {
      Telegram.WebApp.ready();
      Telegram.WebApp.expand();
    } catch (e) {}
  }
})();

/* =============================================================
   ПОЛУЧАЕМ ВСЕ DOM-ЭЛЕМЕНТЫ
   ============================================================= */

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

/* =============================================================
   ИНИЦИАЛИЗАЦИЯ VIEWER (главный модуль)
   ============================================================= */

const viewer = initViewer({
  galleryEl,
  viewerWrapperEl,
  viewerToolbarEl,
  backBtn,
  prevBtn,
  nextBtn,
  modelLabelEl,

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

/* =============================================================
   ИНИЦИАЛИЗАЦИЯ ГАЛЕРЕИ
   ============================================================= */

initGallery(galleryEl, {
  onSelect: viewer.openModelById
});

// Всё. Приложение запущено.
