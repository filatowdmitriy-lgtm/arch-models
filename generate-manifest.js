// generate-manifest.js
// Читает models.js, убирает импорты, выполняет код в песочнице
// и получает MODELS без ошибок синтаксиса

import fs from "fs";
import vm from "vm";

// === 1. Читаем models.js как текст ===
let text = fs.readFileSync("./js/models.js", "utf8");

// === 2. Убираем импорты (three.js и всё остальное) ===
text = text.replace(/import[\s\S]*?from\s+['"][^'"]+['"];/g, "");

// === 3. Запускаем JS-код в песочнице ===
const sandbox = {};
vm.createContext(sandbox);

try {
  vm.runInContext(text, sandbox);
} catch (err) {
  console.error("❌ Ошибка выполнения MODELS в песочнице:", err);
  process.exit(1);
}

// Теперь sandbox.MODELS содержит настоящий JS-объект
const MODELS = sandbox.MODELS;

if (!MODELS) {
  console.error("❌ MODELS не найден в models.js");
  process.exit(1);
}

// === 4. Формируем список файлов ===
const files = [];

for (const m of MODELS) {
  files.push(m.url);
  files.push(m.url.replace(".gltf", ".bin"));

  if (m.textures) {
    for (const key of ["base", "normal", "rough"]) {
      if (m.textures[key]) files.push(m.textures[key]);
    }
  }

  if (m.schemes) files.push(...m.schemes);
  if (m.video) files.push(m.video);
}

const unique = [...new Set(files)];

const manifest = {
  generated: new Date().toISOString(),
  total: unique.length,
  files: unique
};

// === 5. Записываем manifest.json ===
fs.writeFileSync("manifest.json", JSON.stringify(manifest, null, 2));

console.log("✔ manifest.json успешно создан:", manifest.total, "файлов");
