// generate-manifest.js
// Работает со сложными models.js, удаляет ВСЕ import/export
// Выполняет код в песочнице и извлекает MODELS

import fs from "fs";
import vm from "vm";

// === 1. Читаем models.js как текст ===
let text = fs.readFileSync("./js/models.js", "utf8");

// === 2. Удаляем все import ... from ... ===
text = text.replace(/import[\s\S]*?from\s+['"][^'"]+['"];/g, "");

// === 3. Удаляем ВСЕ export (export const, export function, export class) ===
text = text.replace(/export\s+(const|let|var|function|class)\s+/g, "$1 ");

// === 4. На всякий случай: удаляем "export { ... }" конструкции
text = text.replace(/export\s*\{[\s\S]*?\};?/g, "");

// === 5. Подменяем "const MODELS" чтобы сохранить в sandbox
text = text.replace(/const\s+MODELS\s*=/, "sandbox.MODELS =");

// === 6. Создаём песочницу
const sandbox = { MODELS: null };
vm.createContext(sandbox);

// === 7. Выполняем очищенный код
try {
  vm.runInContext(text, sandbox);
} catch (err) {
  console.error("❌ Ошибка выполнения models.js в песочнице:", err);
  process.exit(1);
}

// === 8. Проверяем наличие MODELS
const MODELS = sandbox.MODELS;

if (!MODELS) {
  console.error("❌ MODELS не найден после выполнения models.js");
  process.exit(1);
}

// === 9. Формируем список файлов для кэша
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

// === 10. Записываем manifest.json ===
fs.writeFileSync("./manifest.json", JSON.stringify(manifest, null, 2));

console.log("✔ manifest.json успешно создан:", manifest.total, "файлов");
