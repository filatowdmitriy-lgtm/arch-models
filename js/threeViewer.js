// js/threeViewer.js
//
// Стабильная рабочая версия до всех фиксов центра.
// Модель отображается корректно, ничего не ломается.
// Единственный минус: pivot смещён, но мы потом исправим.
//

import * as THREE from "three";

let scene = null;
let camera = null;
let renderer = null;

let currentModel = null;
