//
// FULL MODELS.JS — PERSISTENT CACHE + НИКАКИХ СЛОМОВ ПОВЕДЕНИЯ
//

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { cachedFetch } from "./cache/cachedFetch.js"; // <— добавили

// ============= СПИСОК МОДЕЛЕЙ =============
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
    url: "https://filatowdmitriy-lgtm.github.io/arch-models/models/ionic.gltf",
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

export function getModelMeta(id) {
  return MODELS.find((m) => m.id === id) || null;
}

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const modelCache = new Map();

// ============= МАТЕРИАЛЫ — без изменений =============
function createMaterialFromTextures(textures) {
  if (!textures) return null;

  const texBase = textures.base ? textureLoader.load(textures.base) : null;
  const texNormal = textures.normal ? textureLoader.load(textures.normal) : null;
  const texRough = textures.rough ? textureLoader.load(textures.rough) : null;

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
    metalness: textures.metalness ?? 0,
    roughness: textures.roughness ?? 1,
    envMapIntensity: textures.envIntensity ?? 0.7
  });
}

// ============= НОРМАЛИЗАЦИЯ — без изменений =============
function normalizeModel(rootGroup, gltfScene) {
  const box = new THREE.Box3().setFromObject(rootGroup);

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  gltfScene.position.sub(center);

  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.0 / maxSize;
  rootGroup.scale.setScalar(scale);
}

// =====================================================
//       ГЛАВНАЯ ФУНКЦИЯ ЗАГРУЗКИ МОДЕЛИ
// =====================================================
export function loadModel(modelId, { onProgress, onStatus } = {}) {
  const meta = getModelMeta(modelId);
  if (!meta) return Promise.reject("No model: " + modelId);

  // ⭐ 1. Мгновенный кэш твоего приложения
  if (modelCache.has(modelId)) {
    if (onStatus) onStatus("Готово (кэш)");
    if (onProgress) onProgress(100);
    return Promise.resolve({ root: modelCache.get(modelId), meta });
  }

  if (onStatus) onStatus("Загрузка: " + meta.name);

  const url = meta.url;
  const binUrl = url.replace(".gltf", ".bin");

  return new Promise(async (resolve, reject) => {
    try {
      // ⭐ 2. PERSISTENT CACHE (IndexedDB)
      const gltfBlob = await cachedFetch(url);
      const binBlob = await cachedFetch(binUrl);

      const gltfObjectURL = URL.createObjectURL(gltfBlob);
      const binObjectURL = URL.createObjectURL(binBlob);

      // ⭐ 3. Подменяем BIN на blob
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((u) => {
        if (u.endsWith(".bin")) return binObjectURL;
        return u;
      });

      const loader = new GLTFLoader(manager);

      // ⭐ 4. Дальше — твой родной код загрузки
      loader.load(
        gltfObjectURL,

        (gltf) => {
          const scene = gltf.scene;

          const rootGroup = new THREE.Group();
          rootGroup.add(scene);

          // материалы
          const mat = createMaterialFromTextures(meta.textures);
          if (mat) {
            scene.traverse((obj) => {
              if (obj.isMesh) {
                obj.material = mat;
                obj.castShadow = false;
                obj.receiveShadow = false;
                obj.frustumCulled = false;
              }
            });
          }

          // нормализация
          normalizeModel(rootGroup, scene);

          // твой кэш моделей
          modelCache.set(modelId, rootGroup);

          if (onProgress) onProgress(100);
          if (onStatus) onStatus("Готово");

          resolve({ root: rootGroup, meta });
        },

        (xhr) => {
          if (xhr.lengthComputable && onProgress) {
            onProgress((xhr.loaded / xhr.total) * 100);
          }
        },

        (err) => {
          console.error("Ошибка loader:", err);
          if (onStatus) onStatus("Ошибка загрузки");
          reject(err);
        }
      );
    } catch (err) {
      console.error("cachedFetch error:", err);
      if (onStatus) onStatus("Ошибка загрузки");
      reject(err);
    }
  });
}
