// js/threeViewer.js
//
// Стабильная рабочая версия до всех фиксов центра.
// Модель отображается корректно, ничего не ломается.
// Единственный минус: pivot смещён, но мы потом исправим.
//

import * as THREE from "three";

let scene = null;
let camera = null;
let renderer = null;

let currentModel = null;

const state = {
  radius: 4.5,
  minRadius: 2.0,
  maxRadius: 12.0,

  rotX: 0.10,
  rotY: 0.00,
  targetRotX: 0.10,
  targetRotY: 0.00,
};

/* ============================================================
   initThree
   ============================================================ */

export function initThree(canvas) {
  // сцена
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050506);

  // камера
  camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    50
  );

  updateCameraPosition();

  // рендер
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  setupLights();

  initControls(canvas);

  renderer.setAnimationLoop(() => {
    state.rotX += (state.targetRotX - state.rotX) * 0.22;
    state.rotY += (state.targetRotY - state.rotY) * 0.22;

    updateCameraPosition();
    renderer.render(scene, camera);
  });
}

/* ============================================================
   setModel
   ============================================================ */

export function setModel(root) {
  if (currentModel) {
    scene.remove(currentModel);
  }

  currentModel = root;
  scene.add(currentModel);

  state.targetRotX = 0.10;
  state.targetRotY = 0.00;

  fitCameraToModel(root);
}

/* ============================================================
   fitCameraToModel — старая рабочая логика
   ============================================================ */

function fitCameraToModel(root) {
  // bounding sphere
  const box = new THREE.Box3().setFromObject(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  const radius = sphere.radius || 2;

  const fov = camera.fov * Math.PI / 180;
  let dist = radius / Math.sin(fov / 2);

  const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) dist *= 1.55;

  state.radius = dist;
  state.minRadius = dist * 0.4;
  state.maxRadius = dist * 6.0;
}

/* ============================================================
   updateCameraPosition
   ============================================================ */

function updateCameraPosition() {
  const r = state.radius;
  const x = r * Math.sin(state.rotY) * Math.cos(state.rotX);
  const z = r * Math.cos(state.rotY) * Math.cos(state.rotX);
  const y = r * Math.sin(state.rotX);

  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0); // ⭐ pivot пока фиксирован в (0,0,0)
}

/* ============================================================
   resize
   ============================================================ */

export function resize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ============================================================
   LIGHTS — как в 8.html
   ============================================================ */

function setupLights() {
  const zenith = new THREE.DirectionalLight(0xf5f8ff, 0.0);
  zenith.position.set(0, 11, 2);
  scene.add(zenith);

  const key = new THREE.DirectionalLight(0xffc4a0, 1.85);
  key.position.set(5.5, 6.0, 3.5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xcad8ff, 0.35);
  fill.position.set(-7, 3.5, 2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(-3.5, 5, -7.5);
  scene.add(rim);

  const rimCold = new THREE.DirectionalLight(0xd8e4ff, 0.1);
  rimCold.position.set(2.5, 3.5, -5);
  scene.add(rimCold);

  const ambient = new THREE.AmbientLight(0xffffff, 0.04);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x0a0a0a, 0.07);
  scene.add(hemi);
}

/* ============================================================
   CONTROLS — копия из 8.html
   ============================================================ */

function initControls(canvas) {
  let isDragging = false;
  let lastX = 0,
    lastY = 0;

  let touchMode = null;
  let lastPinchDist = 0;

  // MOUSE
  canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    lastX = e.clientX;
    lastY = e.clientY;

    state.targetRotY += dx * -0.005;
    state.targetRotX += dy * 0.005;

    state.targetRotX = Math.max(
      -Math.PI / 2 + 0.2,
      Math.min(Math.PI / 2 - 0.2, state.targetRotX)
    );
  });

  // SCROLL
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = e.deltaY * 0.002;

      state.radius = THREE.MathUtils.clamp(
        state.radius + delta,
        state.minRadius,
        state.maxRadius
      );
    },
    { passive: false }
  );

  // TOUCH
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        touchMode = "rotate";
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        touchMode = "zoom";
        lastPinchDist = pinch(e.touches[0], e.touches[1]);
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (!touchMode) return;
      e.preventDefault();

      if (touchMode === "rotate") {
        const t = e.touches[0];
        const dx = t.clientX - lastX;
        const dy = t.clientY - lastY;

        lastX = t.clientX;
        lastY = t.clientY;

        state.targetRotY += dx * -0.008;
        state.targetRotX += dy * 0.008;

        state.targetRotX = Math.max(
          -Math.PI / 2 + 0.2,
          Math.min(Math.PI / 2 - 0.2, state.targetRotX)
        );
      }

      if (touchMode === "zoom" && e.touches.length === 2) {
        const dist = pinch(e.touches[0], e.touches[1]);
        const delta = (lastPinchDist - dist) * 0.01;

        lastPinchDist = dist;

        state.radius = THREE.MathUtils.clamp(
          state.radius + delta,
          state.minRadius,
          state.maxRadius
        );
      }
    },
    { passive: false }
  );

  window.addEventListener("touchend", () => {
    touchMode = null;
  });

  function pinch(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
