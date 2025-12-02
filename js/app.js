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
import { MODELS } from "./models.js";

/* ============================================================
   АВТОМАТИЧЕСКАЯ ГЕНЕРАЦИЯ manifest.json ДЛЯ SERVICE WORKER
   Никаких ручных правок — всё работает само
   ============================================================ */

async function buildCacheManifest() {
  try {
    const files = [];

    for (const model of MODELS) {
      // GLTF
      files.push(model.url);

      // BIN-файл
      const bin = model.url.replace(".gltf", ".bin");
      files.push(bin);

      // Текстуры
      if (model.textures) {
        for (const key of ["base", "normal", "rough"]) {
          if (model.textures[key]) files.push(model.textures[key]);
        }
      }

      // Схемы
      if (model.schemes) files.push(...model.schemes);

      // Видео
      if (model.video) files.push(model.video);
    }

    const unique = [...new Set(files)];

    // manifest.json → Cache Storage
    const blob = new Blob([JSON.stringify({ files: unique })], {
      type: "application/json",
    });

    const response = new Response(blob);
    const cache = await caches.open("arch-models-manifest");
    await cache.put("/manifest.json", response);

    console.log("[App] Manifest.json создан:", unique);
  } catch (e) {
    console.error("[App] Ошибка генерации manifest:", e);
  }
}

// Генерация manifest при старте
buildCacheManifest();

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
