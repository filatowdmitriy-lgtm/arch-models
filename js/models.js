//
// models.js — версия с IndexedDB-кэшем GLTF и BIN
//
// Поведение полностью совпадает с 8.html:
// - никаких normalize()
// - никаких clone()
// - gltf.scene используется напрямую
// - материалы назначаются так же
// - кэш работает между перезапусками Telegram Mini App
//
// Теперь модели НЕ скачиваются заново при повторном открытии мини-эппа.
//

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ================================
// IndexedDB кэш
// ================================
import { cachedFetch } from "./cache/cachedFetch.js";

/* ========================================
   СПИСОК МОДЕЛЕЙ (как у тебя)
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

/* ========================================
   УТИЛИТЫ
   ======================================== */

export function getModelMeta(id) {
  return MODELS.find((m) => m.id === id) || null;
}

const textureLoader = new THREE.TextureLoader();

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

  const texBase = base ? textureLoader.load(base) : null;
  const texNormal = normal ? textureLoader.load(normal) : null;
  const texRough = rough ? textureLoader.load(rough) : null;

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

/* ============================================================
   GLTF ЗАГРУЗКА ЧЕРЕЗ IndexedDB КЭШ
   ============================================================ */

export function loadModel(modelId, { onProgress, onStatus } = {}) {
  const meta = getModelMeta(modelId);
  if (!meta) return Promise.reject("Модель не найдена: " + modelId);

  const url = meta.url;
  const binUrl = url.replace(".gltf", ".bin");

  return new Promise(async (resolve, reject) => {
    try {
      if (onStatus) onStatus("Загрузка: " + meta.name);

      // -----------------------------------------
      // 1. Получаем GLTF из кэша или сети
      // -----------------------------------------
      const gltfBlob = await cachedFetch(url);
      const gltfText = await gltfBlob.text();

      if (onProgress) onProgress(40);

      // -----------------------------------------
      // 2. Достаём BIN из кэша или сети
      // -----------------------------------------
      const binBlob = await cachedFetch(binUrl);
      const binBuffer = await binBlob.arrayBuffer();

      if (onProgress) onProgress(65);

      // -----------------------------------------
      // 3. Подменяем загрузку bin-файла
      // -----------------------------------------
      const manager = new THREE.LoadingManager();

      manager.setURLModifier((u) => {
        if (u.endsWith(".bin")) {
          return URL.createObjectURL(binBlob);
        }
        return u;
      });

      const loader = new GLTFLoader(manager);

      // -----------------------------------------
      // 4. Парсим GLTF вручную (без URL)
      // -----------------------------------------
      loader.parse(
        gltfText,
        "",
        (gltf) => {
          const root = gltf.scene;

          // поведение 8.html: тени выключены
          root.traverse((obj) => {
            obj.castShadow = false;
            obj.receiveShadow = false;
          });

          // применяем PBR материал (как в твоей версии)
          const mat = createMaterialFromTextures(meta.textures);
          if (mat) {
            root.traverse((obj) => {
              if (obj.isMesh) obj.material = mat;
            });
          }

          if (onProgress) onProgress(100);
          if (onStatus) onStatus("Модель загружена: " + meta.name);

          resolve({ root, meta });
        },
        (err) => {
          console.error("Ошибка парсинга glTF:", err);
          reject(err);
        }
      );
    } catch (err) {
      console.error("Ошибка загрузки GLTF:", err);
      if (onStatus) onStatus("Ошибка загрузки");
      reject(err);
    }
  });
}
