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

// Load Night Sky HDRI environment map using EXRLoader
const exrLoader = new EXRLoader();
exrLoader.load('assets/hdr/night time/NightSkyHDRI003_4K_HDR.exr', (hdrTexture) => {
    hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdrTexture;
    console.log('Night EXR HDRI loaded successfully');
}, undefined, (err) => {
    console.warn('EXRLoader failed, using procedural night environment fallback:', err);
    scene.environment = createHDRNightEnvironment(renderer);
});

/* =============================================
   POST-PROCESSING (Bloom & Speed Motion Blur)
   ============================================= */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.45, // strength
    0.40, // radius
    0.85, // threshold
);
composer.addPass(bloomPass);

const motionBlurPass = createMotionBlurPass();
composer.addPass(motionBlurPass);

const filmGrainPass = createFilmGrainPass();
composer.addPass(filmGrainPass);

/* =============================================
   LIGHTING (Moody Lowered Moonlight & Warm Sodium Ambient Sky)
   ============================================= */
scene.add(new THREE.AmbientLight(0x445577, 0.45)); // Soft lowered ambient moonlight fill
scene.add(new THREE.AmbientLight(0xff9933, 0.35)); // Warm sodium city light ambient fill
scene.add(new THREE.HemisphereLight(0x4c607a, 0x18202d, 0.50)); // Sky/Ground moonlight balance

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
   PHOTOREALISTIC ANAMORPHIC LENS FLARE SYSTEM
   ============================================= */
function createFlareCenterTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 250);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    grad.addColorStop(0.15, 'rgba(210, 235, 255, 0.32)');
    grad.addColorStop(0.4, 'rgba(110, 170, 255, 0.12)');
    grad.addColorStop(0.7, 'rgba(50, 90, 200, 0.03)');
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
moonLensflare.addElement(new LensflareElement(flareMainTex, 38, 0, new THREE.Color(0xdce8ff)));

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

// Weather Preset Switcher UI
document.querySelectorAll('.weather-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const type = parseInt(e.target.dataset.type, 10);
        weather.setWeather(type);
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

        const dist = 7.1 + zoomOffset;
        const height = 2.35 + mouseOrbitPitch * 3.0;
        const headingLag = 1 - Math.exp(-4.2 * dt);
        chaseCameraHeading = THREE.MathUtils.lerp(chaseCameraHeading, vehicle.heading, headingLag);
        const a = chaseCameraHeading + mouseOrbitYaw;

        // Tightened chase camera distance scaling at high speed (prevents car getting too far away)
        const speedCamDist = dist + sr * 0.5;
        const speedCamHeight = Math.max(1.05, height - sr * 0.05);

        camIdeal.set(
            vehicle.mesh.position.x + Math.sin(a) * speedCamDist,
            vehicle.mesh.position.y + speedCamHeight,
            vehicle.mesh.position.z + Math.cos(a) * speedCamDist,
        );

        // Let the car move inside the frame so steering reads as vehicle motion, not world rotation.
        const s = 1 - Math.exp(-8.0 * dt);
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
       HIGH-SPEED CAMERA SHAKE & CHASSIS RUMBLE (Subtle & Smooth Tuning)
       --------------------------------------------- */
    const speedThreshold = 0.45; // Only triggers at high speed (> 135 km/h)
    if (sr > speedThreshold || isNitro) {
        cameraShakeTime += dt * (12.0 + sr * 18.0); // Smoother, lower frequency wave time

        // Smooth quadratic ramp-up at high speeds
        let shakeIntensity = Math.pow(Math.max(0, (sr - speedThreshold) / (1.0 - speedThreshold)), 2.0);
        if (isNitro) {
            shakeIntensity = Math.min(1.0, shakeIntensity + 0.15); // Subtle boost during Nitro
        }

        // Tighter, subtle amplitudes (reduced by ~70% for smooth AAA driving feel)
        let posAmp = 0.015;
        let rotAmp = 0.0008;
        if (mode === 1) { // Cockpit: subtle head vibration
            posAmp = 0.010;
            rotAmp = 0.0010;
        } else if (mode === 2) { // Bumper: low-amplitude road chatter
            posAmp = 0.012;
            rotAmp = 0.0008;
        } else { // Chase: subtle wind buffeting
            posAmp = 0.016;
            rotAmp = 0.0006;
        }

        const maxPosOffset = shakeIntensity * posAmp;
        const maxRotOffset = shakeIntensity * rotAmp;

        // Smooth harmonic wave noise (minimal high-frequency noise jitter)
        const noiseX = (Math.sin(cameraShakeTime * 1.1) * 0.7 + Math.sin(cameraShakeTime * 2.3) * 0.3 + (Math.random() - 0.5) * 0.15) * maxPosOffset;
        const noiseY = (Math.cos(cameraShakeTime * 1.3) * 0.7 + Math.cos(cameraShakeTime * 2.7) * 0.3 + (Math.random() - 0.5) * 0.15) * maxPosOffset;
        const noiseZ = (Math.sin(cameraShakeTime * 1.6) * 0.5 + (Math.random() - 0.5) * 0.1) * maxPosOffset * 0.5;

        // Camera local orientation vectors
        const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const fwdVec = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

        camera.position.addScaledVector(rightVec, noiseX);
        camera.position.addScaledVector(upVec, noiseY);
        camera.position.addScaledVector(fwdVec, noiseZ);

        // Ultra-subtle roll & pitch micro wobble
        const rollWobble = (Math.sin(cameraShakeTime * 0.8) * 0.8 + (Math.random() - 0.5) * 0.2) * maxRotOffset;
        const pitchJitter = (Math.cos(cameraShakeTime * 1.0) * 0.8 + (Math.random() - 0.5) * 0.2) * maxRotOffset;

        camera.rotation.z += rollWobble;
        camera.rotation.x += pitchJitter;
    }

    // Dynamic Speed FOV Expansion (60 deg at rest -> 67 deg max at top speed + Nitro for tight car framing)
    const nitroFov = vehicle.isNitro ? 3.0 : 0.0;
    const targetFov = 60.0 + (sr * 7.0) + nitroFov;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 8.0);
    camera.updateProjectionMatrix();

    // Bloom ramps with speed (balanced for subtle glow)
    bloomPass.strength = 0.45 + sr * 0.4;

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

    // Move sky dome & moonlight with player
    sky.position.copy(camera.position);
    moonMesh.position.set(vehicle.mesh.position.x + 15, 65, vehicle.mesh.position.z - 160);
    moon.position.copy(moonMesh.position);
    moon.target.position.copy(vehicle.mesh.position);
    moon.target.updateMatrixWorld();

    // Weather-dependent celestial visibility
    const isOvercastStorm = (weather.weatherType === 0);
    moonMesh.visible = !isOvercastStorm;
    moonLensflare.visible = !isOvercastStorm;
    moon.intensity = isOvercastStorm ? 0.20 : 0.40;
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
