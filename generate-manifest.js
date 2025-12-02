// generate-manifest.js
// Извлекает MODELS из models.js БЕЗ импорта three.js
// Работает в GitHub Actions

import fs from "fs";

// Читаем models.js как простой текст
const text = fs.readFileSync("./js/models.js", "utf8");

// Ищем массив MODELS (формат export const MODELS = [ ... ])
const match = text.match(/export\s+const\s+MODELS\s*=\s*(\[[\s\S]*?\]);/);

if (!match) {
  console.error("❌ MODELS не найден в models.js");
  process.exit(1);
}

// Это JS-массив, нужно превратить его в JSON
let arrayText = match[1]
  .replace(/(\w+)\s*:/g, '"$1":') // ключи → строки
  .replace(/'([^']+)'/g, '"$1"'); // одинарные → двойные кавычки

let MODELS = JSON.parse(arrayText);

// Генерируем список файлов
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

fs.writeFileSync("manifest.json", JSON.stringify(manifest, null, 2), "utf8");

console.log("✔ manifest.json создан:", manifest.total, "файлов");
