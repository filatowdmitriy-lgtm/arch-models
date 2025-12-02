/* ============================================================
   models.js
   МОДУЛЬ: список моделей + загрузка GLTF + материалы + масштаб
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* ------------------------------------------------------------
   1) Список всех архитектурных моделей в приложении
   ------------------------------------------------------------ */

export const MODELS = [
  {
    id: "doric",
    name: "Дорическая капитель",
    desc: "Архаический строгий стиль.",
    url: "https://filatowdmitriy-lgtm.github.io/arch-models/models/doric.gltf",
    thumbLetter: "D",
    schemes: [
      "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/scheme1.jpg"
    ],
    video: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/test_video.mp4",
    textures: {
      base:     "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/BaseColor.jpg",
      normal:   "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/Normal.jpg",
      rough:    "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/Roughness.jpg"
    }
  },

  {
    id: "ionic",
    name: "Ионическая капитель",
    desc: "Классический греческий ордер, витые волюты.",
    url: "https://filatowdmitriy-lgtm.github.io/arch-models/models/ionic.gltf",
    thumbLetter: "I",
    schemes: [
      "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/scheme1.jpg"
    ],
    video: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/test_video.mp4",
    textures: {
      base:     "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/BaseColor.jpg",
      normal:   "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/Normal.jpg",
      rough:    "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/Roughness.jpg"
    }
  }
];

/* ------------------------------------------------------------
   2) Кэш загруженных моделей (clone=true)
   ------------------------------------------------------------ */
export const modelCache = {};

/* ------------------------------------------------------------
   3) Глобальные ссылки, которые сюда передаёт threeViewer.js
   ------------------------------------------------------------ */
let sceneRef = null;
let cameraRef = null;
let stateRef = null;

/* Инициализация внешних ссылок */
export function initModelSystem(scene, camera, state) {
  sceneRef = scene;
  cameraRef = camera;
  stateRef = state;
}

/* ------------------------------------------------------------
   4) ХЕЛПЕР: загрузка текстур PBR для конкретной модели
   ------------------------------------------------------------ */
function loadMaterialFor(modelMeta) {
  const loader = new THREE.TextureLoader();

  const texBase  = loader.load(modelMeta.textures.base);
  const texNorm  = loader.load(modelMeta.textures.normal);
  const texRough = loader.load(modelMeta.textures.rough);

  texBase.flipY  = false;
  texNorm.flipY  = false;
  texRough.flipY = false;

  texBase.colorSpace  = THREE.SRGBColorSpace;
  texNorm.colorSpace  = THREE.LinearSRGBColorSpace;
  texRough.colorSpace = THREE.LinearSRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    map: texBase,
    normalMap: texNorm,
    roughnessMap: texRough,
    metalness: 0,
    roughness: 1,
    envMapIntensity: 0.7
  });
}

/* ------------------------------------------------------------
   5) ХЕЛПЕР: авторасчёт камеры по bounding sphere
   ------------------------------------------------------------ */
function fitCameraToModel(root, camera, state) {
  const box = new THREE.Box3().setFromObject(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  const radius = sphere.radius;
  const fovRad = camera.fov * Math.PI / 180;

  let dist = radius / Math.sin(fovRad / 2);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const distanceFactor = isMobile ? 1.55 : 1.0;

  dist *= distanceFactor;

  state.radius = dist;
  state.targetRadius = dist;

  state.minRadius = dist * 0.4;
  state.maxRadius = dist * 6.0;
}

/* ------------------------------------------------------------
   6) ЛОГИКА ЗАГРУЗКИ GLTF МОДЕЛИ
   ------------------------------------------------------------ */

/**
 * loadModel(modelId):
 *   - загружает модель (с кешированием)
 *   - применяет материалы
 *   - центрирует
 *   - масштабирует под сцену
 *   - возвращает root-группу
 */
export function loadModel(modelId, onProgress) {
  const meta = MODELS.find(m => m.id === modelId);
  if (!meta) throw new Error("Не найдена модель: " + modelId);

  // Если уже в кэше — быстро возвращаем
  if (modelCache[meta.id]) {
    return Promise.resolve(modelCache[meta.id].clone(true));
  }

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    loader.load(
      meta.url,

      /* ----- УСПЕШНАЯ ЗАГРУЗКА ----- */
      gltf => {
        const root = new THREE.Group();
        root.add(gltf.scene);

        /* 1) Материалы */
        const material = loadMaterialFor(meta);

        root.traverse(obj => {
          if (obj.isMesh) {
            obj.material = material;
            obj.castShadow = false;
            obj.receiveShadow = false;
          }
        });

        /* 2) Центрирование */
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        gltf.scene.position.sub(center);

        /* 3) Масштабирование */
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const base = 2.0;
        const scale = base / maxDim;
        root.scale.setScalar(scale);

        /* 4) Повторный bounding sphere */
        fitCameraToModel(root, cameraRef, stateRef);

        /* 5) Сохраняем оригинал в кэш */
        modelCache[meta.id] = root.clone(true);

        resolve(root);
      },

      /* ----- ПРОГРЕСС ----- */
      xhr => {
        if (xhr.lengthComputable && onProgress) {
          onProgress((xhr.loaded / xhr.total) * 100);
        }
      },

      /* ----- ОШИБКА ЗАГРУЗКИ ----- */
      err => reject(err)
    );
  });
}

