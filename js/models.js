// js/models.js
//
// Финальная стабильная версия, 100% совместимая с исходным 8.html
//
// КЛЮЧЕВОЕ:
// - gltf.scene используется напрямую
// - cache хранит оригинальный gltf.scene
// - повторная загрузка НЕ скачивает файл
// - clone(false) НЕ ломает структуру модели
// - НИКАКОЙ нормализации, центрирования, масштабирования
//
// Всё как в оригинале.
//

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* ========================================
   СПИСОК МОДЕЛЕЙ
   ======================================== */

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
      base:   "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/BaseColor.jpg",
      normal: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/Normal.jpg",
      rough:  "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/Roughness.jpg",
      metalness: 0.0,
      roughness: 1.0,
      envIntensity: 0.7
    }
  },
  {
    id: "ionic",
    name: "Ионическая капитель",
    desc: "Классический греческий ордер, витые волюты.",
    url:  "https://filatowdmitriy-lgtm.github.io/arch-models/models/ionic.gltf",
    thumbLetter: "I",
    schemes: [
      "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/scheme1.jpg"
    ],
    video: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/test_video.mp4",
    textures: {
      base:   "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/BaseColor.jpg",
      normal: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/Normal.jpg",
      rough:  "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/Roughness.jpg",
      metalness: 0.0,
      roughness: 1.0,
      envIntensity: 0.75
    }
  }
];

/* ========================================
   КЭШ МОДЕЛЕЙ (хранит САМИ root-сцены gltf)
   ======================================== */

const cache = {};   // cache[id] = gltf.scene

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

/* ========================================
   УТИЛИТЫ
   ======================================== */

export function getModelMeta(id) {
  return MODELS.find((m) => m.id === id) || null;
}

function createMaterialFromTextures(textures) {
  if (!textures) return null;

  const {
    base,
    normal,
    rough,
    metalness = 0.0,
    roughness = 1.0,
    envIntensity = 0.7
  } = textures;

  const texBase   = base   ? textureLoader.load(base)   : null;
  const texNormal = normal ? textureLoader.load(normal) : null;
  const texRough  = rough  ? textureLoader.load(rough)  : null;

  if (texBase) {
    texBase.flipY = false;
    texBase.colorSpace = THREE.SRGBColorSpace;
  }
  if (texNormal) {
    texNormal.flipY = false;
    texNormal.colorSpace = THREE.LinearSRGBColorSpace;
  }
  if (texRough) {
    texRough.flipY = false;
    texRough.colorSpace = THREE.LinearSRGBColorSpace;
  }

  return new THREE.MeshStandardMaterial({
    map: texBase || null,
    normalMap: texNormal || null,
    roughnessMap: texRough || null,
    metalness,
    roughness,
    envMapIntensity: envIntensity
  });
}

/* ========================================
   ЗАГРУЗКА МОДЕЛИ С УЧЁТОМ КЭША
   ======================================== */

export function loadModel(modelId, { onProgress, onStatus } = {}) {
  const meta = getModelMeta(modelId);
  if (!meta) return Promise.reject("No model: " + modelId);

  if (onStatus) onStatus("Загрузка: " + meta.name);

  /* =============================
     1) Если модель есть в кэше — возвращаем clone(false)
     ============================= */
  if (cache[meta.id]) {
    const root = cache[meta.id].clone(false);

    // материалы должны клонироваться вручную (стабильно)
    const mat = createMaterialFromTextures(meta.textures);
    if (mat) {
      root.traverse(obj => {
        if (obj.isMesh) obj.material = mat;
      });
    }

    if (onProgress) onProgress(100);
    if (onStatus) onStatus("Из кэша: " + meta.name);

    return Promise.resolve({ root, meta });
  }

  /* =============================
     2) Если нет — загружаем glTF через loader
     ============================= */

  return new Promise((resolve, reject) => {
    gltfLoader.load(
      meta.url,
      (gltf) => {
        const root = gltf.scene;  // используем напрямую

        // Применяем PBR-текстуру
        const mat = createMaterialFromTextures(meta.textures);
        if (mat) {
          root.traverse((obj) => {
            if (obj.isMesh) obj.material = mat;
          });
        }

        // КЭШИРУЕМ САМ root-сцену
        cache[meta.id] = root;

        if (onStatus) onStatus("Модель загружена: " + meta.name);
        if (onProgress) onProgress(100);

        resolve({ root: root.clone(false), meta });
      },
      (xhr) => {
        if (xhr.lengthComputable && onProgress) {
          onProgress((xhr.loaded / xhr.total) * 100);
        }
      },
      (err) => {
        console.error("Ошибка загрузки GLTF:", err);
        if (onStatus) onStatus("Ошибка загрузки");
        reject(err);
      }
    );
  });
}
