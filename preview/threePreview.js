import * as THREE from "three";

let state = {
  radius: 4.5,
  rotX: 0.10,
  rotY: 0.00
};

export function initPreviewThree(container, size) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });

  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);

  container.appendChild(renderer.domElement);

  setupLights(scene);

  return { scene, camera, renderer };
}

export function setPreviewModel(scene, camera, root) {
  scene.add(root);

  // --- 1 в 1 fitCameraToModel ---
  const box = new THREE.Box3().setFromObject(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius || 1;

  const fovRad = camera.fov * Math.PI / 180;
  const dist = radius / Math.sin(fovRad / 2);

  state.radius = dist;

  updateCamera(camera);
}

function updateCamera(camera) {
  const r = state.radius;

  const x = r * Math.sin(state.rotY) * Math.cos(state.rotX);
  const z = r * Math.cos(state.rotY) * Math.cos(state.rotX);
  const y = r * Math.sin(state.rotX);

  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
}

export function renderPNG(renderer, scene, camera) {
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}

// --- lighting copied 1:1 ---
function setupLights(scene) {
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
