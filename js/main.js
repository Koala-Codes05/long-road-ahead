import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

import { Vehicle } from './vehicle.js';
import { World, getRoadZoneInfo, getRoadPoint } from './world.js';
import { InputManager } from './input.js';
import { WeatherSystem } from './weather.js';
import { CloudSystem } from './clouds.js';
import { SpeedTrailSystem } from './speedTrail.js';
import { createMotionBlurPass } from './motionBlurShader.js';
import { createFilmGrainPass } from './filmGrainShader.js';
import { createCinematicGradePass } from './cinematicGradeShader.js';
import { Minimap } from './minimap.js';
import { AudioEngine } from './audio.js';

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
   RENDERER (Clean Canvas Initialization)
   ============================================= */
function getCleanCanvas() {
    let old = document.getElementById('webgl-canvas');
    let fresh = document.createElement('canvas');
    fresh.id = 'webgl-canvas';
    fresh.width = window.innerWidth;
    fresh.height = window.innerHeight;
    fresh.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:block;z-index:0;';
    if (old && old.parentNode) {
        old.parentNode.replaceChild(fresh, old);
    } else {
        document.body.insertBefore(fresh, document.body.firstChild);
    }
    return fresh;
}

function createFreshWebGLRenderer() {
    const presetConfigs = [
        // Preset 1: Pristine DOM canvas with High Performance
        (c) => ({ canvas: c, antialias: true, powerPreference: 'high-performance' }),
        // Preset 2: Pristine DOM canvas with Default Power & Antialias
        (c) => ({ canvas: c, antialias: true, powerPreference: 'default' }),
        // Preset 3: Pristine DOM canvas with Default Power, No Antialias
        (c) => ({ canvas: c, antialias: false, powerPreference: 'default' }),
        // Preset 4: Pristine DOM canvas with Low Power Mode
        (c) => ({ canvas: c, antialias: false, powerPreference: 'low-power' }),
        // Preset 5: Medium precision & depth options
        (c) => ({ canvas: c, antialias: false, precision: 'mediump', powerPreference: 'low-power', stencil: false, depth: true }),
        // Preset 6: preserveDrawingBuffer false & alpha false
        (c) => ({ canvas: c, antialias: false, alpha: false, preserveDrawingBuffer: false }),
        // Preset 7: Standard Three.js auto-allocated canvas with Default Power
        () => ({ antialias: true, powerPreference: 'default' }),
        // Preset 8: Standard Three.js auto-allocated canvas with Low Power
        () => ({ antialias: false, powerPreference: 'low-power' }),
        // Preset 9: Bare minimum options
        () => ({ antialias: false })
    ];

    for (let i = 0; i < presetConfigs.length; i++) {
        try {
            const freshCanvas = getCleanCanvas();
            const options = {
                stencil: false,
                failIfMajorPerformanceCaveat: false,
                ...presetConfigs[i](freshCanvas)
            };
            const r = new THREE.WebGLRenderer(options);
            if (r && r.getContext() && !r.getContext().isContextLost()) {
                console.log(`✅ WebGL Renderer initialized successfully with preset #${i + 1}`);
                return r;
            }
        } catch (err) {
            console.warn(`WebGL preset #${i + 1} failed:`, err);
        }
    }
    return null;
}

let renderer = null;
let composer = null;
let bloomPass = null;
let cinematicGradePass = null;
let motionBlurPass = null;
let filmGrainPass = null;

function setupRendererSettings(r) {
    if (!r) return;
    if (r.domElement && !r.domElement.parentNode) {
        r.domElement.id = 'webgl-canvas';
        r.domElement.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:block;z-index:0;';
        document.body.insertBefore(r.domElement, document.body.firstChild);
    }
    r.setSize(window.innerWidth, window.innerHeight);
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap; // Ultra-smooth soft shadows
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.18; // Balanced HDR exposure curve
    r.outputColorSpace = THREE.SRGBColorSpace;

    r.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        console.warn('WebGL context lost. Displaying context recovery overlay...');
        showWebGLContextErrorUI('WebGL Context Lost', 'Graphics context was lost by the GPU/browser. Attempting automatic recovery...');
    }, false);

    r.domElement.addEventListener('webglcontextrestored', () => {
        console.log('WebGL context restored successfully.');
        hideWebGLContextErrorUI();
    }, false);
}

function initComposerAndPasses(r) {
    if (!r) return null;
    const comp = new EffectComposer(r);
    comp.addPass(new RenderPass(scene, camera));

    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.45, // strength
        0.40, // radius
        0.85, // threshold
    );
    comp.addPass(bloomPass);

    cinematicGradePass = createCinematicGradePass();
    comp.addPass(cinematicGradePass);

    motionBlurPass = createMotionBlurPass();
    comp.addPass(motionBlurPass);

    filmGrainPass = createFilmGrainPass();
    comp.addPass(filmGrainPass);

    return comp;
}

let recoveryTimer = null;
let countdownVal = 5;

function showWebGLContextErrorUI(titleStr, messageStr) {
    let overlay = document.getElementById('webgl-error-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'webgl-error-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(8,12,20,0.95);backdrop-filter:blur(10px);z-index:999999;display:flex;align-items:center;justify-content:center;color:#fff;font-family:Inter,Segoe UI,sans-serif;padding:20px;box-sizing:border-box;';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div style="background:rgba(20,26,38,0.92);border:1px solid rgba(255,80,80,0.4);box-shadow:0 20px 60px rgba(0,0,0,0.8);border-radius:16px;padding:36px;max-width:520px;width:100%;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
            <h2 style="margin:0 0 10px;font-size:22px;color:#ff5555;letter-spacing:0.5px;">${titleStr || 'WebGL Context Initialization Error'}</h2>
            <p style="color:#cbd5e1;line-height:1.6;font-size:14px;margin-bottom:20px;">
                ${messageStr || 'Could not create a WebGL 3D graphics context in your browser. This typically occurs when browser Hardware Acceleration is disabled or graphics drivers are temporarily busy.'}
            </p>
            <div style="background:rgba(0,0,0,0.4);border-radius:8px;padding:14px;text-align:left;font-size:13px;color:#94a3b8;margin-bottom:24px;line-height:1.5;">
                <strong style="color:#e2e8f0;display:block;margin-bottom:6px;">💡 Troubleshooting Steps:</strong>
                • Chrome/Edge: Go to <code style="color:#38bdf8;">chrome://settings/system</code> & enable <b>"Use graphics acceleration when available"</b>.<br>
                • Firefox: Go to <code style="color:#38bdf8;">about:config</code> & ensure <code>webgl.disabled</code> is <b>false</b>.<br>
                • Restart your browser or graphics drivers if context remains lost.
            </div>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button id="webgl-retry-btn" style="background:linear-gradient(135deg, #ff4444, #cc1111);color:#fff;border:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 4px 14px rgba(255,68,68,0.4);transition:all 0.2s;">
                    🔄 RETRY INITIALIZATION
                </button>
            </div>
            <div id="webgl-auto-retry-msg" style="margin-top:14px;font-size:12px;color:#64748b;">
                Auto-retrying in <span id="webgl-countdown">5</span> seconds...
            </div>
        </div>
    `;

    const retryBtn = document.getElementById('webgl-retry-btn');
    if (retryBtn) retryBtn.onclick = () => attemptWebGLRecovery();

    clearInterval(recoveryTimer);
    countdownVal = 5;
    const cdEl = document.getElementById('webgl-countdown');
    recoveryTimer = setInterval(() => {
        countdownVal--;
        if (cdEl) cdEl.textContent = countdownVal;
        if (countdownVal <= 0) {
            clearInterval(recoveryTimer);
            attemptWebGLRecovery();
        }
    }, 1000);
}

function hideWebGLContextErrorUI() {
    clearInterval(recoveryTimer);
    const overlay = document.getElementById('webgl-error-overlay');
    if (overlay) overlay.remove();
}

function attemptWebGLRecovery() {
    console.log('🔄 Attempting WebGL context recovery...');
    const newRenderer = createFreshWebGLRenderer();
    if (newRenderer) {
        renderer = newRenderer;
        window.__THREE_RENDERER__ = renderer;
        setupRendererSettings(renderer);
        composer = initComposerAndPasses(renderer);

        if (typeof weather !== 'undefined' && weather) {
            weather.composer = composer;
            if (weather.rainPass && composer) {
                composer.addPass(weather.rainPass);
            }
        }

        hideWebGLContextErrorUI();
        console.log('🎉 WebGL Context initialization recovered successfully!');
        return true;
    } else {
        console.warn('WebGL context recovery attempt failed.');
        showWebGLContextErrorUI('WebGL Acceleration Unavailable', 'WebGL context creation is currently blocked by browser or system settings.');
        return false;
    }
}

renderer = createFreshWebGLRenderer();
if (renderer) {
    window.__THREE_RENDERER__ = renderer;
    setupRendererSettings(renderer);
    composer = initComposerAndPasses(renderer);
} else {
    console.error('All WebGL context initialization attempts failed.');
    showWebGLContextErrorUI('WebGL Context Initialization Error', 'Could not create a WebGL 3D graphics context in your browser.');
}

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if (renderer) {
            try {
                const gl = renderer.getContext();
                const loseCtx = gl ? gl.getExtension('WEBGL_lose_context') : null;
                if (loseCtx) loseCtx.loseContext();
                renderer.dispose();
            } catch (e) {}
        }
    });
}

/* =============================================
   HDR ENVIRONMENT MAP LOADING (Night HDRI)
   ============================================= */
function createHDRNightEnvironment(r) {
    if (!r) return null;
    const pmremGenerator = new THREE.PMREMGenerator(r);
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
    console.warn('EXRLoader failed, using procedural night environment fallback:', err);
    if (renderer) {
        nightHdrTexture = createHDRNightEnvironment(renderer);
        if (weather && weather.weatherType !== 2) {
            scene.environment = nightHdrTexture;
        }
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
   DYNAMIC STREETLAMP OVERHEAD ILLUMINATION
   Highlights vehicle & road with warm amber light when passing under lamp posts
   ============================================= */
const streetlampLight = new THREE.PointLight(0xffa644, 0.0, 36, 1.4);
scene.add(streetlampLight);

function updateStreetlampLighting(dt) {
    if (!vehicle || !vehicle.mesh) return;
    const carPos = vehicle.mesh.position;

    // Find nearest roadside lamp post (placed every 85m)
    const cycle = Math.round((-carPos.z) / 85.0);
    const lampZ_base = -cycle * 85.0;
    const lampPoint = getRoadPoint(lampZ_base);
    const lampNx = Math.cos(lampPoint.angle);
    const lampNz = Math.sin(lampPoint.angle);
    const side = (cycle % 2 === 0 ? -11.6 : 11.6);

    const lampX = lampPoint.x + lampNx * (side * 0.55); // Overhanging fixture towards road
    const lampY = 6.2;
    const lampZ = lampZ_base + lampNz * (side * 0.55);

    const dx = carPos.x - lampX;
    const dz = carPos.z - lampZ;
    const distToLamp = Math.hypot(dx, dz);

    // Illumination radius: peak light when right under lamp post (d < 24m)
    const proximity = THREE.MathUtils.clamp(1.0 - distToLamp / 24.0, 0.0, 1.0);
    const smoothProx = Math.pow(proximity, 1.3);
    const baseTargetIntensity = (weather.weatherType === 0 ? 28.0 : 36.0) * smoothProx;

    streetlampLight.position.set(lampX, lampY, lampZ);
    streetlampLight.intensity = THREE.MathUtils.lerp(streetlampLight.intensity, baseTargetIntensity, dt * 10.0);
}

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
   SKY DOME (Procedural Multi-Octave Atmospheric Sky & Cloud Shader)
   ============================================= */
const skyGeo = new THREE.SphereGeometry(400, 32, 32);
const skyMat = new THREE.ShaderMaterial({
    uniforms: {
        topColor: { value: new THREE.Color(0x263442) },        // Deep upper zenith dark blue-gray
        bottomColor: { value: new THREE.Color(0x5c7082) },     // Mid sky slate blue-gray
        darkCloudColor: { value: new THREE.Color(0x1b2530) },  // Dark dense cloud underbellies
        lightCloudColor: { value: new THREE.Color(0x9eb3c7) }, // Illuminated cloud tops / silver rim
        horizonFogColor: { value: new THREE.Color(0x788a9b) }, // Horizon haze matching scene fog
        uTime: { value: 0.0 },
        uCloudDensity: { value: 1.40 },
        uCloudScale: { value: 1.8 },
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
        uniform vec3 darkCloudColor;
        uniform vec3 lightCloudColor;
        uniform vec3 horizonFogColor;
        uniform float uTime;
        uniform float uCloudDensity;
        uniform float uCloudScale;

        varying vec3 vWorldPosition;

        // Fast GLSL 3D Simplex & FBM noise
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);

            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);

            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;

            i = mod289(i);
            vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z);

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);

            vec4 x = x_ * ns.x + ns.yyyy;
            vec4 y = y_ * ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);

            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);

            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;

            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        float fbm(vec3 p) {
            float total = 0.0;
            float amp = 0.5;
            float freq = 1.0;
            for (int i = 0; i < 4; i++) {
                total += snoise(p * freq) * amp;
                freq *= 2.08;
                amp *= 0.48;
            }
            return total;
        }

        void main() {
            vec3 normPos = normalize(vWorldPosition);
            float height = normPos.y; // -1.0 to 1.0

            // Base atmospheric gradient (horizon to upper zenith)
            float skyGradientFactor = max(height, 0.0);
            vec3 skyBaseColor = mix(bottomColor, topColor, pow(skyGradientFactor, 0.55));

            // Atmospheric cloud noise coordinates with drifting motion
            vec3 cloudCoord = vec3(normPos.xz * uCloudScale * 2.2, uTime * 0.012);
            cloudCoord.y += uTime * 0.006;

            float n1 = fbm(cloudCoord);
            float n2 = fbm(cloudCoord * 2.1 + vec3(2.3, 1.7, 4.1));
            float cloudNoise = clamp((n1 + n2 * 0.45 + 0.15) * uCloudDensity, 0.0, 1.0);

            // Contrast between dark cloud undersides & light cloud edges
            float darkPatch = clamp(fbm(cloudCoord * 0.85 + vec3(4.1, 2.9, 1.2)), 0.0, 1.0);
            vec3 cloudColor = mix(lightCloudColor, darkCloudColor, darkPatch * 0.75 + 0.25);

            // Mask clouds above horizon line
            float cloudMask = smoothstep(0.01, 0.40, height);
            vec3 finalSky = mix(skyBaseColor, cloudColor, cloudNoise * cloudMask * 0.88);

            // Horizon atmospheric haze fading seamlessly into scene fog color
            float horizonHaze = 1.0 - smoothstep(-0.05, 0.35, max(height, -0.05));
            finalSky = mix(finalSky, horizonFogColor, horizonHaze * 0.95);

            gl_FragColor = vec4(finalSky, 1.0);
        }
    `,
    side: THREE.BackSide,
    depthWrite: false,
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
const weather = new WeatherSystem(scene, vehicle.mesh, world, composer);

// High-Fidelity Glowing Motion Trail & Speed Ribbon System
const speedTrailSystem = new SpeedTrailSystem(scene, vehicle.mesh);

// Need for Speed / Driveclub Circular Minimap Radar HUD
const minimap = new Minimap();

// Ferrari Engine Sound & Audio Controller
const audioEngine = new AudioEngine();

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
        if (scene.fog) { scene.fog.color.setHex(0x080e18); scene.fog.density = 0.0065; }

        skyMat.uniforms.topColor.value.setHex(0x03060c);
        skyMat.uniforms.bottomColor.value.setHex(0x0a1220);
        skyMat.uniforms.darkCloudColor.value.setHex(0x020408);
        skyMat.uniforms.lightCloudColor.value.setHex(0x1a2638);
        skyMat.uniforms.horizonFogColor.value.setHex(0x080e18);
        skyMat.uniforms.uCloudDensity.value = 1.50;
        skyMat.uniforms.uCloudScale.value = 2.0;

        ambientMoon.color.setHex(0x334466); ambientMoon.intensity = 0.25;
        ambientSodium.color.setHex(0xff8822); ambientSodium.intensity = 0.20;
        hemiLight.color.setHex(0x3a4b60); hemiLight.groundColor.setHex(0x101620); hemiLight.intensity = 0.35;

        moon.color.setHex(0xa0b8dc); moon.intensity = 0.20;
        cameraDiffuseLight.intensity = 0.7;
        cameraLight.intensity = 0.4;

        if (renderer) renderer.toneMappingExposure = 0.88;

    } else if (type === 1) { // DRIZZLE (Moody Night Drizzle)
        if (nightHdrTexture) scene.environment = nightHdrTexture;
        scene.background = new THREE.Color(0x0a101d);
        if (scene.fog) { scene.fog.color.setHex(0x0a101d); scene.fog.density = 0.0052; }

        skyMat.uniforms.topColor.value.setHex(0x050912);
        skyMat.uniforms.bottomColor.value.setHex(0x101a2c);
        skyMat.uniforms.darkCloudColor.value.setHex(0x060b15);
        skyMat.uniforms.lightCloudColor.value.setHex(0x22324a);
        skyMat.uniforms.horizonFogColor.value.setHex(0x0a101d);
        skyMat.uniforms.uCloudDensity.value = 1.15;
        skyMat.uniforms.uCloudScale.value = 1.6;

        ambientMoon.color.setHex(0x445577); ambientMoon.intensity = 0.40;
        ambientSodium.color.setHex(0xff9933); ambientSodium.intensity = 0.30;
        hemiLight.color.setHex(0x4c607a); hemiLight.groundColor.setHex(0x18202d); hemiLight.intensity = 0.45;

        moon.color.setHex(0xb8d0f5); moon.intensity = 0.38;
        cameraDiffuseLight.intensity = 0.8;
        cameraLight.intensity = 0.5;

        if (renderer) renderer.toneMappingExposure = 0.92;

    } else if (type === 2) { // CLOUDY DAY (Daytime Storm / Overcast Daytime Rain)
        if (dayHdrTexture) scene.environment = dayHdrTexture;
        scene.background = new THREE.Color(0x788a9b);
        if (scene.fog) { scene.fog.color.setHex(0x788a9b); scene.fog.density = 0.0045; }

        skyMat.uniforms.topColor.value.setHex(0x263442);        // Deep moody slate zenith
        skyMat.uniforms.bottomColor.value.setHex(0x5c7082);     // Mid stormy blue-gray
        skyMat.uniforms.darkCloudColor.value.setHex(0x1b2530);  // Dark turbulent storm patches
        skyMat.uniforms.lightCloudColor.value.setHex(0x9eb3c7); // Lighter silver cloud tops & breaks
        skyMat.uniforms.horizonFogColor.value.setHex(0x788a9b); // Horizon fog match
        skyMat.uniforms.uCloudDensity.value = 1.40;            // High cloud density & variation!
        skyMat.uniforms.uCloudScale.value = 1.8;

        ambientMoon.color.setHex(0x9cb0c4); ambientMoon.intensity = 1.05;
        ambientSodium.color.setHex(0x5c6670); ambientSodium.intensity = 0.35;
        hemiLight.color.setHex(0xbad0e4); hemiLight.groundColor.setHex(0x454e56); hemiLight.intensity = 1.25;

        moon.color.setHex(0xf0f4f8); moon.intensity = 1.75;
        cameraDiffuseLight.intensity = 1.0;
        cameraLight.intensity = 0.6;

        if (renderer) renderer.toneMappingExposure = 0.95;

    } else { // CLEAR (Night Sky with Moon)
        if (nightHdrTexture) scene.environment = nightHdrTexture;
        scene.background = new THREE.Color(0x04060c);
        if (scene.fog) { scene.fog.color.setHex(0x04060c); scene.fog.density = 0.0028; }

        skyMat.uniforms.topColor.value.setHex(0x020307);
        skyMat.uniforms.bottomColor.value.setHex(0x090e1a);
        skyMat.uniforms.darkCloudColor.value.setHex(0x03050a);
        skyMat.uniforms.lightCloudColor.value.setHex(0x141d30);
        skyMat.uniforms.horizonFogColor.value.setHex(0x04060c);
        skyMat.uniforms.uCloudDensity.value = 0.45;
        skyMat.uniforms.uCloudScale.value = 1.2;

        ambientMoon.color.setHex(0x445577); ambientMoon.intensity = 0.50;
        ambientSodium.color.setHex(0xff9933); ambientSodium.intensity = 0.35;
        hemiLight.color.setHex(0x4c607a); hemiLight.groundColor.setHex(0x18202d); hemiLight.intensity = 0.55;

        moon.color.setHex(0xcce0ff); moon.intensity = 0.45;
        cameraDiffuseLight.intensity = 0.8;
        cameraLight.intensity = 0.5;

        if (renderer) renderer.toneMappingExposure = 0.90;
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

    // Bloom ramps with speed (balanced for subtle glow)
    if (bloomPass) bloomPass.strength = 0.25 + sr * 0.2;

    // Dynamic High-Speed Radial Motion Blur
    if (motionBlurPass) {
        const nitroBlur = vehicle.isNitro ? 0.08 : 0.0;
        const targetBlur = Math.pow(sr, 1.3) * 0.12 + nitroBlur;
        motionBlurPass.uniforms.uStrength.value = THREE.MathUtils.lerp(
            motionBlurPass.uniforms.uStrength.value,
            targetBlur,
            dt * 10.0
        );
    }

    // Dynamic 35mm Analog Film Grain
    if (filmGrainPass) {
        filmGrainPass.uniforms.uTime.value += dt;
        filmGrainPass.uniforms.uSpeedBoost.value = sr;
    }

    // Move sky dome & overhead camera lights (100m diffuse coverage, zero specular glare on car)
    sky.position.copy(camera.position);
    if (skyMat && skyMat.uniforms.uTime) skyMat.uniforms.uTime.value += dt;
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
    // Weather-dependent celestial & overhead ambient lighting
    const isDrizzle = (weather.weatherType === 1);

    moon.intensity = isOvercastStorm ? 0.15 : (isDrizzle ? 0.28 : 0.40);

    // Dim overhead lights during storm to match dark overcast atmosphere and prevent vehicle over-exposure
    const targetDiffInt = isOvercastStorm ? 0.45 : (isDrizzle ? 0.85 : 1.40);
    const targetCamInt = isOvercastStorm ? 0.85 : (isDrizzle ? 1.70 : 2.80);
    cameraDiffuseLight.intensity = THREE.MathUtils.lerp(cameraDiffuseLight.intensity, targetDiffInt, dt * 3.5);
    cameraLight.intensity = THREE.MathUtils.lerp(cameraLight.intensity, targetCamInt, dt * 3.5);
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
    audioEngine.init();
    if (elLoading.classList.contains('fade-out')) return;
    elLoading.classList.add('fade-out');
    elHud.style.display = 'block';
    window.focus();
    setTimeout(() => { if (elHint) elHint.style.opacity = '0'; }, 8000);
    setTimeout(() => { elLoading.style.display = 'none'; }, 1200);
}

if (elStartBtn) elStartBtn.addEventListener('click', startGame);
if (elLoading) elLoading.addEventListener('click', startGame);
window.addEventListener('click', () => { audioEngine.init(); });
window.addEventListener('keydown', () => {
    audioEngine.init();
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
    audioEngine.update(vehicle, weather.weatherType !== 3);

    const isDrifting = vehicle.isDrifting || input.handbrake || (input.brake && Math.abs(input.steering) > 0.3);
    speedTrailSystem.update(dt, vehicle.getSpeedKmh(), isDrifting, input.brake);

    updateCamera(dt);
    updateStreetlampLighting(dt);
    if (composer) {
        composer.render();
    } else if (renderer) {
        renderer.render(scene, camera);
    }
}
animate();

/* =============================================
   RESIZE
   ============================================= */
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});
