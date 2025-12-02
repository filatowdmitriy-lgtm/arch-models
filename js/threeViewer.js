// js/threeViewer.js
//
// Модуль 3D-вьюера на three.js
// Отвечает ТОЛЬКО за 3D:
// - создание сцены, камеры, света;
// - управление мышью и тачем (вращение + zoom);
// - плавная анимация камеры;
// - подгонка камеры под размер модели;
// - resize окна.
//
// Никакого UI, схем, видео, галереи и вкладок здесь нет.
// Вся логика идентична оригинальному 8.html.
//
// Использование:
//   import { initThree, setModel, resize } from "./threeViewer.js";
//
//   initThree(canvas);
//   setModel(rootGroup);
//   window.addEventListener("resize", resize);
//

import * as THREE from "three";

let scene = null;
let camera = null;
let renderer = null;

/* ==============================
   СОСТОЯНИЕ КАМЕРЫ (из 8.html)
   ============================== */
const state = {
  radius: 4.5,
  minRadius: 2.0,
  maxRadius: 12.0,
  rotX: 0.10,
  rotY: 0.00,
  targetRotX: 0.10,
  targetRotY: 0.00
};

let currentModel = null;

/* ==============================
   initThree(canvas)
   ============================== */

export function initThree(canvas) {
  // === СЦЕНА ===
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050506);

  // === КАМЕРА ===
  camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    50
  );
  updateCameraPosition();

  // === РЕНДЕР ===
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  // === ОСВЕЩЕНИЕ (полный перенос из 8.html) ===
  const zenith = new THREE.DirectionalLight(0xf5f8ff, 0.0);
  zenith.position.set(0, 11, 2);
  scene.add(zenith);

  const key = new THREE.DirectionalLight(0xffc4a0, 1.85);
  key.position.set(5.5, 6.0, 3.5);
  key.castShadow = false;
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

  // === GESTURES ===
  initControls(canvas);

  // === ФРЕЙМ-АНИМАЦИЯ (как в 8.html) ===
  renderer.setAnimationLoop(() => {
    state.rotX += (state.targetRotX - state.rotX) * 0.22;
    state.rotY += (state.targetRotY - state.rotY) * 0.22;

    updateCameraPosition();
    renderer.render(scene, camera);
  });
}

/* ==============================
   setModel(root)
   ============================== */

export function setModel(root) {
  if (!scene) return;

  if (currentModel) {
    scene.remove(currentModel);
  }

  currentModel = root;
  scene.add(currentModel);

  // Сброс вращения (как в 8.html)
  state.targetRotX = 0.10;
  state.targetRotY = 0.00;

  // Пересчёт дистанции камеры — алгоритм 1:1
  fitCameraToModel(root);
}

/* ==============================
   fitCameraToModel(root)
   ============================== */

function fitCameraToModel(root) {
  // bounding sphere после масштабирования из models.js
  const box = new THREE.Box3().setFromObject(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const baseRadius = sphere.radius || 2.0;

  const fovRad = camera.fov * Math.PI / 180;
  let dist = baseRadius / Math.sin(fovRad / 2);

  // Мобильный фактор — как в 8.html
  const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const distanceFactor = isMobile ? 1.55 : 1;
  dist *= distanceFactor;

  state.radius = dist;
  state.minRadius = dist * 0.4;
  state.maxRadius = dist * 6.0;
}

/* ==============================
   CAMERA MATH
   ============================== */

function updateCameraPosition() {
  const r = state.radius;
  const x = r * Math.sin(state.rotY) * Math.cos(state.rotX);
  const z = r * Math.cos(state.rotY) * Math.cos(state.rotX);
  const y = r * Math.sin(state.rotX);

  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
}

/* ==============================
   resize()
   ============================== */

export function resize() {
  if (!renderer || !camera) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ==============================
   GESTURES (копия 8.html)
   ============================== */

function initControls(canvas) {
  let isDragging = false;
  let lastX = 0, lastY = 0;
  let touchMode = null;
  let lastPinchDist = 0;

  // === MOUSE ===
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

    // Ограничения как в 8.html
    state.targetRotX = Math.max(
      -Math.PI / 2 + 0.2,
      Math.min(Math.PI / 2 - 0.2, state.targetRotX)
    );
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY * 0.002;

    state.radius = THREE.MathUtils.clamp(
      state.radius + delta,
      state.minRadius,
      state.maxRadius
    );
  }, { passive: false });

  // === TOUCH ===
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      touchMode = "rotate";
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      touchMode = "zoom";
      lastPinchDist = pinchDistance(e.touches[0], e.touches[1]);
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
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

      state.targetRotX = Math.max(
        -Math.PI / 2 + 0.2,
        Math.min(Math.PI / 2 - 0.2, state.targetRotX)
      );
    } else if (touchMode === "zoom" && e.touches.length === 2) {
      const dist = pinchDistance(e.touches[0], e.touches[1]);
      const delta = (lastPinchDist - dist) * 0.01;

      lastPinchDist = dist;

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

  function pinchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
