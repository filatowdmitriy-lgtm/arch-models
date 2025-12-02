// generate-manifest.js
// Создаёт manifest.json на основе MODELS.js

import { MODELS } from "./js/models.js";
import fs from "fs";

async function buildManifest() {
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
    if (model.schemes) files.push(...model.schemes);

    // Video
    if (model.video) files.push(model.video);
  }

  const unique = [...new Set(files)];

  const output = {
    generated: new Date().toISOString(),
    total: unique.length,
    files: unique
  };

  fs.writeFileSync("manifest.json", JSON.stringify(output, null, 2));

  console.log("✔ manifest.json создан:", unique.length, "файлов");
}

buildManifest();
