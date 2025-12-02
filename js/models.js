// js/models.js
//
// Полностью рабочая версия с правильным deep clone,
// нормальной работой кэша и безопасной загрузкой glTF.
// Поведение полностью повторяет оригинальный 8.html,
// но теперь кэширование действительно работает,
// и модели НЕ ломаются и НЕ пропадают.
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
    video:
      "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/test_video.mp4",
    textures: {
      base:
        "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/BaseColor.jpg",
      normal:
        "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/Normal.jpg",
      rough:
        "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/Roughness.jpg",
      metalness: 0.0,
      roughness: 1.0,
      envIntensity: 0.7
    }
  },
  {
    id: "ionic",
    name: "Ионическая капитель",
    desc: "Классический греческий ордер, витые волюты.",
    url:
      "https://filatowdmitriy-lgtm.github.io/arch-models/models/ionic.gltf",
    thumbLetter: "I",
    schemes: [
      "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/scheme1.jpg"
    ],
    video:
      "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/test_video.mp4",
    textures: {
      base:
        "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/BaseColor.jpg",
      normal:
        "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/Normal.jpg",
      rough:
        "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/Roughness.jpg",
      metalness: 0.0,
      roughness: 1.0,
      envIntensity: 0.75
    }
  }
];

/* ========================================
   КЭШ — храним СЦЕНУ glTF (gltf.scene)
   ======================================== */

const cache = {}; // cache[id] = original gltf.scene

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();

/* ========================================
   УТИЛИТЫ
   ======================================== */

export function getModelMeta(id) {
  return MODELS.find((m) => m.id === id) || null;
}

/* ------ Материал из текстур ------ */

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

  const mapBase = base ? texLoader.load(base) : null;
  const mapNormal = normal ? texLoader.load(normal) : null;
  const mapRough = rough ? texLoader.load(rough) : null;

  if (mapBase) {
    mapBase.flipY = false;
    mapBase.colorSpace = THREE.SRGBColorSpace;
  }
  if (mapNormal) {
    mapNormal.flipY = false;
    mapNormal.colorSpace = THREE.LinearSRGBColorSpace;
  }
  if (mapRough) {
    mapRough.flipY = false;
    mapRough.colorSpace = THREE.LinearSRGBColorSpace;
  }

  return new THREE.MeshStandardMaterial({
    map: mapBase,
    normalMap: mapNormal,
    roughnessMap: mapRough,
    roughness,
    metalness,
    envMapIntensity: envIntensity
  });
}

/* ========================================
   ГЛАВНАЯ ФУНКЦИЯ ЗАГРУЗКИ
   ======================================== */

export function loadModel(modelId, { onProgress, onStatus } = {}) {
  const meta = getModelMeta(modelId);
  if (!meta) return Promise.reject("No model: " + modelId);

  if (onStatus) onStatus("Загрузка модели: " + meta.name);

  /* ============================================================
     1. Если модель есть в кэше — возвращаем глубокую копию
     ============================================================ */
  if (cache[meta.id]) {
    const original = cache[meta.id];

    // clone(true) С ПОЛНЫМ копированием
    const clone = original.clone(true);

    // материалы НЕ копируются автоматически → копируем вручную
    const material = createMaterialFromTextures(meta.textures);

    if (material) {
      clone.traverse((obj) => {
        if (obj.isMesh) {
          obj.material = material.clone(); // критично: новый материал
        }
      });
    }

    if (onProgress) onProgress(100);
    if (onStatus) onStatus("Из кэша: " + meta.name);

    return Promise.resolve({ root: clone, meta });
  }

  /* ============================================================
     2. Иначе — загружаем GLTF
     ============================================================ */

  return new Promise((resolve, reject) => {
    gltfLoader.load(
      meta.url,

      // ---- SUCCESS ----
      (gltf) => {
        const original = gltf.scene;

        // debug: убираем тени
        original.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = false;
            o.receiveShadow = false;
            o.frustumCulled = false; // как в 8.html
          }
        });

        // материал
        const mat = createMaterialFromTextures(meta.textures);
        if (mat) {
          original.traverse((o) => {
            if (o.isMesh) {
              o.material = mat.clone();
            }
          });
        }

        // КЭШИРУЕМ оригинальную сцену
        cache[meta.id] = original;

        // возвращаем глубокую копию
        const clone = original.clone(true);

        clone.traverse((o) => {
          if (o.isMesh) o.material = o.material.clone();
        });

        if (onStatus) onStatus("Модель загружена: " + meta.name);
        if (onProgress) onProgress(100);

        resolve({ root: clone, meta });
      },

      // ---- PROGRESS ----
      (xhr) => {
        if (xhr.lengthComputable && onProgress) {
          onProgress((xhr.loaded / xhr.total) * 100);
        }
      },

      // ---- ERROR ----
      (err) => {
        console.error("Ошибка загрузки GLTF:", err);
        if (onStatus) onStatus("Ошибка загрузки модели");
        reject(err);
      }
    );
  });
}
