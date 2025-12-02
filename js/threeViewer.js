// js/threeViewer.js
//
// Версия с DEBUG визуализацией:
// - Показывает bounding box красной рамкой
// - Показывает центр модели зелёной точкой
// - Логирует box и центр в консоль
//
// Это помогает понять, где находится модель и куда смотрит камера.
//

import * as THREE from "three";

let scene = null;
let camera = null;
let renderer = null;

const state = {
  radius: 4.5,
  minRadius: 2,
  maxRadius: 12,

  rotX: 0.10,
  rotY: 0.00,
  targetRotX: 0.10,
  targetRotY: 0.00,

  center: new THREE.Vector3(0,0,0)
};

let currentModel = null;

/* =========================================================
   initThree(canvas)
   ========================================================= */

export function initThree(canvas) {
  // СЦЕНА
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222); // DEBUG фон, чтобы модель было видно

  // КАМЕРА
  camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );

  updateCameraPosition();

  // РЕНДЕРЕР
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // СВЕТ (как в 8.html)
  setupLights();

  // ЖЕСТЫ
  initControls(canvas);

  // АНИМАЦИЯ
  renderer.setAnimationLoop(() => {
    state.rotX += (state.targetRotX - state.rotX) * 0.22;
    state.rotY += (state.targetRotY - state.rotY) * 0.22;

    updateCameraPosition();
    renderer.render(scene, camera);
  });
}

/* =========================================================
   setModel(root)
   ========================================================= */

export function setModel(root) {
  if (!scene) return;

  // удаляем старую модель
  if (currentModel) {
    scene.remove(currentModel);
  }

  currentModel = root;
  scene.add(currentModel);

  // Сброс камеры к дефолтным углам
  state.targetRotX = 0.10;
  state.targetRotY = 0.00;

  fitCameraToModel(root);
  debugModel(root); // включаем debug-отрисовку
}

/* =========================================================
   fitCameraToModel
   ========================================================= */

function fitCameraToModel(root) {
  const box = new THREE.Box3().setFromObject(root);

  // Центр модели
  box.getCenter(state.center);

  // Радиус модели
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const baseRadius = sphere.radius || 1.0;

  const fovRad = camera.fov * Math.PI / 180;
  let dist = baseRadius / Math.sin(fovRad / 2);

  const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) dist *= 1.55;

  state.radius = dist;
  state.minRadius = dist * 0.4;
  state.maxRadius = dist * 6.0;

  console.warn("=== FIT CAMERA ===");
  console.warn("BOX:", box);
  console.warn("CENTER:", state.center);
  console.warn("RADIUS:", baseRadius, "DIST:", dist);
}

/* =========================================================
   CAMERA POSITION
   ========================================================= */

function updateCameraPosition() {
  const r = state.radius;

  const x = r * Math.sin(state.rotY) * Math.cos(state.rotX);
  const z = r * Math.cos(state.rotY) * Math.cos(state.rotX);
  const y = r * Math.sin(state.rotX);

  camera.position.set(
    state.center.x + x,
    state.center.y + y,
    state.center.z + z
  );

  camera.lookAt(state.center);
}

/* =========================================================
   resize()
   ========================================================= */

export function resize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* =========================================================
   LIGHTS (копия из 8.html)
   ========================================================= */

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

  scene.add(new THREE.AmbientLight(0xffffff, 0.04));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x000000, 0.07));
}

/* =========================================================
   DEBUG VISUALIZATION
   ========================================================= */

function debugModel(root) {
  // Удаляем старые debug элементы
  scene.children = scene.children.filter(obj => obj.name !== "DEBUG_HELPER");

  // BOX
  const box = new THREE.Box3().setFromObject(root);
  const helper = new THREE.Box3Helper(box, 0xff0000);
  helper.name = "DEBUG_HELPER";
  scene.add(helper);

  // CENTER POINT
  const center = box.getCenter(new THREE.Vector3());
  const point = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  point.position.copy(center);
  point.name = "DEBUG_HELPER";
  scene.add(point);

  console.warn("=== DEBUG: MODEL BOX ===", box);
  console.warn("=== DEBUG: CENTER ===", center);
}

/* =========================================================
   CONTROLS (мышь и тач)
   ========================================================= */

function initControls(canvas) {
  let dragging = false;
  let lastX = 0, lastY = 0;

  let touchMode = null;
  let lastPinch = 0;

  // MOUSE
  canvas.addEventListener("mousedown", e => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener("mouseup", () => dragging = false);

  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    state.targetRotY += dx * -0.005;
    state.targetRotX += dy * 0.005;
    state.targetRotX = Math.max(-1.3, Math.min(1.3, state.targetRotX));
  });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    state.radius = THREE.MathUtils.clamp(
      state.radius + e.deltaY * 0.002,
      state.minRadius,
      state.maxRadius
    );
  }, { passive: false });

  // TOUCH
  canvas.addEventListener("touchstart", e => {
    e.preventDefault();
    if (e.touches.length === 1) {
      touchMode = "rotate";
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      touchMode = "zoom";
      lastPinch = pinch(e.touches[0], e.touches[1]);
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", e => {
    if (!touchMode) return;
    e.preventDefault();

    if (touchMode === "rotate" && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - lastX;
      const dy = t.clientY - lastY;

      lastX = t.clientX;
      lastY = t.clientY;

      state.targetRotY += dx * -0.008;
      state.targetRotX += dy * 0.008;
      state.targetRotX = Math.max(-1.3, Math.min(1.3, state.targetRotX));
    }

    if (touchMode === "zoom" && e.touches.length === 2) {
      const dist = pinch(e.touches[0], e.touches[1]);
      const delta = (lastPinch - dist) * 0.01;
      lastPinch = dist;

      state.radius = THREE.MathUtils.clamp(
        state.radius + delta,
        state.minRadius,
        state.maxRadius
      );
    }
  }, { passive: false });

  window.addEventListener("touchend", () => {
    touchMode = null;
  });

  function pinch(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
