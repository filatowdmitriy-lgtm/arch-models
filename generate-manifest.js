// generate-manifest.js
// Надёжный парсер MODELS.js без импортов и экспортов

import fs from "fs";
import vm from "vm";

// 1. Читаем models.js как текст
let text = fs.readFileSync("./js/models.js", "utf8");

// 2. Убираем все import ... from ...
text = text.replace(/import[\s\S]*?from\s+['"][^'"]+['"];/g, "");

// 3. Убираем все export (export const, export function, export class, export { } )
text = text.replace(/export\s+(const|let|var|function|class)\s+/g, "$1 ");
text = text.replace(/export\s*\{[\s\S]*?\};?/g, "");

// 4. Создаём песочницу
const sandbox = {};
sandbox.MODELS = null;
vm.createContext(sandbox);

// 5. Добавляем в начало текстовую строку "let MODELS;" чтобы код был корректным
const preparedCode = "let MODELS;\n" + text + "\n sandbox.MODELS = MODELS;";

// 6. Выполняем очищенный код
try {
  vm.runInContext(preparedCode, sandbox);
} catch (err) {
  console.error("❌ Ошибка выполнения models.js в песочнице:", err);
  process.exit(1);
}

// 7. Получаем MODELS
const MODELS = sandbox.MODELS;

if (!MODELS) {
  console.error("❌ MODELS не найден после выполнения models.js");
  process.exit(1);
}

// 8. Формируем список файлов
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

// 9. Пишем manifest.json
fs.writeFileSync("./manifest.json", JSON.stringify(manifest, null, 2));

console.log("✔ manifest.json создан успешно:", manifest.total, "файлов");
