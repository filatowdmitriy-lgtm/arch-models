// js/models.js
// Модуль, отвечающий за:
// - список MODELS (метаданные всех архитектурных деталей);
// - загрузку GLTF-моделей;
// - применение PBR-текстур (если заданы);
// - нормализацию модели по размеру (центрирование + масштаб).
//
// ВАЖНО:
// - Здесь НЕТ UI (loading, статус и т.п.).
// - Здесь НЕТ камеры, жестов, трёхмерной сцены.
// - Модуль просто возвращает готовый THREE.Group для рендера.
//
// Как использовать:
//   import { MODELS, loadModel, getModelMeta } from "./models.js";
//
//   const meta = getModelMeta("doric");
//   const { root } = await loadModel("doric", {
//     onProgress: (percent) => { ... },
//     onStatus: (text) => { ... }
//   });
//   threeViewer.setModel(root); // threeViewer уже сам подгонит камеру.
//

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* ===============================
   СПИСОК МОДЕЛЕЙ (метаданные)
   =============================== */

export const MODELS = [
  {
    id: "doric",
    name: "Дорическая капитель",
    desc: "Архаический строгий стиль.",
    url: "https://filatowdmitriy-lgtm.github.io/arch-models/models/doric.gltf",
    thumbLetter: "D",

    // Схемы, которые будут показываться во вкладке "Построение"
    schemes: [
      "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/scheme1.jpg"
    ],

    // Видео для вкладки "Видео"
    video: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/test_video.mp4",

    // PBR-текстуры для применения поверх GLTF (необязательный блок)
    textures: {
      base: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/BaseColor.jpg",
      normal: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/Normal.jpg",
      rough: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/Roughness.jpg",
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
    video: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/test_video.mp4",

    textures: {
      base: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/BaseColor.jpg",
      normal: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/Normal.jpg",
      rough: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/Roughness.jpg",
      metalness: 0.0,
      roughness: 1.0,
      envIntensity: 0.75
    }
  }
];

/* ===============================
   КЭШ ЗАГРУЖЕННЫХ МОДЕЛЕЙ
   =============================== */

const cache = {}; // { [modelId]: THREE.Group }

/* ===============================
   УТИЛИТЫ ВНУТРИ МОДУЛЯ
   =============================== */

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

/**
 * Найти метаданные модели по id.
 * Возвращает объект из MODELS или null.
 */
export function getModelMeta(modelId) {
  return MODELS.find(m => m.id === modelId) || null;
}

/**
 * Создать MeshStandardMaterial из набора текстур и параметров,
 * если textures-поле задано в MODELS.
 */
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

  // Настройки точно такие же, как были в 8.html
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

  const mat = new THREE.MeshStandardMaterial({
    map: texBase || null,
    normalMap: texNormal || null,
    roughnessMap: texRough || null,
    metalness,
    roughness,
    envMapIntensity: envIntensity
  });

  return mat;
}

/**
 * Центрирование и нормализация модели:
 * - центрируем по bounding box (чтобы pivot был в центре);
 * - масштабируем так, чтобы модель не была слишком маленькой/огромной.
 *
 * ВАЖНО:
 * - Здесь мы НЕ трогаем камеру и расстояние до модели;
 *   это будет делать threeViewer (с тем же алгоритмом, что и в 8.html).
 */
function normalizeModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // Сдвигаем сцену так, чтобы центр оказался в (0, 0, 0)
  root.traverse(obj => {
    if (obj.isObject3D) {
      obj.position.sub(center);
    }
  });

  const maxSize = Math.max(size.x, size.y, size.z);
  if (maxSize > 0) {
    const base = 2.0; // как в исходном коде
    const scale = base / maxSize;
    root.scale.setScalar(scale);
  }
}

/* ===============================
   ОСНОВНАЯ ФУНКЦИЯ ЗАГРУЗКИ МОДЕЛИ
   =============================== */

/**
 * Загрузить модель по её id.
 *
 * @param {string} modelId - id из MODELS
 * @param {object} options
 * @param {function(number|null):void} [options.onProgress] - колбэк прогресса (0–100 или null)
 * @param {function(string):void} [options.onStatus]       - колбэк текста статуса
 *
 * @returns {Promise<{ root: THREE.Group, meta: object }>}
 *          root — готовая THREE.Group, которую можно добавить в сцену.
 *          meta — объект MODELS для этой модели.
 */
export function loadModel(modelId, options = {}) {
  const { onProgress, onStatus } = options;
  const meta = getModelMeta(modelId);

  if (!meta) {
    return Promise.reject(new Error("Не найдена модель с id=" + modelId));
  }

  if (onStatus) {
    onStatus("Загрузка: " + meta.name);
  }

  // Если модель закэширована — просто клонируем и отдаём
  if (cache[meta.id]) {
    const clone = cache[meta.id].clone(true);
    if (onStatus) {
      onStatus("Модель из кэша: " + meta.name);
    }
    // здесь прогресс уже не важен, модель готова
    if (onProgress) {
      onProgress(100);
    }
    return Promise.resolve({ root: clone, meta });
  }

  return new Promise((resolve, reject) => {
    gltfLoader.load(
      meta.url,
      (gltf) => {
        // Оборачиваем сцену в отдельный Group, как в исходном коде
        const root = new THREE.Group();
        root.add(gltf.scene);

        // Если для модели заданы PBR-текстуры — применяем материал
        const material = createMaterialFromTextures(meta.textures);
        if (material) {
          root.traverse((obj) => {
            if (obj.isMesh) {
              obj.material = material;
              obj.castShadow = false;
              obj.receiveShadow = false;
            }
          });
        }

        // Нормализуем размер и центр
        normalizeModel(root);

        // Кэшируем уже нормализованный вариант (чтобы дальше только клонировать)
        cache[meta.id] = root.clone(true);

        if (onStatus) {
          onStatus("Модель загружена: " + meta.name);
        }
        if (onProgress) {
          onProgress(100);
        }

        resolve({ root, meta });
      },
      (xhr) => {
        if (!onProgress) return;

        if (xhr.lengthComputable) {
          const percent = (xhr.loaded / xhr.total) * 100;
          onProgress(percent);
        } else {
          // длина не известна — просто даём null
          onProgress(null);
        }
      },
      (err) => {
        console.error("Ошибка загрузки модели:", err);
        if (onStatus) {
          onStatus("Ошибка загрузки модели");
        }
        reject(err);
      }
    );
  });
}
