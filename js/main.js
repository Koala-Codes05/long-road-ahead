import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { Vehicle } from './vehicle.js';
import { World } from './world.js';
import { InputManager } from './input.js';
import { WeatherSystem } from './weather.js';
import { createMotionBlurPass } from './motionBlurShader.js';

/* =============================================
   SCENE (Need for Speed 2015 Urban Atmosphere)
   ============================================= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060810);
scene.fog = new THREE.FogExp2(0x060810, 0.004);

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
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

/* =============================================
   POST-PROCESSING (Bloom & Speed Motion Blur)
   ============================================= */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.75, // strength
    0.45, // radius
    0.80, // threshold
);
composer.addPass(bloomPass);

const motionBlurPass = createMotionBlurPass();
composer.addPass(motionBlurPass);

/* =============================================
   LIGHTING (Warm Sodium City Glow Environment)
   ============================================= */
scene.add(new THREE.AmbientLight(0x332222, 0.9));
scene.add(new THREE.HemisphereLight(0xff8833, 0x050810, 0.7));

const moon = new THREE.DirectionalLight(0xffaa55, 0.7);
moon.position.set(30, 80, -50);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -50;
moon.shadow.camera.right = 50;
moon.shadow.camera.top = 50;
moon.shadow.camera.bottom = -50;
moon.shadow.camera.near = 0.5;
moon.shadow.camera.far = 200;
scene.add(moon);
scene.add(moon.target);

/* =============================================
   SKY DOME (NFS 2015 Warm Horizon Gradient Shader)
   ============================================= */
const skyGeo = new THREE.SphereGeometry(400, 32, 32);
const skyMat = new THREE.ShaderMaterial({
    uniforms: {
        topColor: { value: new THREE.Color(0x060c18) },
        bottomColor: { value: new THREE.Color(0x1a0a0f) }, // Warm city glow horizon
        offset: { value: 15 },
        exponent: { value: 0.35 },
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

    // Bloom ramps with speed
    bloomPass.strength = 0.75 + sr * 0.8;

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
    moon.position.set(vehicle.mesh.position.x + 30, 80, vehicle.mesh.position.z - 50);
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
   GAME LOOP
   ============================================= */
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    vehicle.update(dt, input);
    world.update(vehicle.mesh.position);
    weather.update(dt);
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
