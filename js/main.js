import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

import { Vehicle } from './vehicle.js';
import { World, getRoadZoneInfo } from './world.js';
import { InputManager } from './input.js';
import { WeatherSystem } from './weather.js';
import { CloudSystem } from './clouds.js';
import { SpeedTrailSystem } from './speedTrail.js';
import { createMotionBlurPass } from './motionBlurShader.js';
import { createFilmGrainPass } from './filmGrainShader.js';
import { createCinematicGradePass } from './cinematicGradeShader.js';
import { Minimap } from './minimap.js';

/* =============================================
   SCENE (Moody Night Fog & Atmosphere)
   ============================================= */
const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x0a101d);
scene.background = fogColor;
scene.fog = new THREE.FogExp2(0x0a101d, 0.0055); // Rich volumetric atmospheric night fog

/* =============================================
   CAMERA (Clean Chase View)
   ============================================= */
const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 800,
);
camera.position.set(0, 4, 10);

/* =============================================
   RENDERER
   ============================================= */
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    precision: 'mediump',
    stencil: false,
    depth: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Ultra-smooth soft shadows
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18; // Balanced HDR exposure curve
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

/* =============================================
   HDR ENVIRONMENT MAP LOADING (Night HDRI)
   ============================================= */
function createHDRNightEnvironment(renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    
    const skyGeo = new THREE.SphereGeometry(100, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0a1426) },
            horizonColor: { value: new THREE.Color(0x2a3e5c) },
            sodiumGlow: { value: new THREE.Color(0xff8822) },
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 horizonColor;
            uniform vec3 sodiumGlow;
            varying vec3 vWorldPosition;
            void main() {
                vec3 norm = normalize(vWorldPosition);
                float h = norm.y;
                vec3 col = mix(horizonColor, topColor, max(h, 0.0));
                float sodiumBand = smoothstep(0.3, -0.1, abs(h - 0.05));
                col += sodiumGlow * sodiumBand * 0.45;
                gl_FragColor = vec4(col, 1.0);
            }
        `,
        side: THREE.BackSide,
    });
    envScene.add(new THREE.Mesh(skyGeo, skyMat));

    const envMoon = new THREE.DirectionalLight(0xdce8ff, 4.0);
    envMoon.position.set(15, 65, -160);
    envScene.add(envMoon);

    const envLight1 = new THREE.PointLight(0xff7711, 8.0, 50);
    envLight1.position.set(-15, 8, 20);
    envScene.add(envLight1);

    const envLight2 = new THREE.PointLight(0xff7711, 8.0, 50);
    envLight2.position.set(15, 8, -20);
    envScene.add(envLight2);

    const envRt = pmremGenerator.fromScene(envScene);
    pmremGenerator.dispose();
    return envRt.texture;
}

let nightHdrTexture = null;
let dayHdrTexture = null;

// Load Night Sky HDRI environment map using EXRLoader
const exrLoader = new EXRLoader();
exrLoader.load('assets/hdr/night time/NightSkyHDRI003_4K_HDR.exr', (hdrTexture) => {
    hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
    nightHdrTexture = hdrTexture;
    if (weather && weather.weatherType !== 2) {
        scene.environment = nightHdrTexture;
    }
    console.log('Night EXR HDRI loaded successfully');
}, undefined, (err) => {
    console.warn('EXRLoader failed, using procedural night environment fallback:', err);
    nightHdrTexture = createHDRNightEnvironment(renderer);
    if (weather && weather.weatherType !== 2) {
        scene.environment = nightHdrTexture;
    }
});

// Load NaturalStudio Daytime HDRI environment map using RGBELoader
const rgbeLoader = new RGBELoader();
rgbeLoader.load('assets/hdr/MR_INT-001_NaturalStudio_NAD.hdr', (hdrTexture) => {
    hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
    dayHdrTexture = hdrTexture;
    if (weather && weather.weatherType === 2) {
        scene.environment = dayHdrTexture;
    }
    console.log('Daylight RGBE HDRI loaded successfully');
}, undefined, (err) => {
    console.warn('RGBELoader failed for daytime HDRI:', err);
});

/* =============================================
   POST-PROCESSING (Bloom & Speed Motion Blur)
   ============================================= */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.12, // strength (Subtle halos for rainy night atmosphere)
    0.30, // radius
    0.93, // threshold (Prevents overblown bloom halos)
);
composer.addPass(bloomPass);

const cinematicGradePass = createCinematicGradePass();
composer.addPass(cinematicGradePass);

const motionBlurPass = createMotionBlurPass();
composer.addPass(motionBlurPass);

const filmGrainPass = createFilmGrainPass();
composer.addPass(filmGrainPass);

/* =============================================
   LIGHTING (Moody Lowered Moonlight & Warm Sodium Ambient Sky)
   ============================================= */
const ambientMoon = new THREE.AmbientLight(0x445577, 0.45); scene.add(ambientMoon); // Soft lowered ambient moonlight fill
const ambientSodium = new THREE.AmbientLight(0xff9933, 0.35); scene.add(ambientSodium); // Warm sodium city light ambient fill
const hemiLight = new THREE.HemisphereLight(0x4c607a, 0x18202d, 0.50); scene.add(hemiLight); // Sky/Ground moonlight balance

const moon = new THREE.DirectionalLight(0xb8d0f5, 0.38); // Lowered directional moonlight
moon.position.set(15, 30, -180);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024); // Fast, optimized crisp shadow map
moon.shadow.bias = -0.0001; // Prevent shadow acne
moon.shadow.normalBias = 0.03; // Smooth surface shadow contact
moon.shadow.camera.left = -70;
moon.shadow.camera.right = 70;
moon.shadow.camera.top = 70;
moon.shadow.camera.bottom = -70;
moon.shadow.camera.near = 10;
moon.shadow.camera.far = 400;
scene.add(moon);
scene.add(moon.target);

/* =============================================
   CAMERA OVERHEAD LIGHT (100m Non-Specular Diffuse + Soft Fill)
   Illuminates the car and 100m environment without specular glare spots on car paint
   ============================================= */
const cameraDiffuseLight = new THREE.HemisphereLight(0xddeeff, 0x445566, 1.2);
scene.add(cameraDiffuseLight);

const cameraLight = new THREE.PointLight(0xddeeff, 0.6, 80, 1.8);
scene.add(cameraLight);

/* =============================================
   PHOTOREALISTIC ANAMORPHIC LENS FLARE SYSTEM
   ============================================= */
function createFlareCenterTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 250);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(0.15, 'rgba(210, 235, 255, 0.08)');
    grad.addColorStop(0.4, 'rgba(110, 170, 255, 0.02)');
    grad.addColorStop(0.7, 'rgba(50, 90, 200, 0.005)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = 'rgba(190, 220, 255, 0.06)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(256, 256);
        ctx.lineTo(256 + Math.cos(angle) * 240, 256 + Math.sin(angle) * 240);
        ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
}

function createAnamorphicStreakTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 64, 1024, 64);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.2, 'rgba(70, 130, 255, 0.03)');
    grad.addColorStop(0.45, 'rgba(170, 215, 255, 0.20)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.32)');
    grad.addColorStop(0.55, 'rgba(170, 215, 255, 0.20)');
    grad.addColorStop(0.8, 'rgba(70, 130, 255, 0.03)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 56, 1024, 16);

    const gradY = ctx.createLinearGradient(512, 0, 512, 128);
    gradY.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradY.addColorStop(0.4, 'rgba(90, 150, 255, 0.22)');
    gradY.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
    gradY.addColorStop(0.6, 'rgba(90, 150, 255, 0.22)');
    gradY.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = gradY;
    ctx.fillRect(0, 0, 1024, 128);

    return new THREE.CanvasTexture(canvas);
}

function createHexagonGhostTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = 128 + Math.cos(a) * 90;
        const y = 128 + Math.sin(a) * 90;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 100);
    grad.addColorStop(0, 'rgba(130, 175, 255, 0.10)');
    grad.addColorStop(0.7, 'rgba(80, 120, 230, 0.05)');
    grad.addColorStop(1, 'rgba(30, 70, 170, 0.01)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 220, 255, 0.15)';
    ctx.lineWidth = 3;
    ctx.stroke();

    return new THREE.CanvasTexture(canvas);
}

const flareMainTex = createFlareCenterTexture();
const flareStreakTex = createAnamorphicStreakTexture();
const flareGhostTex = createHexagonGhostTexture();

const moonLensflare = new Lensflare();
moonLensflare.addElement(new LensflareElement(flareMainTex, 12, 0, new THREE.Color(0x7799cc)));

moon.add(moonLensflare);

/* =============================================
   3D MOON MESH & GLOWING HALO SPRITE
   ============================================= */
function createMoonTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(256, 256, 10, 256, 256, 250);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.6, '#e0ebff');
    grad.addColorStop(0.85, '#b0cdff');
    grad.addColorStop(1, '#6680b0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = 'rgba(70, 90, 120, 0.25)';
    const maria = [
        { x: 180, y: 190, r: 90 }, { x: 300, y: 170, r: 75 },
        { x: 330, y: 280, r: 85 }, { x: 210, y: 310, r: 100 },
        { x: 140, y: 260, r: 60 }, { x: 360, y: 220, r: 50 }
    ];
    maria.forEach(m => {
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (let i = 0; i < 40; i++) {
        const cx = Math.random() * 512;
        const cy = Math.random() * 512;
        const cr = 2 + Math.random() * 12;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
    }

    return new THREE.CanvasTexture(canvas);
}

const moonGeo = new THREE.SphereGeometry(22, 32, 32);
const moonTex = createMoonTexture();
const moonMat = new THREE.MeshBasicMaterial({
    map: moonTex,
    color: 0xffffff,
});
const moonMesh = new THREE.Mesh(moonGeo, moonMat);
moonMesh.position.set(15, 30, -180);
scene.add(moonMesh);

const haloCanvas = document.createElement('canvas');
haloCanvas.width = 256; haloCanvas.height = 256;
const hCtx = haloCanvas.getContext('2d');
const hGrad = hCtx.createRadialGradient(128, 128, 10, 128, 128, 120);
hGrad.addColorStop(0, 'rgba(180, 205, 240, 0.7)');
hGrad.addColorStop(0.3, 'rgba(130, 170, 230, 0.35)');
hGrad.addColorStop(0.7, 'rgba(80, 120, 190, 0.12)');
hGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
hCtx.fillStyle = hGrad;
hCtx.fillRect(0, 0, 256, 256);

const haloMat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(haloCanvas),
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.6,
});
const moonHalo = new THREE.Sprite(haloMat);
moonHalo.scale.set(110, 110, 1);
moonMesh.add(moonHalo);

/* =============================================
   SKY DOME (Moody Foggy Night Sky Shader)
   ============================================= */
const skyGeo = new THREE.SphereGeometry(400, 32, 32);
const skyMat = new THREE.ShaderMaterial({
    uniforms: {
        topColor: { value: new THREE.Color(0x060a14) },
        bottomColor: { value: new THREE.Color(0x121a28) },
        offset: { value: 15 },
        exponent: { value: 0.45 },
    },
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
            float h = normalize(vWorldPosition + offset).y;
            gl_FragColor = vec4(
                mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)),
                1.0
            );
        }
    `,
    side: THREE.BackSide,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

/* =============================================
   GAME OBJECTS, VOLUMETRIC CLOUDS & WEATHER SHADER
   ============================================= */
const input = new InputManager();
const vehicle = new Vehicle(scene);
const world = new World(scene);
world.init();

// Volumetric Drifting Clouds System
const cloudSystem = new CloudSystem(scene);

// Driveclub Glass Refraction Rain & Wet Surface System
const weather = new WeatherSystem(scene, vehicle, world, composer);

// High-Fidelity Glowing Motion Trail & Speed Ribbon System
const speedTrailSystem = new SpeedTrailSystem(scene, vehicle.mesh);

// Need for Speed / Driveclub Circular Minimap Radar HUD
const minimap = new Minimap();

// Weather Preset Switcher UI & Environment Sync
function applyWeatherEnvironment(type) {
    weather.setWeather(type);
    if (cloudSystem && cloudSystem.setWeather) cloudSystem.setWeather(type);

    if (world.streetLampPoolMat && world.streetLampGlowMat) {
        world.streetLampPoolMat.opacity = (type === 2) ? 0.0 : 0.82;
        world.streetLampGlowMat.emissiveIntensity = (type === 2) ? 0.0 : 5.2;
    }

    if (type === 0) { // STORM (Overcast Night Storm)
        if (nightHdrTexture) scene.environment = nightHdrTexture;
        scene.background = new THREE.Color(0x080e18);
        if (scene.fog) { scene.fog.color.setHex(0x080e18); scene.fog.density = 0.0068; }

        skyMat.uniforms.topColor.value.setHex(0x040810);
        skyMat.uniforms.bottomColor.value.setHex(0x0c1626);

        ambientMoon.color.setHex(0x334466); ambientMoon.intensity = 0.25;
        ambientSodium.color.setHex(0xff8822); ambientSodium.intensity = 0.20;
        hemiLight.color.setHex(0x3a4b60); hemiLight.groundColor.setHex(0x101620); hemiLight.intensity = 0.35;

        moon.color.setHex(0xa0b8dc); moon.intensity = 0.20;
        cameraDiffuseLight.intensity = 0.7;
        cameraLight.intensity = 0.4;

        renderer.toneMappingExposure = 0.88;

    } else if (type === 1) { // DRIZZLE (Moody Night Drizzle)
        if (nightHdrTexture) scene.environment = nightHdrTexture;
        scene.background = new THREE.Color(0x0a101d);
        if (scene.fog) { scene.fog.color.setHex(0x0a101d); scene.fog.density = 0.0055; }

        skyMat.uniforms.topColor.value.setHex(0x060a14);
        skyMat.uniforms.bottomColor.value.setHex(0x121a28);

        ambientMoon.color.setHex(0x445577); ambientMoon.intensity = 0.40;
        ambientSodium.color.setHex(0xff9933); ambientSodium.intensity = 0.30;
        hemiLight.color.setHex(0x4c607a); hemiLight.groundColor.setHex(0x18202d); hemiLight.intensity = 0.45;

        moon.color.setHex(0xb8d0f5); moon.intensity = 0.38;
        cameraDiffuseLight.intensity = 0.8;
        cameraLight.intensity = 0.5;

        renderer.toneMappingExposure = 0.92;

    } else if (type === 2) { // CLOUDY DAY (Daytime Storm / Overcast Daytime Rain)
        if (dayHdrTexture) scene.environment = dayHdrTexture;
        scene.background = new THREE.Color(0x8093a4);
        if (scene.fog) { scene.fog.color.setHex(0x8093a4); scene.fog.density = 0.0050; }

        skyMat.uniforms.topColor.value.setHex(0x445566);
        skyMat.uniforms.bottomColor.value.setHex(0xa0b2c4);

        ambientMoon.color.setHex(0x9cb0c4); ambientMoon.intensity = 1.05;
        ambientSodium.color.setHex(0x5c6670); ambientSodium.intensity = 0.35;
        hemiLight.color.setHex(0xbad0e4); hemiLight.groundColor.setHex(0x454e56); hemiLight.intensity = 1.25;

        moon.color.setHex(0xf0f4f8); moon.intensity = 1.75;
        cameraDiffuseLight.intensity = 1.0;
        cameraLight.intensity = 0.6;

        renderer.toneMappingExposure = 0.95;

    } else { // CLEAR (Night Sky with Moon)
        if (nightHdrTexture) scene.environment = nightHdrTexture;
        scene.background = new THREE.Color(0x04060c);
        if (scene.fog) { scene.fog.color.setHex(0x04060c); scene.fog.density = 0.0030; }

        skyMat.uniforms.topColor.value.setHex(0x020408);
        skyMat.uniforms.bottomColor.value.setHex(0x0b1220);

        ambientMoon.color.setHex(0x445577); ambientMoon.intensity = 0.50;
        ambientSodium.color.setHex(0xff9933); ambientSodium.intensity = 0.35;
        hemiLight.color.setHex(0x4c607a); hemiLight.groundColor.setHex(0x18202d); hemiLight.intensity = 0.55;

        moon.color.setHex(0xcce0ff); moon.intensity = 0.45;
        cameraDiffuseLight.intensity = 0.8;
        cameraLight.intensity = 0.5;

        renderer.toneMappingExposure = 0.90;
    }
}

document.querySelectorAll('.weather-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const type = parseInt(e.target.dataset.type, 10);
        applyWeatherEnvironment(type);
    });
});

/* =============================================
   MOUSE CAMERA ORBIT CONTROLS
   ============================================= */
let isMouseDown = false;
let mouseX = 0, mouseY = 0;
let mouseOrbitYaw = 0;   // horizontal orbit angle offset
let mouseOrbitPitch = 0; // vertical orbit angle offset
let zoomOffset = 0;

window.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
        isMouseDown = true;
        mouseX = e.clientX;
        mouseY = e.clientY;
    }
});

window.addEventListener('mouseup', () => {
    isMouseDown = false;
});

window.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    const dx = e.clientX - mouseX;
    const dy = e.clientY - mouseY;
    mouseX = e.clientX;
    mouseY = e.clientY;

    mouseOrbitYaw -= dx * 0.005;
    mouseOrbitPitch += dy * 0.003;
    mouseOrbitPitch = Math.max(-0.4, Math.min(0.7, mouseOrbitPitch));
});

window.addEventListener('wheel', (e) => {
    zoomOffset += e.deltaY * 0.008;
    zoomOffset = Math.max(-3.0, Math.min(8, zoomOffset));
});

/* =============================================
   CAMERA CONTROLLER (Clean Chase Positioning)
   ============================================= */
const camTarget = new THREE.Vector3();
const camIdeal = new THREE.Vector3();
const camLookAt = new THREE.Vector3();
const _shakeRight = new THREE.Vector3();
const _shakeUp = new THREE.Vector3();
const _shakeFwd = new THREE.Vector3();
let cameraShakeTime = 0;
let chaseCameraHeading = 0;

function updateCamera(dt) {
    const sr = Math.min(Math.abs(vehicle.speed) / vehicle.maxSpeed, 1);
    const mode = input.cameraMode !== undefined ? input.cameraMode : 0;
    const isNitro = !!vehicle.isNitro;

    if (mode === 1) { // 1st Person Cockpit / Windscreen View
        const headX = vehicle.mesh.position.x - Math.sin(vehicle.heading) * (-0.15) + Math.cos(vehicle.heading) * 0.35;
        const headY = vehicle.mesh.position.y + 1.18;
        const headZ = vehicle.mesh.position.z - Math.cos(vehicle.heading) * (-0.15) - Math.sin(vehicle.heading) * 0.35;

        camera.position.set(headX, headY, headZ);

        camTarget.set(
            vehicle.mesh.position.x - Math.sin(vehicle.heading) * 20.0,
            vehicle.mesh.position.y + 1.05,
            vehicle.mesh.position.z - Math.cos(vehicle.heading) * 20.0
        );
        camera.lookAt(camTarget);

        // Ensure rain pass is active for camera lens / windscreen drops in 1st person cockpit
        if (weather.rainPass) weather.rainPass.enabled = (weather.weatherType !== 3);

    } else if (mode === 2) { // 1st Person Hood / Bumper View
        const bumpX = vehicle.mesh.position.x - Math.sin(vehicle.heading) * 2.2;
        const bumpY = vehicle.mesh.position.y + 0.65;
        const bumpZ = vehicle.mesh.position.z - Math.cos(vehicle.heading) * 2.2;

        camera.position.set(bumpX, bumpY, bumpZ);

        camTarget.set(
            vehicle.mesh.position.x - Math.sin(vehicle.heading) * 20.0,
            vehicle.mesh.position.y + 0.65,
            vehicle.mesh.position.z - Math.cos(vehicle.heading) * 20.0
        );
        camera.lookAt(camTarget);

        if (weather.rainPass) weather.rainPass.enabled = (weather.weatherType !== 3);

    } else { // 3rd Person Chase View (Clean Framing)
        if (!isMouseDown) {
            mouseOrbitYaw *= Math.pow(0.01, dt);
            mouseOrbitPitch *= Math.pow(0.01, dt);
        }

        const dist = 7.0 + zoomOffset;
        const height = 2.2 + mouseOrbitPitch * 3.0;
        const headingLag = 1 - Math.exp(-6.0 * dt);
        chaseCameraHeading = THREE.MathUtils.lerp(chaseCameraHeading, vehicle.heading, headingLag);
        const a = chaseCameraHeading + mouseOrbitYaw;

        // Pull camera slightly closer at high speed to compensate for FOV and velocity
        const speedCamDist = Math.max(4.5, dist - sr * 0.8);
        const speedCamHeight = Math.max(1.1, height - sr * 0.2);

        camIdeal.set(
            vehicle.mesh.position.x + Math.sin(a) * speedCamDist,
            vehicle.mesh.position.y + speedCamHeight,
            vehicle.mesh.position.z + Math.cos(a) * speedCamDist,
        );

        // Dynamic lerp rate increases with speed so camera stays locked right behind the car
        const lerpSpeed = 12.0 + sr * 24.0;
        const s = 1 - Math.exp(-lerpSpeed * dt);
        camera.position.lerp(camIdeal, s);

        camTarget.set(
            vehicle.mesh.position.x - Math.sin(vehicle.heading) * 1.6,
            vehicle.mesh.position.y + 0.95,
            vehicle.mesh.position.z - Math.cos(vehicle.heading) * 1.6,
        );
        camLookAt.lerp(camTarget, s);
        camera.lookAt(camLookAt);

        // Keep the tuned camera-lens rain visible in 3rd-person chase view.
        if (weather.rainPass) weather.rainPass.enabled = (weather.weatherType !== 3);
    }

    /* ---------------------------------------------
       CAMERA SHAKE & CHASSIS RUMBLE (Triggers when Car Moves or Wind is Strong)
       --------------------------------------------- */
    const isMoving = sr > 0.03; // Car is moving (> 5 km/h)
    const isStrongWind = (weather.weatherType === 0); // Heavy Storm wind buffeting

    if (isMoving || isStrongWind || isNitro) {
        cameraShakeTime += dt * (10.0 + sr * 16.0);

        let shakeIntensity = 0.0;
        if (isMoving) {
            shakeIntensity = Math.pow(sr, 1.2);
        }
        if (isNitro) {
            shakeIntensity = Math.min(1.0, shakeIntensity + 0.25);
        }
        if (isStrongWind) {
            shakeIntensity = Math.max(0.18, shakeIntensity + 0.12); // Strong wind turbulence
        }

        let posAmp = mode === 1 ? 0.012 : (mode === 2 ? 0.015 : 0.020);
        let rotAmp = mode === 1 ? 0.0012 : (mode === 2 ? 0.0010 : 0.0008);

        const maxPosOffset = shakeIntensity * posAmp;
        const maxRotOffset = shakeIntensity * rotAmp;

        const noiseX = (Math.sin(cameraShakeTime * 1.1) * 0.7 + Math.sin(cameraShakeTime * 2.3) * 0.3) * maxPosOffset;
        const noiseY = (Math.cos(cameraShakeTime * 1.3) * 0.7 + Math.cos(cameraShakeTime * 2.7) * 0.3) * maxPosOffset;
        const noiseZ = (Math.sin(cameraShakeTime * 1.6) * 0.5) * maxPosOffset * 0.5;

        _shakeRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
        _shakeUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
        _shakeFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);

        camera.position.addScaledVector(_shakeRight, noiseX);
        camera.position.addScaledVector(_shakeUp, noiseY);
        camera.position.addScaledVector(_shakeFwd, noiseZ);

        const rollWobble = Math.sin(cameraShakeTime * 0.8) * maxRotOffset;
        const pitchJitter = Math.cos(cameraShakeTime * 1.0) * maxRotOffset;

        camera.rotation.z += rollWobble;
        camera.rotation.x += pitchJitter;
    }

    // Tight Speed FOV Control (60 deg -> 63 deg max for locked car framing)
    const nitroFov = vehicle.isNitro ? 2.0 : 0.0;
    const targetFov = 60.0 + (sr * 3.0) + nitroFov;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 8.0);
    camera.updateProjectionMatrix();

    // Bloom ramps subtly with speed for delicate rainy night atmosphere
    bloomPass.strength = 0.10 + sr * 0.04;

    // Dynamic High-Speed Radial Motion Blur
    const nitroBlur = vehicle.isNitro ? 0.08 : 0.0;
    const targetBlur = Math.pow(sr, 1.3) * 0.12 + nitroBlur;
    motionBlurPass.uniforms.uStrength.value = THREE.MathUtils.lerp(
        motionBlurPass.uniforms.uStrength.value,
        targetBlur,
        dt * 10.0
    );

    // Dynamic 35mm Analog Film Grain
    filmGrainPass.uniforms.uTime.value += dt;
    filmGrainPass.uniforms.uSpeedBoost.value = sr;

    // Move sky dome & overhead camera lights (100m diffuse coverage, zero specular glare on car)
    sky.position.copy(camera.position);
    cameraDiffuseLight.position.set(camera.position.x, camera.position.y + 15, camera.position.z);
    cameraLight.position.set(camera.position.x, camera.position.y + 28, camera.position.z);

    const isCloudyDay = (weather.weatherType === 2);
    const isOvercastStorm = (weather.weatherType === 0);

    if (isCloudyDay) {
        moonMesh.visible = false;
        moonLensflare.visible = false;
        moon.position.set(vehicle.mesh.position.x + 30, vehicle.mesh.position.y + 150, vehicle.mesh.position.z - 40);
    } else {
        moonMesh.position.set(vehicle.mesh.position.x + 15, 65, vehicle.mesh.position.z - 160);
        moon.position.copy(moonMesh.position);
        moonMesh.visible = !isOvercastStorm;
        moonLensflare.visible = !isOvercastStorm;
    }

    moon.target.position.copy(vehicle.mesh.position);
    moon.target.updateMatrixWorld();
}

/* =============================================
   DRIVECLUB HUD UPDATER
   ============================================= */
const elSpeed = document.getElementById('speed-value');
const elRpmArc = document.getElementById('gauge-rpm-arc');
const elGear = document.getElementById('gear-display');
const elOverlay = document.getElementById('speed-overlay');
const elHint = document.getElementById('controls-hint');
const elPrecision = document.getElementById('precision-badge');

const elBadgeCamera = document.getElementById('badge-camera');
const elBadgeHeadlights = document.getElementById('badge-headlights');
const elBadgeSigLeft = document.getElementById('badge-signal-left');
const elBadgeHazards = document.getElementById('badge-hazards');
const elBadgeSigRight = document.getElementById('badge-signal-right');

const elRoadIcon = document.getElementById('road-icon');
const elRoadName = document.getElementById('road-name');
const elRoadWidthVal = document.getElementById('road-width-val');
const elRoadAlertBanner = document.getElementById('road-alert-banner');
const elRoadAlertText = document.getElementById('road-alert-text');

let lastRoadZoneName = '';
let alertHideTimeout = null;

const elBadgeDissect = document.getElementById('badge-dissect');
if (elBadgeDissect) {
    elBadgeDissect.onclick = () => { input.dissect = !input.dissect; };
}

const elBadgeRainmode = document.getElementById('badge-rainmode');
if (elBadgeRainmode) {
    elBadgeRainmode.onclick = () => {
        const modeName = weather.setRainMode();
        elBadgeRainmode.textContent = `🌧️ ${modeName}`;
    };
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && !e.repeat) {
        const modeName = weather.setRainMode();
        if (elBadgeRainmode) {
            elBadgeRainmode.textContent = `🌧️ ${modeName}`;
        }
    }
});

function updateHUD() {
    const kmh = vehicle.getSpeedKmh();
    elSpeed.textContent = kmh;

    // Dial Gauge RPM Arc fill (0 - 310 dashoffset) using vehicle 6-gear RPM system
    const rpm = vehicle.getRpm();
    if (elRpmArc) {
        const strokeOffset = 310 - (rpm * 310);
        elRpmArc.style.strokeDashoffset = strokeOffset;
    }

    const gear = vehicle.getGear();
    elGear.textContent = gear;

    // Road Zone & Highway Width Telemetry
    const zoneInfo = getRoadZoneInfo(vehicle.mesh.position.z);
    if (elRoadIcon) elRoadIcon.textContent = zoneInfo.icon;
    if (elRoadName) elRoadName.textContent = zoneInfo.name;
    if (elRoadWidthVal) elRoadWidthVal.textContent = `${zoneInfo.width.toFixed(1)}m`;

    // Real-Time Minimap Radar Update
    minimap.update(vehicle);

    // Vignette overlay intensity
    const sr = Math.min(Math.abs(vehicle.speed) / vehicle.maxSpeed, 1);
    elOverlay.style.opacity = sr * 0.8;

    // Nitro class
    elOverlay.classList.toggle('nitro-active', vehicle.isNitro);

    // Camera View Status Badge
    if (elBadgeCamera) {
        const mode = input.cameraMode !== undefined ? input.cameraMode : 0;
        if (mode === 1) elBadgeCamera.textContent = '🎥 1ST COCKPIT';
        else if (mode === 2) elBadgeCamera.textContent = '🎥 1ST BUMPER';
        else elBadgeCamera.textContent = '🎥 3RD CHASE';
    }

    // Rain FX Mode Status Badge
    if (elBadgeRainmode) {
        elBadgeRainmode.textContent = `🌧️ ${weather.getRainModeName()}`;
    }

    // Vehicle Dissection Badge
    if (elBadgeDissect) {
        elBadgeDissect.classList.toggle('active-amber', !!input.dissect);
        elBadgeDissect.textContent = input.dissect ? '🔧 DISSECT: ON' : '🔧 DISSECT: OFF';
    }

    // Precision mode badge (25% on Right Ctrl, 50% on Right Shift)
    if (elPrecision) {
        if (input.precision25) {
            elPrecision.textContent = '25% SENS (PRECISION)';
            elPrecision.style.display = 'block';
        } else if (input.precision) {
            elPrecision.textContent = '50% SENS (PRECISION)';
            elPrecision.style.display = 'block';
        } else {
            elPrecision.style.display = 'none';
        }
    }

    // Vehicle Light Status Indicators
    if (elBadgeHeadlights) {
        const mode = input.headlightMode !== undefined ? input.headlightMode : 1;
        elBadgeHeadlights.className = 'light-badge';
        if (mode === 1) {
            elBadgeHeadlights.textContent = '💡 LOW';
            elBadgeHeadlights.classList.add('active-low');
        } else if (mode === 2) {
            elBadgeHeadlights.textContent = '💡 HIGH';
            elBadgeHeadlights.classList.add('active-high');
        } else {
            elBadgeHeadlights.textContent = '💡 OFF';
        }
    }

    if (elBadgeSigLeft) {
        elBadgeSigLeft.classList.toggle('active-amber', input.signalLeft || (input.hazards && vehicle.blinkerState));
    }
    if (elBadgeHazards) {
        elBadgeHazards.classList.toggle('active-amber', input.hazards);
    }
    if (elBadgeSigRight) {
        elBadgeSigRight.classList.toggle('active-amber', input.signalRight || (input.hazards && vehicle.blinkerState));
    }
}

/* =============================================
   LOADING SCREEN & START BUTTON
   ============================================= */
const elLoaderFill = document.getElementById('loader-fill');
const elLoaderBox = document.getElementById('loader-bar-box');
const elLoaderStatus = document.getElementById('loader-status');
const elStartBtn = document.getElementById('start-btn');
const elLoading = document.getElementById('loading-screen');
const elHud = document.getElementById('hud');

function startGame() {
    if (elLoading.classList.contains('fade-out')) return;
    elLoading.classList.add('fade-out');
    elHud.style.display = 'block';
    window.focus();
    setTimeout(() => { if (elHint) elHint.style.opacity = '0'; }, 8000);
    setTimeout(() => { elLoading.style.display = 'none'; }, 1200);
}

if (elStartBtn) elStartBtn.addEventListener('click', startGame);
if (elLoading) elLoading.addEventListener('click', startGame);
window.addEventListener('keydown', () => {
    if (elLoading && elLoading.style.display !== 'none' && !elLoading.classList.contains('fade-out')) {
        startGame();
    }
});

let loadPct = 0;
const loadTimer = setInterval(() => {
    loadPct += 15 + Math.random() * 20;
    if (loadPct >= 100) {
        loadPct = 100;
        elLoaderFill.style.width = '100%';
        clearInterval(loadTimer);

        if (elLoaderStatus) elLoaderStatus.textContent = 'READY';
        if (elLoaderBox) elLoaderBox.style.display = 'none';
        if (elStartBtn) elStartBtn.style.display = 'inline-block';

        // Auto start after 500ms if not clicked
        setTimeout(() => {
            if (elLoading.style.display !== 'none' && !elLoading.classList.contains('fade-out')) {
                startGame();
            }
        }, 500);
    } else {
        elLoaderFill.style.width = `${loadPct}%`;
    }
}, 60);

/* =============================================
   FPS COUNTER
   ============================================= */
let lastFrameTime = performance.now();
let frameCount = 0;
let fpsTimer = 0;

const elFpsVal = document.getElementById('fps-val');
const elFrameTimeVal = document.getElementById('frametime-val');

/* =============================================
   GAME LOOP
   ============================================= */
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const frameDtMs = now - lastFrameTime;
    lastFrameTime = now;

    frameCount++;
    fpsTimer += frameDtMs;

    if (fpsTimer >= 150) { // Refresh FPS HUD 6x per second
        const currentFps = Math.round((frameCount * 1000) / fpsTimer);
        const avgFrameTime = currentFps >= 58 ? 16 : Math.round(1000 / Math.max(1, currentFps));
        if (elFpsVal) elFpsVal.textContent = currentFps;
        if (elFrameTimeVal) elFrameTimeVal.textContent = avgFrameTime;
        frameCount = 0;
        fpsTimer = 0;
    }

    const dt = Math.min(clock.getDelta(), 0.05);

    vehicle.camera = camera;
    vehicle.update(dt, input, weather);
    world.update(vehicle.mesh.position);
    cloudSystem.update(dt, vehicle.mesh.position);
    weather.update(dt, input.cameraMode, camera);

    const isDrifting = vehicle.isDrifting || input.handbrake || (input.brake && Math.abs(input.steering) > 0.3);
    speedTrailSystem.update(dt, vehicle.getSpeedKmh(), isDrifting, input.brake);

    updateCamera(dt);
    updateHUD();

    composer.render();
}
animate();

/* =============================================
   RESIZE
   ============================================= */
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
