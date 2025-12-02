// ===============================================
// models.js — финальная версия с полным кэшированием
// ===============================================

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* ============================================================
   ГЛОБАЛЬНЫЙ DEBUG LOG (мини-консоль на экране)
============================================================ */
function log(msg) {
    if (window.debugLog) window.debugLog.textContent = msg;
}

/* ============================================================
   МОДЕЛИ (оставляем как есть)
============================================================ */
export const MODELS = [
  {
    id: "doric",
    name: "Дорическая капитель",
    url: "https://filatowdmitriy-lgtm.github.io/arch-models/models/doric.gltf",
    textures: {
      base: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/BaseColor.jpg",
      normal: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/Normal.jpg",
      rough: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/doric/Roughness.jpg"
    }
  },
  {
    id: "ionic",
    name: "Ионическая капитель",
    url: "https://filatowdmitriy-lgtm.github.io/arch-models/models/ionic.gltf",
    textures: {
      base: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/BaseColor.jpg",
      normal: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/Normal.jpg",
      rough: "https://filatowdmitriy-lgtm.github.io/arch-models/textures/ionic/Roughness.jpg"
    }
  }
];

/* ============================================================
   УТИЛИТЫ
============================================================ */
export function getModelMeta(id) {
    return MODELS.find(m => m.id === id);
}

/* ============================================================
   PERSISTENT КЭШ FETCH (GLTF/BIN/ТЕКСТУРЫ)
============================================================ */
async function cachedFetch(url) {
    const dbReq = indexedDB.open("arch-models-cache", 1);

    return new Promise((resolve, reject) => {
        dbReq.onupgradeneeded = () => {
            const db = dbReq.result;
            if (!db.objectStoreNames.contains("files"))
                db.createObjectStore("files");
        };

        dbReq.onerror = () => reject(dbReq.error);

        dbReq.onsuccess = () => {
            const db = dbReq.result;
            const tx = db.transaction("files", "readonly");
            const store = tx.objectStore("files");
            const getReq = store.get(url);

            getReq.onsuccess = () => {
                if (getReq.result) {
                    log("HIT " + url);
                    resolve(getReq.result);
                } else {
                    log("LOAD " + url);
                    fetch(url)
                        .then(r => r.blob())
                        .then(blob => {
                            const txw = db.transaction("files", "readwrite");
                            txw.objectStore("files").put(blob, url);
                            resolve(blob);
                        })
                        .catch(reject);
                }
            };
        };
    });
}

/* ============================================================
   ТЕКСТУРЫ ЧЕРЕЗ КЭШ
============================================================ */
async function loadTextureCached(url) {
    log("TEX fetch " + url);

    const blob = await cachedFetch(url);
    const local = URL.createObjectURL(blob);

    return new Promise(resolve => {
        new THREE.TextureLoader().load(local, tex => {
            tex.flipY = false;
            resolve(tex);
        });
    });
}

/* ============================================================
   МАТЕРИАЛ С PBR ТЕКСТУРАМИ
============================================================ */
async function createMaterialFromTextures(tex) {
    if (!tex) return null;

    const base = tex.base ? await loadTextureCached(tex.base) : null;
    const norm = tex.normal ? await loadTextureCached(tex.normal) : null;
    const rough = tex.rough ? await loadTextureCached(tex.rough) : null;

    if (base)   base.colorSpace = THREE.SRGBColorSpace;
    if (norm)   norm.colorSpace = THREE.LinearSRGBColorSpace;
    if (rough)  rough.colorSpace = THREE.LinearSRGBColorSpace;

    return new THREE.MeshStandardMaterial({
        map: base || null,
        normalMap: norm || null,
        roughnessMap: rough || null,
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0.8
    });
}

/* ============================================================
   ЗАГРУЗКА GLTF ЧЕРЕЗ КЭШ (грузим .gltf + .bin автоматически)
============================================================ */
export async function loadModel(id, { onProgress, onStatus } = {}) {
    const meta = getModelMeta(id);
    if (!meta) throw "No model: " + id;

    log("MODEL " + meta.id);

    // 1) грузим gltf как текст
    const gltfBlob = await cachedFetch(meta.url);
    const gltfText = await gltfBlob.text();
    const gltfJson = JSON.parse(gltfText);

    // 2) грузим BIN
    if (gltfJson.buffers && gltfJson.buffers[0]) {
        const binURL = new URL(gltfJson.buffers[0].uri, meta.url).href;
        const binBlob = await cachedFetch(binURL);
        const binLocal = URL.createObjectURL(binBlob);
        gltfJson.buffers[0].uri = binLocal;
    }

    // 3) локальный gltf
    const localGltfURL = URL.createObjectURL(new Blob([JSON.stringify(gltfJson)], { type: "application/json" }));

    // 4) грузим GLTF через loader
    const gltf = await new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(
            localGltfURL,
            resolve,
            xhr => onProgress?.((xhr.loaded / xhr.total) * 100),
            reject
        );
    });

    // 5) применяем материал
    const mat = await createMaterialFromTextures(meta.textures);
    gltf.scene.traverse(o => { if (o.isMesh) o.material = mat; });

    return { root: gltf.scene, meta };
}
