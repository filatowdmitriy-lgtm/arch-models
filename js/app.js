// app.js — главный модуль приложения

import { MODELS } from "./models.js";

document.getElementById("app").textContent =
  "Приложение запущено. Количество моделей: " + MODELS.length;
