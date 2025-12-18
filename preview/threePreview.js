import * as THREE from "three";

// 1:1 с твоим threeViewer.js
const state = {
  radius: 4.5,
  minRadius: 2.0,
  maxRadius: 12.0,

  rotX: 0.10,
  rotY: 0.00,
  targetRotX: 0.10,
  targetRotY: 0.00
};

export function initPreviewThree(container, size) {
  const scene = new THREE.Scene();

  // ВАЖНО: не задаём scene.background, чтобы PNG был с alpha
  // (в твоём основном threeViewer background = #050506) :contentReference[oaicite:4]{index=4}

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });

  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);

  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  renderer.setSize(size, size, false);

  setupLights(scene);

  // init camera
  updateCameraPosition(camera);

  return {
    scene,
    camera,
    renderer,
    currentModel: null,
    size
  };
}

export function resizePreview(three, container, size) {
  three.size = size;

  container.style.width = size + "px";
  container.style.height = size + "px";

  three.renderer.setSize(size, size, false);

  // aspect квадратный
  three.camera.aspect = 1;
  three.camera.updateProjectionMatrix();
}

export function setPreviewModel(three, root) {
  const { scene } = three;

  // НЕ удаляем lights. Удаляем только модель.
  if (three.currentModel) {
    scene.remove(three.currentModel);
  }

  three.currentModel = root;
  scene.add(root);

  // сброс вращения как в setModel() в твоём файле :contentReference[oaicite:5]{index=5}
  state.targetRotX = 0.10;
  state.targetRotY = 0.00;
  state.rotX = 0.10;
  state.rotY = 0.00;

  fitCameraToModel(three.camera, root);
  updateCameraPosition(three.camera);

  // один гарантированный кадр
  three.renderer.render(three.scene, three.camera);
}

export function renderPNG(three) {
  three.renderer.render(three.scene, three.camera);
  return three.renderer.domElement.toDataURL("image/png");
}

// --- 1:1 с твоим threeViewer.js ---
function fitCameraToModel(camera, root) {
  const box = new THREE.Box3().setFromObject(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius || 1;

  const fovRad = camera.fov * Math.PI / 180;
  let dist = radius / Math.sin(fovRad / 2);

  const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) dist *= 1.55;

  state.radius = dist;
  state.minRadius = dist * 0.4;
  state.maxRadius = dist * 6.0;
}

function updateCameraPosition(camera) {
  const r = state.radius;

  const x = r * Math.sin(state.rotY) * Math.cos(state.rotX);
  const z = r * Math.cos(state.rotY) * Math.cos(state.rotX);
  const y = r * Math.sin(state.rotX);

  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
}

function setupLights(scene) {
  // 1:1 копия твоего освещения :contentReference[oaicite:6]{index=6}
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

  const coldRim = new THREE.DirectionalLight(0xd8e4ff, 0.1);
  coldRim.position.set(2.5, 3.5, -5);
  scene.add(coldRim);

  scene.add(new THREE.AmbientLight(0xffffff, 0.04));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x0a0a0a, 0.07));
}
