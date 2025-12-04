// js/privacyMode.js
//
// Централизованный "privacy mode":
// - слушает системные триггеры (visibilitychange, blur/focus, webglcontextlost);
// - включает/выключает режим приватности;
// - рассылает события подписчикам (3D, схемы, видео).

let enabled = false;

const callbacks = {
  onShow: [],
  onHide: []
};

export function onPrivacyShow(cb) {
  if (typeof cb === "function") {
    callbacks.onShow.push(cb);
  }
}

export function onPrivacyHide(cb) {
  if (typeof cb === "function") {
    callbacks.onHide.push(cb);
  }
}

export function activatePrivacyMode() {
  if (!enabled) {
    enabled = true;
    document.getElementById("debug-log").textContent = "PRIVACY MODE ACTIVATED"; // TEMP TEST
    callbacks.onShow.forEach((cb) => cb());
  }
}

export function deactivatePrivacyMode() {
  if (enabled) {
    enabled = false;
    document.getElementById("debug-log").textContent = "PRIVACY MODE DEACTIVATED"; // TEMP TEST
    callbacks.onHide.forEach((cb) => cb());
  }
}



export function isPrivacyEnabled() {
  return enabled;
}

// Инициализация детекции.
// canvasEl нужен для webglcontextlost/webglcontextrestored.
export function initPrivacyDetection(canvasEl) {
  // iOS / WebView: скрин/запись часто дают visibilitychange
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      activatePrivacyMode();
    } else {
      deactivatePrivacyMode();
    }
  });

  // Android / WebView: запись экрана часто триггерит blur/focus
  window.addEventListener("blur", activatePrivacyMode);
  window.addEventListener("focus", deactivatePrivacyMode);

  // WebGL контекст потерян → тоже включаем privacy
  if (canvasEl && canvasEl.addEventListener) {
    canvasEl.addEventListener(
      "webglcontextlost",
      (e) => {
        // желательно не пытаться сразу ресторить, просто скрыть контент
        activatePrivacyMode();
      },
      false
    );

    canvasEl.addEventListener(
      "webglcontextrestored",
      () => {
        deactivatePrivacyMode();
      },
      false
    );
  }
}
