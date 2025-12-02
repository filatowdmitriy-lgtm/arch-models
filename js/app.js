// js/app.js
//
// Главный модуль приложения.
// Здесь мы:
// - получаем все нужные DOM-элементы;
// - инициализируем viewer (вкладки, 3D, схемы, видео);
// - инициализируем галерею моделей;
// - связываем выбор модели в галерее с 3D-вьюером.
//
// Вся тяжёлая логика вынесена в отдельные модули:
//   - viewer.js      — логика вкладок + связь с threeViewer/scheme/video
//   - threeViewer.js — three.js-сцена, камера, жесты, авто-камера
//   - gallery.js     — карточки моделей и выбор
//   - models.js      — загрузка моделей, кэш, материалы
//   - scheme.js      — логика работы со схемами (зум/пан/двойной тап)
//   - video.js       — видео через blob + таймлайн
//

import { initGallery } from "./gallery.js";
import { initViewer } from "./viewer.js";

/* =============================================================
   ПОЛУЧАЕМ DOM-ЭЛЕМЕНТЫ
   ============================================================= */

const galleryEl     = document.getElementById("gallery");
const threeCanvas   = document.getElementById("three-canvas");

const viewerTabsEl  = document.getElementById("viewer-tabs");
const pane3dEl      = document.getElementById("viewer-3d-pane");
const paneSchemeEl  = document.getElementById("viewer-scheme-pane");
const paneVideoEl   = document.getElementById("viewer-video-pane");

const schemeContainerEl  = document.getElementById("schemeContainer");
const schemeImgWrapperEl = document.getElementById("schemeImgWrapper");
const schemeImgEl        = document.getElementById("schemeImg");
const schemeUiEl         = document.getElementById("schemeUi");

const videoEl            = document.getElementById("videoPlayer");
const videoPlayPauseBtn  = document.getElementById("videoPlayPauseBtn");
const videoPlayPauseIcon = document.getElementById("videoPlayPauseIcon");
const videoTimeLabel     = document.getElementById("videoTimeLabel");
const videoBufferedLabel = document.getElementById("videoBufferedLabel");
const videoProgressFill  = document.getElementById("videoProgressFill");

const loadingEl      = document.getElementById("loading");
const loadingTextEl  = document.getElementById("loadingText");
const progressBarEl  = document.getElementById("progressBar");
const statusEl       = document.getElementById("status");

/* =============================================================
   ИНИЦИАЛИЗАЦИЯ VIEWER (главный модуль экрана просмотра)
   ============================================================= */

const viewer = initViewer({
  // DOM
  canvas: threeCanvas,

  viewerTabsEl,
  pane3dEl,
  paneSchemeEl,
  paneVideoEl,

  schemeContainerEl,
  schemeImgWrapperEl,
  schemeImgEl,
  schemeUiEl,

  videoEl,
  videoPlayPauseBtn,
  videoPlayPauseIcon,
  videoTimeLabel,
  videoBufferedLabel,
  videoProgressFill,

  loadingEl,
  loadingTextEl,
  progressBarEl,

  statusEl
});

/* =============================================================
   ИНИЦИАЛИЗАЦИЯ ГАЛЕРЕИ
   ============================================================= */

// gallery.js рисует карточки моделей и вызывает onSelect(id),
// когда пользователь выбирает модель.
initGallery(galleryEl, {
  onSelect: viewer.openModelById
});

// Приложение полностью инициализировано.
