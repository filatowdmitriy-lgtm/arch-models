// js/models.js
//
// Рабочая простая версия, где ВСЁ работало, модель не разваливалась,
// не ломались трансформы, не нарушались pivots.
//

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

export function getModelMeta(id) {
  return MODELS.find((m) => m.id === id) || null;
}

function createMaterialFromTextures(textures) {
  if (!textures) return null;

  const { base, normal, rough, metalness = 0.0, roughness = 1.0, envIntensity = 0.7 } = textures;

  const texBase   = base   ? textureLoader.load(base)   : null;
  const texNormal = normal ? textureLoader.load(normal) : null;
  const texRough  = rough  ? textureLoader.load(rough)  : null;

  if (texBase)   { texBase.flipY = false; texBase.colorSpace = THREE.SRGBColorSpace; }
  if (texNormal) { texNormal.flipY = false; texNormal.colorSpace = THREE.LinearSRGBColorSpace; }
  if (texRough)  { texRough.flipY = false; texRough.colorSpace = THREE.LinearSRGBColorSpace; }

  return new THREE.MeshStandardMaterial({
    map: texBase || null,
    normalMap: texNormal || null,
    roughnessMap: texRough || null,
    metalness,
    roughness,
    envMapIntensity: envIntensity
  });
}

export function loadModel(modelId, { onProgress, onStatus } = {}) {
  const meta = getModelMeta(modelId);
  if (!meta) return Promise.reject("No model: " + modelId);

  if (onStatus) onStatus("Загрузка: " + meta.name);

  return new Promise((resolve, reject) => {
    gltfLoader.load(
      meta.url,
      (gltf) => {
        const root = gltf.scene;

        const mat = createMaterialFromTextures(meta.textures);

        if (mat) {
          root.traverse((o) => {
            if (o.isMesh) {
              o.material = mat;
              o.castShadow = false;
              o.receiveShadow = false;
              o.frustumCulled = false;
            }
          });
        }

        if (onProgress) onProgress(100);
        if (onStatus) onStatus("Модель загружена: " + meta.name);

        resolve({ root, meta });
      },
      (xhr) => {
        if (xhr.lengthComputable && onProgress) {
          onProgress((xhr.loaded / xhr.total) * 100);
        }
      },
      (err) => {
        console.error(err);
        if (onStatus) onStatus("Ошибка загрузки");
        reject(err);
      }
    );
  });
}
