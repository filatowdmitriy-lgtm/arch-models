/* ============================================================
   viewer.js
   МОДУЛЬ: UI вьюера, вкладки, навигация, отображение схем/видео
   ============================================================ */

import { hideGallery, showGallery } from "./gallery.js";
import { navigateNext, navigatePrev } from "./gallery.js";
import { loadModel3D } from "./threeViewer.js";     // загрузка 3D
import { MODELS } from "./models.js";

/* ------------------------------------------------------------
   DOM-элементы
   ------------------------------------------------------------ */

let wrapper       = null;
let modelLabel    = null;

let prevBtn       = null;
let nextBtn       = null;
let backBtn       = null;

let tab3dBtn      = null;
let tabSchemeBtn  = null;
let tabVideoBtn   = null;

let schemeOverlay = null;
let videoOverlay  = null;
let schemeImg     = null;
let videoEl       = null;

/* текущее состояние */
let currentModelId = null;
let activeView = "3d";

/* ------------------------------------------------------------
   ИНИЦИАЛИЗАЦИЯ
   ------------------------------------------------------------ */

export function initViewer(dom) {
  wrapper       = dom.wrapper;
  modelLabel    = dom.modelLabel;

  prevBtn       = dom.prevBtn;
  nextBtn       = dom.nextBtn;
  backBtn       = dom.backBtn;

  tab3dBtn      = dom.tab3dBtn;
  tabSchemeBtn  = dom.tabSchemeBtn;
  tabVideoBtn   = dom.tabVideoBtn;

  schemeOverlay = dom.schemeOverlay;
  videoOverlay  = dom.videoOverlay;
  schemeImg     = dom.schemeImg;
  videoEl       = dom.videoEl;

  setupEvents();
}

/* ------------------------------------------------------------
   СОБЫТИЯ КНОПОК
   ------------------------------------------------------------ */

function setupEvents() {
  /* кнопка галерея */
  backBtn.addEventListener("click", () => {
    wrapper.classList.remove("visible");
    showGallery();
    stopVideo();
  });

  /* навигация */
  prevBtn.addEventListener("click", () => {
    const id = currentModelId;
    if (!id) return;
    const nextId = navigatePrev(id);
    openModel(nextId);
  });

  nextBtn.addEventListener("click", () => {
    const id = currentModelId;
    if (!id) return;
    const nextId = navigateNext(id);
    openModel(nextId);
  });

  /* вкладки */
  tab3dBtn.addEventListener("click", () => setView("3d"));
  tabSchemeBtn.addEventListener("click", () => setView("scheme"));
  tabVideoBtn.addEventListener("click", () => setView("video"));
}

/* ------------------------------------------------------------
   ОТКРЫТИЕ МОДЕЛИ
   ------------------------------------------------------------ */

export function openModel(modelId) {
  currentModelId = modelId;

  const m = MODELS.find(x => x.id === modelId);
  if (!m) return;

  /* заголовок */
  modelLabel.textContent = m.name;

  /* показать вьюер */
  hideGallery();
  wrapper.classList.add("visible");

  /* загрузить модель в three.js */
  loadModel3D(m);

  /* настроить вкладки */
  prepareTabs(m);

  setView("3d");
}

/* ------------------------------------------------------------
   ПОДГОТОВКА ВКЛАДОК ДЛЯ МОДЕЛИ
   ------------------------------------------------------------ */

function prepareTabs(m) {
  // схема
  if (m.schemes && m.schemes.length > 0) {
    tabSchemeBtn.classList.remove("disabled");
    schemeImg.src = m.schemes[0];
  } else {
    tabSchemeBtn.classList.add("disabled");
    schemeImg.removeAttribute("src");
  }

  // видео
  if (m.video) {
    tabVideoBtn.classList.remove("disabled");
    videoEl.src = m.video;
    videoEl.load();
  } else {
    tabVideoBtn.classList.add("disabled");
    videoEl.removeAttribute("src");
  }
}

/* ------------------------------------------------------------
   ПЕРЕКЛЮЧЕНИЕ ВИДА
   ------------------------------------------------------------ */

export function setView(mode) {
  activeView = mode;

  tab3dBtn.classList.toggle("active", mode === "3d");
  tabSchemeBtn.classList.toggle("active", mode === "scheme");
  tabVideoBtn.classList.toggle("active", mode === "video");

  /* --- 3D --- */
  if (mode === "3d") {
    schemeOverlay.style.display = "none";
    videoOverlay.style.display = "none";
    stopVideo();
  }

  /* --- схема --- */
  if (mode === "scheme") {
    schemeOverlay.style.display = "flex";
    videoOverlay.style.display = "none";
    stopVideo();
  }

  /* --- видео --- */
  if (mode === "video") {
    schemeOverlay.style.display = "none";
    videoOverlay.style.display = "flex";
    videoEl.play().catch(() => {});
  }
}

/* ------------------------------------------------------------
   ВИДЕО
   ------------------------------------------------------------ */

function stopVideo() {
  if (!videoEl) return;
  if (!videoEl.paused) videoEl.pause();
}
