// js/viewer.js
//
// Модуль занимается:
// - переключением вкладок (3D / схема / видео);
// - загрузкой модели через loadModel();
// - взаимодействием с threeViewer.js, scheme.js, video.js;
// - показом/скрытием интерфейса.
// toolbar в этой версии НЕ используется.

import { loadModel } from "./models.js";
import { initThree, setModel, handleResize as threeResize } from "./threeViewer.js";
import { initScheme, showScheme, hideScheme } from "./scheme.js";
import { initVideo, showVideo, hideVideo } from "./video.js";

let dom = {};
let currentId = null;

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
============================================================ */
export function initViewer(refs) {
  dom = { ...refs };

  // Инициализация трёх модулей
  initThree(dom.canvasEl);
  initScheme({
    overlayEl: dom.schemeOverlayEl,
    imgEl: dom.schemeImgEl
  });
  initVideo(dom.videoEl);

  setupUiHandlers();
  window.addEventListener("resize", handleResize);

  return {
    openModelById,
    handleResize,
    showGallery
  };
}

/* ============================================================
   ЗАГРУЗКА МОДЕЛИ
============================================================ */
async function openModelById(id) {
  currentId = id;

  dom.loadingEl.classList.remove("hidden");
  dom.loadingTextEl.textContent = "Загрузка…";
  dom.statusEl.textContent = "";

  try {
    const { root, meta } = await loadModel(id, {
      onProgress: (p) => (dom.progressBarEl.style.width = `${p}%`),
      onStatus: (s) => (dom.statusEl.textContent = s)
    });

    setModel(root);

    dom.modelLabelEl.textContent = meta.name;
    show3D();

  } catch (e) {
    dom.statusEl.textContent = "Ошибка загрузки";
    console.error(e);
  } finally {
    dom.loadingEl.classList.add("hidden");
    dom.progressBarEl.style.width = "0%";
  }
}

/* ============================================================
   UI: вкладки
============================================================ */
function setupUiHandlers() {
  dom.tab3dBtn.addEventListener("click", show3D);
  dom.tabSchemeBtn.addEventListener("click", showSchemeTab);
  dom.tabVideoBtn.addEventListener("click", showVideoTab);

  dom.backBtn.addEventListener("click", showGallery);
  dom.prevBtn.addEventListener("click", () => switchModel(-1));
  dom.nextBtn.addEventListener("click", () => switchModel(+1));
}

function show3D() {
  dom.canvasEl.style.display = "block";
  hideScheme();
  hideVideo();
}

function showSchemeTab() {
  dom.canvasEl.style.display = "none";
  hideVideo();
  showScheme();
}

function showVideoTab() {
  dom.canvasEl.style.display = "none";
  hideScheme();
  showVideo();
}

/* ============================================================
   ПЕРЕКЛЮЧЕНИЕ МОДЕЛЕЙ ВПЕРЁД/НАЗАД
============================================================ */
import { MODELS } from "./models.js";

function switchModel(dir) {
  const index = MODELS.findIndex((m) => m.id === currentId);
  if (index === -1) return;

  let next = index + dir;
  if (next < 0) next = MODELS.length - 1;
  if (next >= MODELS.length) next = 0;

  openModelById(MODELS[next].id);
}

/* ============================================================
   ПОКАЗАТЬ ГАЛЕРЕЮ (прячет 3D)
============================================================ */
function showGallery() {
  hideScheme();
  hideVideo();
  dom.canvasEl.style.display = "none";

  dom.viewerWrapperEl.classList.add("show-gallery");
}

/* ============================================================
   RESIZE
============================================================ */
function handleResize() {
  threeResize();
}
