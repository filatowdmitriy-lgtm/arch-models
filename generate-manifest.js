// generate-manifest.js
// Полностью стабильная версия: без замены MODELS, без конфликтов имён.

import fs from "fs";
import vm from "vm";

// 1. Читаем models.js
let text = fs.readFileSync("./js/models.js", "utf8");

// 2. Удаляем import ... from ...
text = text.replace(/import[\s\S]*?from\s+['"][^'"]+['"];/g, "");

// 3. Удаляем ВСЕ export
text = text.replace(/export\s+(const|let|var|function|class)\s+/g, "$1 ");
text = text.replace(/export\s*\{[\s\S]*?\};?/g, "");

// 4. Создаём песочницу
const sandbox = { console };
vm.createContext(sandbox);

// 5. Выполняем models.js
try {
  vm.runInContext(text, sandbox);
} catch (err) {
  console.error("❌ Ошибка выполнения models.js:", err);
  process.exit(1);
}

// 6. Достаём MODELS из песочницы
const MODELS = sandbox.MODELS;

if (!MODELS) {
  console.error("❌ MODELS не найден. Проверь models.js");
  process.exit(1);
}

// 7. Формируем список файлов
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

// 8. Записываем manifest.json
fs.writeFileSync("./manifest.json", JSON.stringify(manifest, null, 2));

console.log("✔ manifest.json успешно создан:", manifest.total, "файлов");
