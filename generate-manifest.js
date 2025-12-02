// generate-manifest.js
// Извлекает MODELS = [ ... ] из models.js безопасно, через разбор скобок

import fs from "fs";
import vm from "vm";

// 1. Загружаем models.js
let text = fs.readFileSync("./js/models.js", "utf8");

// 2. Находим позицию "MODELS"
const startKeyword = text.indexOf("MODELS");
if (startKeyword === -1) {
  console.error("❌ MODELS не найден в models.js");
  process.exit(1);
}

// 3. Находим первую "[" после MODELS
let bracketStart = text.indexOf("[", startKeyword);
if (bracketStart === -1) {
  console.error("❌ Не найдена '[' после MODELS");
  process.exit(1);
}

// 4. Ищем соответствующую "]" с учётом вложенности
let depth = 0;
let bracketEnd = -1;

for (let i = bracketStart; i < text.length; i++) {
  const c = text[i];
  if (c === "[") depth++;
  else if (c === "]") {
    depth--;
    if (depth === 0) {
      bracketEnd = i;
      break;
    }
  }
}

if (bracketEnd === -1) {
  console.error("❌ Не найдена закрывающая ']' для MODELS");
  process.exit(1);
}

// 5. Вырезаем текст массива
const arrayText = text.substring(bracketStart, bracketEnd + 1);

// 6. Выполняем в песочнице безопасный JS: let MODELS = [...]
const sandbox = {};
vm.createContext(sandbox);

try {
  vm.runInContext("let MODELS = " + arrayText + "; sandboxResult = MODELS;", sandbox);
} catch (err) {
  console.error("❌ Ошибка выполнения MODELS:", err);
  process.exit(1);
}

const MODELS = sandbox.sandboxResult;

if (!MODELS) {
  console.error("❌ Не удалось получить массив MODELS");
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
