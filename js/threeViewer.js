/* =============================================================================
   THREE VIEWER — МОДУЛЬ РЕНДЕРИНГА 3D-МОДЕЛЕЙ
   Часть 1 — базовая структура, сцена, камера, рендерер, освещение.
   ========================================================================== */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* ==========================
   Экспортируемые функции
   ========================== */

export function initViewer(canvas, onStatus) {
    Viewer.init(canvas, onStatus);
}

export function loadModel3D(modelMeta) {
    return Viewer.loadModel(modelMeta);
}

export function resetCamera3D() {
    Viewer.resetCamera();
}

export function renderFrame3D() {
    Viewer.renderFrame();
}

/* ==========================
   Внутренний объект Viewer
   ========================== */

const Viewer = {
    /* -------------------------
       ПЕРЕМЕННЫЕ СОСТОЯНИЯ
       ------------------------- */
    canvas: null,
    scene: null,
    camera: null,
    renderer: null,

    currentModel: null,
    cache: {},

    /* состояние камеры — 1-в-1 как в 8.html */
    state: {
        radius: 4.5,
        minRadius: 2.0,
        maxRadius: 12.0,
        rotX: 0.10,
        rotY: 0.00,
        targetRotX: 0.10,
        targetRotY: 0.00,
    },

    isMobile: /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent),

    /* callback на вывод статуса */
    onStatus: (msg) => {},


    /* ==========================
       ИНИЦИАЛИЗАЦИЯ VIEWER
       ========================== */
    init(canvas, onStatus) {
        this.canvas = canvas;
        this.onStatus = onStatus || (() => {});

        /* ---- СЦЕНА ---- */
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050506);

        /* ---- КАМЕРА ---- */
        this.camera = new THREE.PerspectiveCamera(
            40,
            window.innerWidth / window.innerHeight,
            0.1,
            50
        );

        /* применяем начальное положение камеры */
        this.updateCameraPos();

        /* ---- РЕНДЕРЕР ---- */
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;

        /* ---- ОСВЕЩЕНИЕ (1-в-1 как в 8.html) ---- */

        // верхний мягкий полутон
        const zenith = new THREE.DirectionalLight(0xf5f8ff, 0.0);
        zenith.position.set(0, 11, 2);
        this.scene.add(zenith);

        // тёплый key
        const key = new THREE.DirectionalLight(0xffc4a0, 1.85);
        key.position.set(5.5, 6.0, 3.5);
        key.castShadow = false;
        this.scene.add(key);

        // холодный fill
        const fill = new THREE.DirectionalLight(0xcad8ff, 0.35);
        fill.position.set(-7, 3.5, 2);
        this.scene.add(fill);

        // rim
        const rim = new THREE.DirectionalLight(0xffffff, 0.5);
        rim.position.set(-3.5, 5, -7.5);
        this.scene.add(rim);

        // холодный узкий rim
        const rimCold = new THREE.DirectionalLight(0xd8e4ff, 0.1);
        rimCold.position.set(2.5, 3.5, -5);
        this.scene.add(rimCold);

        // ambient
        const amb = new THREE.AmbientLight(0xffffff, 0.04);
        this.scene.add(amb);

        // hemisphere
        const hemi = new THREE.HemisphereLight(0xffffff, 0x0a0a0a, 0.07);
        this.scene.add(hemi);

        /* ---- RESIZE ---- */
        window.addEventListener("resize", () => this.handleResize());

        /* ---- УПРАВЛЕНИЕ (мышь/тач) — следующая часть ---- */

        /* ---- АНИМАЦИЯ ---- */
        this.startRenderLoop();
    },


    /* ==========================
       РЕНДЕР-ЛУП
       ========================== */
    startRenderLoop() {
        const loop = () => {
            this.state.rotX += (this.state.targetRotX - this.state.rotX) * 0.22;
            this.state.rotY += (this.state.targetRotY - this.state.rotY) * 0.22;

            this.updateCameraPos();
            this.renderer.render(this.scene, this.camera);

            requestAnimationFrame(loop);
        };
        loop();
    },


    /* ==========================
       ОБНОВЛЕНИЕ КАМЕРЫ
       ========================== */
    updateCameraPos() {
        const s = this.state;
        const r = s.radius;

        const x = r * Math.sin(s.rotY) * Math.cos(s.rotX);
        const z = r * Math.cos(s.rotY) * Math.cos(s.rotX);
        const y = r * Math.sin(s.rotX);

        this.camera.position.set(x, y, z);
        this.camera.lookAt(0, 0, 0);
    },


    /* ==========================
       РЕСАЙЗ
       ========================== */
    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    },


    /* ==========================
       СБРОС КАМЕРЫ
       ========================== */
    resetCamera() {
        this.state.targetRotX = 0.10;
        this.state.targetRotY = 0.00;
    },


    /* ----------------------------------------------------
       Часть задачи — загрузка моделей будет в ЧАСТИ 2
       ---------------------------------------------------- */
};
