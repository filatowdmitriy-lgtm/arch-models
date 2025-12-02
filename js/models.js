// js/models.js
//
// Отвечает за:
// - список моделей MODELS (метаданные, пути к glTF, схемам, видео, текстурам);
// - загрузку моделей из glTF (GLTFLoader);
// - кэширование:
//     • в памяти (modelCache) — мгновенное переключение между моделями;
//     • в IndexedDB (cachedFetch) — GLTF, BIN и PBR-текстуры между заходами;
// - создание PBR-материала из текстур;
// - нормализацию модели по размеру и центру (pivot как в 8.html).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// persistent-кэш (IndexedDB)
import { cachedFetch } from "./cache/cachedFetch.js";

/* ============================================================
   СПИСОК МОДЕЛЕЙ
   ============================================================ */

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
      metalness: 0,
      roughness: 1,
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
      metalness: 0,
      roughness: 1,
      envIntensity: 0.75
    }
  }
];

/** Найти мету модели по id. */
export function getModelMeta(id) {
  return MODELS.find((m) => m.id === id) || null;
}

// Лоадер и кэш в памяти (для мгновенного переключения)
const gltfLoader = new GLTFLoader();
const modelCache = new Map();

/* ============================================================
   ЗАГРУЗКА ТЕКСТУР ЧЕРЕЗ PERSISTENT-КЭШ
   ============================================================ */

/**
 * Загружает текстуру через cachedFetch + создаёт THREE.Texture.
 * Используется для baseColor / normal / roughness.
 */
async function loadTextureCached(url) {
  const blob = await cachedFetch(url);
  const localURL = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    new THREE.TextureLoader().load(localURL, (tex) => {
      tex.flipY = false;
      resolve(tex);
    });
  });
}

/**
 * Создаёт MeshStandardMaterial из текстурной меты.
 * Все текстуры приходят из persistent-кэша.
 */
async function createMaterialFromTextures(textures) {
  if (!textures) return null;

  const texBase   = textures.base   ? await loadTextureCached(textures.base)   : null;
  const texNormal = textures.normal ? await loadTextureCached(textures.normal) : null;
  const texRough  = textures.rough  ? await loadTextureCached(textures.rough)  : null;

  if (texBase)   texBase.colorSpace   = THREE.SRGBColorSpace;
  if (texNormal) texNormal.colorSpace = THREE.LinearSRGBColorSpace;
  if (texRough)  texRough.colorSpace  = THREE.LinearSRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    map:           texBase,
    normalMap:     texNormal,
    roughnessMap:  texRough,
    metalness:     textures.metalness ?? 0,
    roughness:     textures.roughness ?? 1,
    envMapIntensity: textures.envIntensity ?? 0.7
  });
}

/* ============================================================
   ГЛАВНАЯ ФУНКЦИЯ ЗАГРУЗКИ МОДЕЛИ
   ============================================================ */
/**
 * Загружает модель по id:
 * - сначала проверяет кэш в памяти;
 * - затем грузит glTF и BIN через IndexedDB-кэш;
 * - создаёт rootGroup для нормализации;
 * - назначает PBR-материал;
 * - нормализует модель по размеру и центру.
 */
export function loadModel(modelId, { onProgress, onStatus } = {}) {
  const meta = getModelMeta(modelId);
  if (!meta) return Promise.reject("No model: " + modelId);

  // 1) Быстрый кэш в памяти — мгновенное переключение
  if (modelCache.has(modelId)) {
    if (onStatus) onStatus("Готово (кэш)");
    if (onProgress) onProgress(100);
    return Promise.resolve({ root: modelCache.get(modelId), meta });
  }

  if (onStatus) onStatus("Загрузка: " + meta.name);

  const url    = meta.url;
  const binUrl = url.replace(".gltf", ".bin");

  return new Promise(async (resolve, reject) => {
    try {
      // 2) Persistent-кэш для glTF и BIN
      const gltfBlob = await cachedFetch(url);
      const binBlob  = await cachedFetch(binUrl);

      const gltfObjectURL = URL.createObjectURL(gltfBlob);
      const binObjectURL  = URL.createObjectURL(binBlob);

      // Подмена BIN-файла на локальный blob
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((u) => {
        if (u.endsWith(".bin")) return binObjectURL;
        return u;
      });

      const loader = new GLTFLoader(manager);

      // 3) Логика максимально близка к исходной (8.html)
      loader.load(
        gltfObjectURL,

        // onLoad
        async (gltf) => {
          const scene = gltf.scene;

          // Оборачиваем в rootGroup для нормализации и вращения
          const rootGroup = new THREE.Group();
          rootGroup.add(scene);

          // Материал с текстурами из кэша
          const mat = await createMaterialFromTextures(meta.textures);
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

          // Нормализация по центру и масштабу
          normalizeModel(rootGroup, scene);

          // Кладём в кэш в памяти — для мгновенного переключения
          modelCache.set(modelId, rootGroup);

          if (onProgress) onProgress(100);
          if (onStatus) onStatus("Готово");

          resolve({ root: rootGroup, meta });
        },

        // onProgress
        (xhr) => {
          if (xhr.lengthComputable && onProgress) {
            onProgress((xhr.loaded / xhr.total) * 100);
          }
        },

        // onError
        (err) => {
          console.error(err);
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

/* ============================================================
   НОРМАЛИЗАЦИЯ МОДЕЛИ (pivot + scale) — как в 8.html
   ============================================================ */
function normalizeModel(rootGroup, gltfScene) {
  const box = new THREE.Box3().setFromObject(rootGroup);

  const center = box.getCenter(new THREE.Vector3());
  const size   = box.getSize(new THREE.Vector3());

  // Сдвигаем геометрию так, чтобы центр оказался в (0,0,0)
  gltfScene.position.sub(center);

  // Масштабируем так, чтобы максимальный размер был ≈ 2 единицы
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.0 / maxSize;
  rootGroup.scale.setScalar(scale);
}
