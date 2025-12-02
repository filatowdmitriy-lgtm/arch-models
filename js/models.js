//
// models.js — persistent cache GLTF/BIN + TEXTURES
// pivot/scale/normalize полностью сохранены
//

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// IndexedDB cache
import { cachedFetch } from "./cache/cachedFetch.js";

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

export function getModelMeta(id) {
  return MODELS.find((m) => m.id === id) || null;
}

// ===================
// Кэш моделей в памяти
// ===================
const gltfLoader = new GLTFLoader();
const modelCache = new Map();

// ==============================
// TEXTURE LOADER WITH PERSISTENT CACHE
// ==============================
async function loadTextureCached(url) {
  const blob = await cachedFetch(url);              // persistent cache
  const localURL = URL.createObjectURL(blob);        // blob URL

  return new Promise((resolve) => {
    new THREE.TextureLoader().load(localURL, (tex) => {
      tex.flipY = false;
      resolve(tex);
    });
  });
}

// ================================
// MATERIAL CREATION (UPGRADED)
// ================================
async function createMaterialFromTextures(textures) {
  if (!textures) return null;

  const texBase   = textures.base   ? await loadTextureCached(textures.base)   : null;
  const texNormal = textures.normal ? await loadTextureCached(textures.normal) : null;
  const texRough  = textures.rough  ? await loadTextureCached(textures.rough)  : null;

  if (texBase)   texBase.colorSpace   = THREE.SRGBColorSpace;
  if (texNormal) texNormal.colorSpace = THREE.LinearSRGBColorSpace;
  if (texRough)  texRough.colorSpace  = THREE.LinearSRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    map:          texBase,
    normalMap:    texNormal,
    roughnessMap: texRough,
    metalness:    textures.metalness ?? 0,
    roughness:    textures.roughness ?? 1,
    envMapIntensity: textures.envIntensity ?? 0.7
  });
}

// ================================
// LOAD MODEL (GLTF + BIN CACHE)
// ================================
export function loadModel(modelId, { onProgress, onStatus } = {}) {
  const meta = getModelMeta(modelId);
  if (!meta) return Promise.reject("No model: " + modelId);

  // instant switching cache
  if (modelCache.has(modelId)) {
    onStatus?.("Готово (кэш)");
    onProgress?.(100);
    return Promise.resolve({ root: modelCache.get(modelId), meta });
  }

  onStatus?.("Загрузка: " + meta.name);

  const url = meta.url;
  const binUrl = url.replace(".gltf", ".bin");

  return new Promise(async (resolve, reject) => {
    try {
      // persistent cache for gltf/bin
      const gltfBlob = await cachedFetch(url);
      const binBlob  = await cachedFetch(binUrl);

      const gltfObjectURL = URL.createObjectURL(gltfBlob);
      const binObjectURL  = URL.createObjectURL(binBlob);

      // override bin file
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((u) => {
        if (u.endsWith(".bin")) return binObjectURL;
        return u;
      });

      const loader = new GLTFLoader(manager);

      loader.load(
        gltfObjectURL,

        async (gltf) => {
          const scene = gltf.scene;

          // group for normalization
          const rootGroup = new THREE.Group();
          rootGroup.add(scene);

          // apply PBR material (cached!)
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

          // pivot/scale correct normalization
          normalizeModel(rootGroup, scene);

          modelCache.set(modelId, rootGroup);

          onProgress?.(100);
          onStatus?.("Готово");

          resolve({ root: rootGroup, meta });
        },

        (xhr) => {
          if (xhr.lengthComputable) {
            onProgress?.((xhr.loaded / xhr.total) * 100);
          }
        },

        (err) => {
          console.error(err);
          onStatus?.("Ошибка загрузки");
          reject(err);
        }
      );
    } catch (err) {
      console.error("cachedFetch error:", err);
      onStatus?.("Ошибка загрузки");
      reject(err);
    }
  });
}

// ================================
// NORMALIZATION — untouched
// ================================
function normalizeModel(rootGroup, gltfScene) {
  const box = new THREE.Box3().setFromObject(rootGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  gltfScene.position.sub(center);

  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.0 / maxSize;
  rootGroup.scale.setScalar(scale);
}
