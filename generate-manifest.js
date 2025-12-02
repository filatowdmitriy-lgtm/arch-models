// generate-manifest.js
// Извлекает только MODELS = [ ... ] из файла models.js, не выполняя остальной код.

import fs from "fs";

// 1. Читаем models.js как текст
let text = fs.readFileSync("./js/models.js", "utf8");

// 2. Удаляем переносы строк для удобства
let oneLine = text.replace(/\n/g, " ");

// 3. Находим "MODELS = [ ... ]"
const match = oneLine.match(/MODELS\s*=\s*\[(.*?)\];?/s);

if (!match) {
  console.error("❌ Не удалось найти MODELS = [ ... ] в models.js");
  process.exit(1);
}

// 4. Собираем текст массива
const arrayText = "[" + match[1] + "]";

// 5. Превращаем в настоящий объект JS
let MODELS;
try {
  MODELS = eval(arrayText);
} catch (err) {
  console.error("❌ Ошибка парсинга MODELS:", err);
  process.exit(1);
}

// 6. Формируем список файлов
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

// 7. Записываем
fs.writeFileSync("./manifest.json", JSON.stringify(manifest, null, 2));

console.log("✔ manifest.json успешно создан:", manifest.total, "файлов");
