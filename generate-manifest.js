// generate-manifest.js
// Работает с ES-модульным models.js, убирая export/import
// Выполняет только MODELS внутри песочницы Node.js

import fs from "fs";
import vm from "vm";

// === 1. Читаем models.js как текст ===
let text = fs.readFileSync("./js/models.js", "utf8");

// === 2. Удаляем все import ... from "..." ===
text = text.replace(/import[\s\S]*?from\s+['"][^'"]+['"];/g, "");

// === 3. Заменяем "export const MODELS" → "const MODELS"
text = text.replace(/export\s+const\s+MODELS\s*=/, "const MODELS =");

// === 4. Готовим песочницу
const sandbox = { MODELS: null };
vm.createContext(sandbox);

// === 5. Выполняем код
try {
  vm.runInContext(text, sandbox);
} catch (err) {
  console.error("❌ Ошибка выполнения models.js в песочнице:", err);
  process.exit(1);
}

// === 6. Получаем массив MODELS
const MODELS = sandbox.MODELS;

if (!MODELS) {
  console.error("❌ MODELS не найден после выполнения");
  process.exit(1);
}

// === 7. Формируем список файлов ===
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

// === 8. Создаём manifest.json ===
const manifest = {
  generated: new Date().toISOString(),
  total: unique.length,
  files: unique
};

fs.writeFileSync("./manifest.json", JSON.stringify(manifest, null, 2), "utf8");

console.log("✔ Manifest создан:", manifest.total, "файлов");
