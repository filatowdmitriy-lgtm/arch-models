// js/viewer.js
//
// "Мозг" вьюера:
// - переключает галерея / 3D / схема / видео
// - управляет UI / кнопками
// - сообщает threeViewer, какую модель показать
// - подключает схему и blob-видео (она в video.js).
//
// Использование (из app.js):
// initViewer(domRefs);
// openModelById("doric");

import { setActiveModelId, getModelMeta, loadModel3D } from "./models.js";
import { showGallery, hideGallery, setGalleryActiveModel, bindGalleryEvents } from "./gallery.js";
import { initThreeViewer, setModelToScene, clearScene } from "./threeViewer.js";
import {
  initScheme,
  setSchemeImages,
  activateScheme,
  deactivateScheme
} from "./scheme.js";
import {
  initVideo,
  setVideoList,
  setVideoIndex,
  activateVideo,
  deactivateVideo
} from "./video.js";

/* ===============================
   ВНУТРЕННЕЕ СОСТОЯНИЕ
   =============================== */

let dom = {};
let activeModelId = null;
let activeView = "3d"; // "3d" | "scheme" | "video"
let uiHidden = false;

let openFromGallery = false;

/* ===============================
   INIT
   =============================== */

export function initViewer(refs) {
  // Ожидаемые элементы:
  // galleryEl, viewerWrapperEl, viewerToolbarEl,
  // backBtn, prevBtn, nextBtn,
  // modelLabelEl,
  // tab3dBtn, tabSchemeBtn, tabVideoBtn,
  // canvasEl,
  // schemeOverlayEl, schemeImgEl,
  // videoOverlayEl, videoEl,
  // loadingEl, loadingTextEl, progressBarEl,
  // statusEl
  dom = { ...refs };

  // video gallery контейнер (добавили в index.html). Если его нет в refs - возьмём напрямую.
  if (!dom.videoGalleryEl) {
    dom.videoGalleryEl = document.getElementById("videoGallery");
  }

  if (!dom.viewerToolbarEl) {
    dom.viewerToolbarEl = document.getElementById("viewerToolbar");
  }
  if (!dom.viewerWrapperEl) {
    dom.viewerWrapperEl = document.getElementById("viewerWrapper");
  }

  // three.js init
  initThreeViewer(dom.canvasEl);

  // схема init
  initScheme(dom.schemeImgEl);

  // видео init
  initVideo(dom.videoEl, {
    onPlay: () => {
      setUiHidden(true);
      document.body.classList.add("video-playing");
    },
    onPause: () => {
      setUiHidden(false);
      document.body.classList.remove("video-playing");
    }
  });

  // Навешиваем обработчики UI
  setupUiHandlers();

  // 🔥 3D canvas: прячем UI при взаимодействии
  setup3dUiAutoHide();

  // Глобальный touchmove-block, когда открыт viewer
  setupGlobalTouchBlock();

  // Ресайз окна → три-вьюер + reset схемы при необходимости
  window.addEventListener("resize", () => {
    // threeViewer сам слушает resize, но если у тебя там отдельно — можно дернуть
  });

  // Галерея events
  bindGalleryEvents({
    onSelect: (id) => {
      openFromGallery = true;
      openModelById(id);
    }
  });

  // По умолчанию показываем viewer (если так у тебя задумано)
  hideGallery();
}

/* ===============================
   UI helpers
   =============================== */

function setStatus(text) {
  if (!dom.statusEl) return;
  dom.statusEl.textContent = text || "";
}

function showLoading(text = "Загрузка...") {
  if (!dom.loadingEl) return;
  dom.loadingEl.classList.add("show");
  if (dom.loadingTextEl) dom.loadingTextEl.textContent = text;
  if (dom.progressBarEl) dom.progressBarEl.style.width = "0%";
}

function hideLoading() {
  if (!dom.loadingEl) return;
  dom.loadingEl.classList.remove("show");
}

function setProgress(p) {
  if (!dom.progressBarEl) return;
  const v = Math.max(0, Math.min(100, p || 0));
  dom.progressBarEl.style.width = `${v}%`;
}

function setUiHidden(hidden) {
  uiHidden = !!hidden;
  document.body.classList.toggle("ui-hidden", uiHidden);
}

/* ===============================
   Touch block (Telegram)
   =============================== */

function setupGlobalTouchBlock() {
  document.addEventListener(
    "touchmove",
    (e) => {
      // блокируем глобальный скролл, если viewer активен (как у тебя было)
      // но не блокируем внутри scheme/video overlay, где нужны жесты
      const overlay = e.target.closest && (e.target.closest("#schemeOverlay") || e.target.closest("#videoOverlay"));
      if (overlay) return;
      // если вдруг галерея открыта — там скролл нужен
      const inGallery = e.target.closest && e.target.closest("#gallery");
      if (inGallery) return;

      e.preventDefault();
    },
    { passive: false }
  );
}

/* ===============================
   3D UI auto-hide
   =============================== */

function setup3dUiAutoHide() {
  if (!dom.canvasEl) return;

  let hideTimer = null;

  const showUi = () => {
    setUiHidden(false);
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      // прячем UI только в 3D, и только если не видео фуллскрин
      if (activeView === "3d" && !document.body.classList.contains("video-playing")) {
        setUiHidden(true);
      }
    }, 1400);
  };

  dom.canvasEl.addEventListener("pointerdown", showUi, { passive: true });
  dom.canvasEl.addEventListener("pointermove", showUi, { passive: true });
}

/* ===============================
   Gallery / Viewer navigation
   =============================== */

function setupUiHandlers() {
  const { backBtn, prevBtn, nextBtn, galleryBtn, tab3dBtn, tabSchemeBtn, tabVideoBtn } = dom;

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      // возвращаемся в галерею
      showGallery();
      setUiHidden(false);
      document.body.classList.remove("video-playing");
    });
  }

  if (galleryBtn) {
    galleryBtn.addEventListener("click", () => {
      showGallery();
      setUiHidden(false);
      document.body.classList.remove("video-playing");
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      openPrevModel();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      openNextModel();
    });
  }

  if (tab3dBtn) {
    tab3dBtn.addEventListener("click", () => setViewMode("3d"));
  }
  if (tabSchemeBtn) {
    tabSchemeBtn.addEventListener("click", () => {
      if (tabSchemeBtn.classList.contains("disabled")) return;
      setViewMode("scheme");
    });
  }
  if (tabVideoBtn) {
    tabVideoBtn.addEventListener("click", () => {
      if (tabVideoBtn.classList.contains("disabled")) return;
      setViewMode("video");
    });
  }
}

function openPrevModel() {
  const meta = getModelMeta(activeModelId);
  if (!meta) return;
  // У тебя уже есть порядок моделей в models.js — логика обычно там/в gallery.js.
  // Я не трогаю: если у тебя есть ready-функции — подставь тут.
  // Пока просто дернем галерею (если она умеет prev/next).
  showGallery();
}

function openNextModel() {
  const meta = getModelMeta(activeModelId);
  if (!meta) return;
  showGallery();
}

/* ===============================
   Main: open model
   =============================== */

export function openModelById(id) {
  const meta = getModelMeta(id);
  if (!meta) {
    console.warn("openModelById: model meta not found", id);
    return;
  }

  activeModelId = id;
  setActiveModelId(id);
  setGalleryActiveModel(id);

  // label
  if (dom.modelLabelEl) dom.modelLabelEl.textContent = meta.name || id;

  hideGallery();

  // tabs for this model
  configureViewTabsForModel(meta);

  // by default go 3d (как у тебя было)
  setViewMode("3d");

  // load 3D
  loadAndShowModel(meta);
}

async function loadAndShowModel(meta) {
  showLoading("Загрузка модели...");
  setStatus("");

  try {
    // твой loader уже даёт progress — подцепим
    const { root } = await loadModel3D(meta, (p) => {
      setProgress(p);
    });

    // Передаём модель в threeViewer
    setModelToScene(root);

    hideLoading();
    setStatus("Готово");
  } catch (err) {
    console.error("Ошибка загрузки модели:", err);
    hideLoading();
    setStatus("Ошибка загрузки модели");
    alert("Ошибка загрузки модели.");
  }
}

/* ===================================
   VIDEO CARDS (как галерея)
   =================================== */

function renderVideoCards(urls) {
  const { videoGalleryEl } = dom;
  if (!videoGalleryEl) return;

  videoGalleryEl.innerHTML = "";

  if (!urls || !urls.length) return;

  urls.forEach((url, i) => {
    const card = document.createElement("div");
    card.className = "video-card";

    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.playsInline = true;

    // карточки = лёгкие. Никаких blob, только metadata.
    v.preload = "metadata";
    v.muted = true;
    v.controls = false;
    v.src = url;

    card.appendChild(v);

    // тап по карточке -> делаем это видео активным и стартуем (дальше уже твоя логика fullscreen)
    card.addEventListener("click", async () => {
      // не трогаем UI-логику: она висит на событиях play/pause главного player'а
      setVideoList(urls);
      setVideoIndex(i);
      try {
        await dom.videoEl.play();
      } catch (e) {
        // если автоплей запрещён - просто оставим готовым к play
      }
    });

    videoGalleryEl.appendChild(card);
  });
}

/* ===================================
   Tabs configuration per model
   =================================== */

function configureViewTabsForModel(meta) {
  const { tabSchemeBtn, tabVideoBtn } = dom;

  const hasScheme = meta.schemes && meta.schemes.length > 0;
  const videoUrls = (meta.videos && meta.videos.length ? meta.videos : (meta.video && meta.video.length ? meta.video : (meta.video ? [meta.video] : [])));
  const hasVideo = videoUrls.length > 0;

  // ----- СХЕМЫ -----
  if (hasScheme) {
    tabSchemeBtn.classList.remove("disabled");
    setSchemeImages(meta.schemes);
  } else {
    tabSchemeBtn.classList.add("disabled");
    setSchemeImages([]);
  }

  // ----- ВИДЕО -----
  if (hasVideo) {
    tabVideoBtn.classList.remove("disabled");
    setVideoList(videoUrls);
    renderVideoCards(videoUrls);
  } else {
    tabVideoBtn.classList.add("disabled");
    setVideoList([]);
    renderVideoCards([]);
  }
}

/* ===============================
   View mode switching
   =============================== */

function setViewMode(mode) {
  activeView = mode;

  const {
    tab3dBtn,
    tabSchemeBtn,
    tabVideoBtn,
    schemeOverlayEl,
    videoOverlayEl
  } = dom;

  // Подсветка вкладок
  tab3dBtn.classList.toggle("active", mode === "3d");
  tabSchemeBtn.classList.toggle("active", mode === "scheme");
  tabVideoBtn.classList.toggle("active", mode === "video");

  // ----- СХЕМА -----
  if (schemeOverlayEl) {
    const isScheme = mode === "scheme";
    schemeOverlayEl.style.display = isScheme ? "flex" : "none";
    if (isScheme) {
      activateScheme();
    } else {
      deactivateScheme();
    }
  }

  // ----- ВИДЕО -----
  if (videoOverlayEl) {
    const isVideo = mode === "video";
    videoOverlayEl.style.display = isVideo ? "flex" : "none";

    if (isVideo) {
      activateVideo();
    } else {
      deactivateVideo(); // внутри — pause(), как в 8.html
      document.body.classList.remove("video-playing");
    }
  }

  // При выходе из "Построения" всегда показываем UI
  if (mode !== "scheme") {
    setUiHidden(false);
  }
}
