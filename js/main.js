import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

import { Vehicle } from './vehicle.js';
import { World } from './world.js';
import { InputManager } from './input.js';
import { WeatherSystem } from './weather.js';
import { createMotionBlurPass } from './motionBlurShader.js';

/* =============================================
   SCENE (Moonlit Urban Night Atmosphere)
   ============================================= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c1628);
scene.fog = new THREE.FogExp2(0x0c1628, 0.0022);

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
    antialias: false,
    powerPreference: 'high-performance',
    precision: 'mediump',
    stencil: false,
    depth: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

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

/* =============================================
   LIGHTING (Atmospheric Silver Moonlight & Ambient Sky)
   ============================================= */
scene.add(new THREE.AmbientLight(0x556d90, 1.45)); // Soft ambient moonlight fill
scene.add(new THREE.HemisphereLight(0x7095c5, 0x222a38, 1.35)); // Sky/Ground moonlight balance

const moon = new THREE.DirectionalLight(0xd5e5ff, 1.05); // Balanced directional moonlight (no harsh glare)
moon.position.set(15, 65, -160);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -80;
moon.shadow.camera.right = 80;
moon.shadow.camera.top = 80;
moon.shadow.camera.bottom = -80;
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
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.15, 'rgba(210, 235, 255, 0.8)');
    grad.addColorStop(0.4, 'rgba(110, 170, 255, 0.3)');
    grad.addColorStop(0.7, 'rgba(50, 90, 200, 0.08)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = 'rgba(190, 220, 255, 0.2)';
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
    grad.addColorStop(0.2, 'rgba(70, 130, 255, 0.1)');
    grad.addColorStop(0.45, 'rgba(170, 215, 255, 0.65)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.55, 'rgba(170, 215, 255, 0.65)');
    grad.addColorStop(0.8, 'rgba(70, 130, 255, 0.1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 56, 1024, 16);

    const gradY = ctx.createLinearGradient(512, 0, 512, 128);
    gradY.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradY.addColorStop(0.4, 'rgba(90, 150, 255, 0.5)');
    gradY.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');
    gradY.addColorStop(0.6, 'rgba(90, 150, 255, 0.5)');
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
    grad.addColorStop(0, 'rgba(130, 175, 255, 0.3)');
    grad.addColorStop(0.7, 'rgba(80, 120, 230, 0.15)');
    grad.addColorStop(1, 'rgba(30, 70, 170, 0.03)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 220, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();

    return new THREE.CanvasTexture(canvas);
}

const flareMainTex = createFlareCenterTexture();
const flareStreakTex = createAnamorphicStreakTexture();
const flareGhostTex = createHexagonGhostTexture();

const moonLensflare = new Lensflare();
moonLensflare.addElement(new LensflareElement(flareMainTex, 320, 0, new THREE.Color(0xdce8ff)));
moonLensflare.addElement(new LensflareElement(flareStreakTex, 950, 0, new THREE.Color(0x70b5ff)));
moonLensflare.addElement(new LensflareElement(flareGhostTex, 80, 0.25, new THREE.Color(0x6095ff)));
moonLensflare.addElement(new LensflareElement(flareGhostTex, 120, 0.45, new THREE.Color(0x4075e0)));
moonLensflare.addElement(new LensflareElement(flareGhostTex, 65, 0.75, new THREE.Color(0x80a5ff)));

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
moonMesh.position.set(15, 65, -160);
scene.add(moonMesh);

const haloCanvas = document.createElement('canvas');
haloCanvas.width = 256; haloCanvas.height = 256;
const hCtx = haloCanvas.getContext('2d');
const hGrad = hCtx.createRadialGradient(128, 128, 10, 128, 128, 120);
hGrad.addColorStop(0, 'rgba(210, 230, 255, 0.9)');
hGrad.addColorStop(0.3, 'rgba(160, 200, 255, 0.5)');
hGrad.addColorStop(0.7, 'rgba(110, 160, 245, 0.18)');
hGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
hCtx.fillStyle = hGrad;
hCtx.fillRect(0, 0, 256, 256);

const haloMat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(haloCanvas),
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.9,
});
const moonHalo = new THREE.Sprite(haloMat);
moonHalo.scale.set(130, 130, 1);
moonMesh.add(moonHalo);

/* =============================================
   SKY DOME (Bright Silver Moonlight Night Sky Shader)
   ============================================= */
const skyGeo = new THREE.SphereGeometry(400, 32, 32);
const skyMat = new THREE.ShaderMaterial({
    uniforms: {
        topColor: { value: new THREE.Color(0x0a1426) },
        bottomColor: { value: new THREE.Color(0x1e304a) }, // Silver-blue horizon glow
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
   GAME OBJECTS & WEATHER SHADER
   ============================================= */
const input = new InputManager();
const vehicle = new Vehicle(scene);
const world = new World(scene);
world.init();

// Driveclub Glass Refraction Rain & Wet Surface System
const weather = new WeatherSystem(scene, vehicle, world, composer);

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

function updateCamera(dt) {
    const sr = Math.min(Math.abs(vehicle.speed) / vehicle.maxSpeed, 1);

    // Smoothly decay mouse orbit offset when mouse is released
    if (!isMouseDown) {
        mouseOrbitYaw *= Math.pow(0.01, dt);
        mouseOrbitPitch *= Math.pow(0.01, dt);
    }

    // Tight camera framing: fixed 5.8m distance, 2.2m height (no speed pull-back)
    const dist = 5.8 + zoomOffset;
    const height = 2.2 + mouseOrbitPitch * 3;
    const a = vehicle.heading + mouseOrbitYaw;

    // Ideal camera position tightly behind car
    camIdeal.set(
        vehicle.mesh.position.x + Math.sin(a) * dist,
        vehicle.mesh.position.y + Math.max(1.0, height),
        vehicle.mesh.position.z + Math.cos(a) * dist,
    );

    // Fast lerp rate (rate = 25) so camera tracks tightly at full speed without lagging behind
    const s = 1 - Math.exp(-25 * dt);
    camera.position.lerp(camIdeal, s);

    // Look at target point ahead of car
    camTarget.set(
        vehicle.mesh.position.x - Math.sin(vehicle.heading) * 3,
        vehicle.mesh.position.y + 0.9,
        vehicle.mesh.position.z - Math.cos(vehicle.heading) * 3,
    );
    camLookAt.lerp(camTarget, s);
    camera.lookAt(camLookAt);

    // Fixed FOV (60 deg) to prevent wide-angle camera push-back effect
    camera.fov = 60;
    camera.updateProjectionMatrix();

    // Bloom ramps with speed (balanced for subtle glow)
    bloomPass.strength = 0.45 + sr * 0.4;

    // Dynamic High-Speed Radial Motion Blur
    const nitroBlur = vehicle.isNitro ? 0.05 : 0.0;
    const targetBlur = Math.pow(sr, 1.4) * 0.075 + nitroBlur;
    motionBlurPass.uniforms.uStrength.value = THREE.MathUtils.lerp(
        motionBlurPass.uniforms.uStrength.value,
        targetBlur,
        dt * 10.0
    );

    // Move sky dome & moonlight with player
    sky.position.copy(camera.position);
    moonMesh.position.set(vehicle.mesh.position.x + 15, 65, vehicle.mesh.position.z - 160);
    moon.position.copy(moonMesh.position);
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

const elBadgeHeadlights = document.getElementById('badge-headlights');
const elBadgeSigLeft = document.getElementById('badge-signal-left');
const elBadgeHazards = document.getElementById('badge-hazards');
const elBadgeSigRight = document.getElementById('badge-signal-right');
const elBadgeUnderglow = document.getElementById('badge-underglow');

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

    // Vignette overlay intensity
    const sr = Math.min(Math.abs(vehicle.speed) / vehicle.maxSpeed, 1);
    elOverlay.style.opacity = sr * 0.8;

    // Nitro class
    elOverlay.classList.toggle('nitro-active', vehicle.isNitro);

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
    if (elBadgeUnderglow) {
        elBadgeUnderglow.classList.toggle('active-neon', input.underglow !== false);
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
    elLoading.classList.add('fade-out');
    elHud.style.display = 'block';
    window.focus();
    setTimeout(() => { elHint.style.opacity = '0'; }, 8000);
    setTimeout(() => { elLoading.style.display = 'none'; }, 1200);
}

elStartBtn.addEventListener('click', startGame);

let loadPct = 0;
const loadTimer = setInterval(() => {
    loadPct += 8 + Math.random() * 15;
    if (loadPct >= 100) {
        loadPct = 100;
        elLoaderFill.style.width = '100%';
        clearInterval(loadTimer);

        if (elLoaderStatus) elLoaderStatus.textContent = 'READY';
        if (elLoaderBox) elLoaderBox.style.display = 'none';
        if (elStartBtn) elStartBtn.style.display = 'inline-block';

        // Auto start after 1.5s if not clicked
        setTimeout(() => {
            if (elLoading.style.display !== 'none' && !elLoading.classList.contains('fade-out')) {
                startGame();
            }
        }, 1500);
    } else {
        elLoaderFill.style.width = `${loadPct}%`;
    }
}, 100);

/* =============================================
   RTX 3050 TURBO MODE & HIGH-PRECISION FPS COUNTER
   ============================================= */
let isTurboMode = true;
let lastFrameTime = performance.now();
let frameCount = 0;
let fpsTimer = 0;

const elFpsVal = document.getElementById('fps-val');
const elFrameTimeVal = document.getElementById('frametime-val');
const elTurboBtn = document.getElementById('turbo-toggle-btn');

if (elTurboBtn) {
    elTurboBtn.addEventListener('click', () => {
        isTurboMode = !isTurboMode;
        if (isTurboMode) {
            elTurboBtn.className = 'turbo-btn active';
            elTurboBtn.textContent = '⚡ RTX 3050 TURBO MODE: ON';
            renderer.setPixelRatio(1.0);
            renderer.shadowMap.enabled = false;
            if (world.lightPool) world.lightPool.forEach(l => l.visible = false);
        } else {
            elTurboBtn.className = 'turbo-btn';
            elTurboBtn.textContent = '✨ CINEMATIC MODE';
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.autoUpdate = true;
            if (world.lightPool) world.lightPool.forEach(l => l.visible = true);
        }
    });
}

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
        const avgFrameTime = (fpsTimer / frameCount).toFixed(2);
        if (elFpsVal) elFpsVal.textContent = currentFps;
        if (elFrameTimeVal) elFrameTimeVal.textContent = avgFrameTime;
        frameCount = 0;
        fpsTimer = 0;
    }

    const dt = Math.min(clock.getDelta(), 0.05);

    vehicle.update(dt, input);
    world.update(vehicle.mesh.position);
    weather.update(dt);
    updateCamera(dt);
    updateHUD();

    if (isTurboMode) {
        renderer.render(scene, camera);
    } else {
        composer.render();
    }
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
