// js/app.js
//
// Главный модуль приложения. Работает с текущим index(3).html,
// НЕ использует viewerToolbarEl (потому что его нет в разметке).

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
    } catch (e) {}
  }
})();

/* ============================================================
   ПОЛУЧАЕМ ВСЕ DOM-ЭЛЕМЕНТЫ
============================================================ */

const galleryEl       = document.getElementById("gallery");
const viewerWrapperEl = document.getElementById("viewerWrapper");

const backBtn      = document.getElementById("backBtn");
const prevBtn      = document.getElementById("prevBtn");
const nextBtn      = document.getElementById("nextBtn");
const modelLabelEl = document.getElementById("modelLabel");

const tab3dBtn     = document.getElementById("tab3d");
const tabSchemeBtn = document.getElementById("tabScheme");
const tabVideoBtn  = document.getElementById("tabVideo");

const canvasEl         = document.getElementById("canvas");
const schemeOverlayEl  = document.getElementById("schemeOverlay");
const schemeImgEl      = document.getElementById("schemeImage");

const videoOverlayEl   = document.getElementById("videoOverlay");
const videoEl          = document.getElementById("videoPlayer");

const loadingEl      = document.getElementById("loading");
const loadingTextEl  = document.getElementById("loadingText");
const progressBarEl  = document.getElementById("progressBar");
const statusEl       = document.getElementById("status");

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ VIEWER
============================================================ */

// ❗ ЗАМЕЧАНИЕ: viewerToolbarEl намеренно НЕ передаём — его нет в DOM.
// viewer.js теперь корректно работает без него.

const viewer = initViewer({
  galleryEl,
  viewerWrapperEl,

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

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ ГАЛЕРЕИ
============================================================ */

initGallery(galleryEl, {
  onSelect: viewer.openModelById
});
