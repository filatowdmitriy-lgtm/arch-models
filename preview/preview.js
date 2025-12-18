import { MODELS, loadModel } from "../js/models.js";
import {
  initPreviewThree,
  setPreviewModel,
  renderPNG
} from "./threePreview.js";

const SIZE = 512;

const wrap = document.getElementById("wrap");
const select = document.getElementById("modelSelect");
const downloadBtn = document.getElementById("downloadBtn");

wrap.style.width = SIZE + "px";
wrap.style.height = SIZE + "px";

// --- init three ---
const { scene, camera, renderer } = initPreviewThree(wrap, SIZE);

// --- fill select ---
MODELS.forEach((m) => {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.name;
  select.appendChild(opt);
});

// --- state ---
let lastPNG = null;

// --- handlers ---
select.addEventListener("change", async () => {
  downloadBtn.disabled = true;
  lastPNG = null;

  const modelId = select.value;

  // очистим сцену
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }

  try {
    const { root } = await loadModel(modelId);
    setPreviewModel(scene, camera, root);

    lastPNG = renderPNG(renderer, scene, camera);
    downloadBtn.disabled = false;
  } catch (e) {
    console.error(e);
    alert("Ошибка загрузки модели");
  }
});

downloadBtn.addEventListener("click", () => {
  if (!lastPNG) return;

  const a = document.createElement("a");
  a.href = lastPNG;
  a.download = select.value + ".png";
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// автозагрузка первой модели
if (MODELS.length > 0) {
  select.value = MODELS[0].id;
  select.dispatchEvent(new Event("change"));
}
