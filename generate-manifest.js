// generate-manifest.js
// Запускается в GitHub Actions
// Генерирует manifest.json на основе MODELS.js

import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Абсолютный путь к проекту
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем MODELS.js как модуль
const modelsModule = await import(__dirname + "/js/models.js");
const MODELS = modelsModule.MODELS;

const files = [];

for (const model of MODELS) {
  // GLTF
  files.push(model.url);

  // BIN
  files.push(model.url.replace(".gltf", ".bin"));

  // Textures
  if (model.textures) {
    for (const key of ["base", "normal", "rough"]) {
      if (model.textures[key]) files.push(model.textures[key]);
    }
  }

  // Schemes
  if (model.schemes) {
    files.push(...model.schemes);
  }

  // Video
  if (model.video) {
    files.push(model.video);
  }
}

// Убираем дубликаты
const unique = [...new Set(files)];

const output = {
  generated: new Date().toISOString(),
  total: unique.length,
  files: unique
};

// Сохраняем manifest.json в корень
fs.writeFileSync(
  __dirname + "/manifest.json",
  JSON.stringify(output, null, 2),
  "utf8"
);

console.log("✔ manifest.json сгенерирован:", unique.length, "файлов");
