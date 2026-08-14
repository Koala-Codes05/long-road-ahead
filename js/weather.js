import * as THREE from 'three';
import { createRainPass } from './rainShader.js';
import { Raindrops } from './raindrops.js';

/**
 * WeatherSystem — Driveclub-style Multi-Tiered Weather Engine
 * Features:
 *  - 3D Camera-Relative Rain Volume Box with GPU Velocity-Stretching particles
 *  - Dynamic Lighting Attenuation (Ambient Moonlight, Streetlights, Vehicle Headlights)
 *  - Procedural Specular Highlights (N·H) and Normal Maps on Rain Drops
 *  - Lucas Bebber 2D Screen-Space Windshield Refraction Pass (Cockpit View)
 *  - Rain-Sensing Auto Wiper Swath Physics & Wet Asphalt Clearcoat Reflectivity
 *  - Tire Spray Mist & Volumetric Cloud Dome
 */
export class WeatherSystem {
    constructor(scene, vehicle, world, composer, skyController = null) {
        this.scene = scene;
        this.vehicle = vehicle;
        this.world = world;
        this.composer = composer;
        this.skyController = skyController;

        // 1. Add GLSL Rain Refraction Pass to EffectComposer
        this.rainPass = createRainPass();
        this.rainPass.uniforms.uRenderShine.value = false;
        this.composer.addPass(this.rainPass);

        // 2. Initialize Lucas Bebber 2D Raindrops Physics Canvas & Textures
        this._initRaindropsPhysics();

        // 3. Initialize Driveclub-style 3D Camera-Relative Rain Particle Volume
        this._init3DRainVolume();

        // 4. Add tire splash mist
        this._initTireMist();

        // 5. Apply wet asphalt mirror look
        this._applyWetRoad();

        // 6. Volumetric Night Cloud Layer
        this._initVolumetricClouds();

        this.clockTime = 0;
        this.gForce = new THREE.Vector2(0, 0);
        this.windVector = new THREE.Vector2(0.5, 0.2); // Dynamic environmental ambient wind vector (X, Y)

        // Rain-Sensing Wiper Physics & Car Body Wetness Controller
        this._initWiperSystem();
        this.wetness = 0.0;

        // Weather Modes: 0 = Heavy Storm, 1 = Drizzle, 3 = Clear
        this.weatherType = 0;
        this.lightningTimer = 0;
        this.lightningFlash = 0;
        this.lightningTimeoutId = null;
        this.lightningIntervalId = null;

        this.prevCamPos = new THREE.Vector3();
        this.cameraVel = new THREE.Vector3();

        window.addEventListener('resize', () => {
            if (this.rainPass) {
                this.rainPass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
            }
        });
    }

    /* ==================================================
       DRIVECLUB 3D CAMERA-RELATIVE RAIN PARTICLE VOLUME
       ================================================== */
    _init3DRainVolume() {
        this._createRainTextures();

        // Layer 1: Near High-Detail Instanced Stretched Billboards (~800 drops)
        this.nearCount = 800;
        this.nearLayer = this._createRainInstancedMesh(this.nearCount, 0.045, 0.50);

        // Layer 2: Mid-Range Instanced Stretched Billboards (~2,400 drops)
        this.midCount = 2400;
        this.midLayer = this._createRainInstancedMesh(this.midCount, 0.028, 0.32);

        // Layer 3: Far Atmospheric Density Particles (~7,000 points)
        this.farCount = 7000;
        this.farLayer = this._createFarRainPoints(this.farCount);

        this.scene.add(this.nearLayer);
        this.scene.add(this.midLayer);
        this.scene.add(this.farLayer);
    }

    _createRainTextures() {
        // Procedural Rain Drop Alpha Gradient Texture (Soft Core Falloff)
        const alphaCanvas = document.createElement('canvas');
        alphaCanvas.width = 128; alphaCanvas.height = 256;
        const actx = alphaCanvas.getContext('2d');

        const grad = actx.createLinearGradient(64, 0, 64, 256);
        grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
        grad.addColorStop(0.20, 'rgba(255, 255, 255, 0.6)');
        grad.addColorStop(0.50, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.80, 'rgba(255, 255, 255, 0.6)');
        grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
        actx.fillStyle = grad;
        actx.fillRect(0, 0, 128, 256);

        this.rainDropAlphaTex = new THREE.CanvasTexture(alphaCanvas);

        // Procedural Surface Normal Texture for Specular Highlights (N·H)
        const normCanvas = document.createElement('canvas');
        normCanvas.width = 128; normCanvas.height = 128;
        const nctx = normCanvas.getContext('2d');
        const imgData = nctx.createImageData(128, 128);

        for (let y = 0; y < 128; y++) {
            for (let x = 0; x < 128; x++) {
                const nx = (x / 128.0) * 2.0 - 1.0;
                const ny = (y / 128.0) * 2.0 - 1.0;
                const r2 = nx * nx + ny * ny;
                let nz = 1.0;
                if (r2 < 1.0) {
                    nz = Math.sqrt(1.0 - r2);
                } else {
                    nz = 0.0;
                }
                const idx = (y * 128 + x) * 4;
                imgData.data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
                imgData.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
                imgData.data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
                imgData.data[idx + 3] = 255;
            }
        }
        nctx.putImageData(imgData, 0, 0);

        this.rainDropNormalTex = new THREE.CanvasTexture(normCanvas);
    }

    _createRainInstancedMesh(count, baseWidth, baseLength) {
        // Base Quad Geometry
        const quadGeo = new THREE.PlaneGeometry(1, 1);

        const instGeo = new THREE.InstancedBufferGeometry();
        instGeo.index = quadGeo.index;
        instGeo.attributes = quadGeo.attributes;

        const posAttr = new Float32Array(count * 3);
        const velAttr = new Float32Array(count * 3);
        const scaleAttr = new Float32Array(count * 2);
        const seedAttr = new Float32Array(count);

        const boxW = 32, boxH = 20, boxD = 32;

        for (let i = 0; i < count; i++) {
            posAttr[i * 3] = (Math.random() - 0.5) * boxW;
            posAttr[i * 3 + 1] = (Math.random() - 0.5) * boxH;
            posAttr[i * 3 + 2] = (Math.random() - 0.5) * boxD;

            velAttr[i * 3] = (Math.random() - 0.5) * 1.2;
            velAttr[i * 3 + 1] = -32.0 - Math.random() * 10.0; // Falling speed (m/s)
            velAttr[i * 3 + 2] = (Math.random() - 0.5) * 1.2;

            scaleAttr[i * 2] = baseWidth * (0.8 + Math.random() * 0.4);
            scaleAttr[i * 2 + 1] = baseLength * (0.7 + Math.random() * 0.6);

            seedAttr[i] = Math.random();
        }

        instGeo.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(posAttr, 3));
        instGeo.setAttribute('instanceVelocity', new THREE.InstancedBufferAttribute(velAttr, 3));
        instGeo.setAttribute('instanceScale', new THREE.InstancedBufferAttribute(scaleAttr, 2));
        instGeo.setAttribute('instanceSeed', new THREE.InstancedBufferAttribute(seedAttr, 1));

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uCameraPos: { value: new THREE.Vector3() },
                uCameraVel: { value: new THREE.Vector3() },
                uWindVector: { value: new THREE.Vector2() },
                uRainIntensity: { value: 1.0 },
                uHeadlightPos: { value: new THREE.Vector3() },
                uHeadlightDir: { value: new THREE.Vector3(0, 0, -1) },
                uHeadlightColor: { value: new THREE.Color(0xfff2dc) },
                uStreetlightCount: { value: 0 },
                uStreetlightPos: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
                uStreetlightColor: { value: Array.from({ length: 6 }, () => new THREE.Color()) },
                uAlphaTex: { value: this.rainDropAlphaTex },
                uNormalTex: { value: this.rainDropNormalTex },
            },
            vertexShader: `
                attribute vec3 instancePosition;
                attribute vec3 instanceVelocity;
                attribute vec2 instanceScale;
                attribute float instanceSeed;

                uniform vec3 uCameraPos;
                uniform vec3 uCameraVel;
                uniform vec2 uWindVector;
                uniform float uTime;
                uniform float uRainIntensity;

                varying vec2 vUv;
                varying vec3 vWorldPos;
                varying vec3 vViewDir;
                varying vec3 vRelVelocity;

                void main() {
                    vUv = uv;
                    
                    // Effective rain velocity vector with wind
                    vec3 worldParticleVel = instanceVelocity + vec3(uWindVector.x * 8.0, 0.0, uWindVector.y * 8.0);
                    
                    // Relative velocity considering camera motion
                    vec3 relVel = worldParticleVel - uCameraVel * 0.85;
                    vRelVelocity = relVel;
                    
                    float speed = length(relVel);
                    
                    // Camera-relative volume box: 32m x 20m x 32m
                    vec3 boxSize = vec3(32.0, 20.0, 32.0);
                    vec3 pLocal = instancePosition;
                    
                    // Translate falling drops smoothly
                    pLocal += worldParticleVel * uTime * 0.35;
                    
                    // Wrap positions inside camera-relative box
                    pLocal.x = mod(pLocal.x + boxSize.x * 0.5, boxSize.x) - boxSize.x * 0.5;
                    pLocal.y = mod(pLocal.y + boxSize.y * 0.5, boxSize.y) - boxSize.y * 0.5;
                    pLocal.z = mod(pLocal.z + boxSize.z * 0.5, boxSize.z) - boxSize.z * 0.5;
                    
                    vec3 pWorldCenter = uCameraPos + pLocal;
                    vWorldPos = pWorldCenter;
                    vViewDir = normalize(uCameraPos - pWorldCenter);
                    
                    // Transform center position and relative velocity to View Space
                    vec4 viewCenter = viewMatrix * vec4(pWorldCenter, 1.0);
                    vec3 viewVel = mat3(viewMatrix) * relVel;
                    
                    // Project relative velocity onto View Plane (X, Y)
                    vec2 dir2D = viewVel.xy;
                    float len2D = length(dir2D);
                    if (len2D < 0.001) {
                        dir2D = vec2(0.0, -1.0);
                    } else {
                        dir2D /= len2D;
                    }
                    vec2 right2D = vec2(-dir2D.y, dir2D.x);
                    
                    // Velocity-based streak stretch
                    float stretch = instanceScale.y * (1.0 + min(speed, 50.0) * 0.02);
                    float width = instanceScale.x;
                    
                    vec2 offsetView = right2D * (position.x * width) + dir2D * (position.y * stretch);
                    vec4 finalViewPos = vec4(viewCenter.xy + offsetView, viewCenter.z, 1.0);
                    
                    gl_Position = projectionMatrix * finalViewPos;
                }
            `,
            fragmentShader: `
                uniform sampler2D uAlphaTex;
                uniform sampler2D uNormalTex;
                uniform float uRainIntensity;
                uniform vec3 uCameraPos;
                uniform vec3 uHeadlightPos;
                uniform vec3 uHeadlightDir;
                uniform vec3 uHeadlightColor;
                uniform int uStreetlightCount;
                uniform vec3 uStreetlightPos[6];
                uniform vec3 uStreetlightColor[6];
                
                varying vec2 vUv;
                varying vec3 vWorldPos;
                varying vec3 vViewDir;
                varying vec3 vRelVelocity;

                void main() {
                    if (uRainIntensity < 0.01) discard;
                    
                    // Soft tapered streak alpha profile (Gaussian center core)
                    float coreX = exp(-pow((vUv.x - 0.5) * 3.5, 2.0));
                    float coreY = smoothstep(0.0, 0.10, vUv.y) * (1.0 - smoothstep(0.90, 1.0, vUv.y));
                    float mask = coreX * coreY;
                    if (mask < 0.01) discard;
                    
                    // Surface Normal Map for Specular Highlights
                    vec3 nMap = texture2D(uNormalTex, vUv).xyz * 2.0 - 1.0;
                    vec3 N = normalize(nMap);
                    vec3 V = normalize(vViewDir);
                    
                    // Cool silver-white ambient moonlight illumination
                    vec3 ambient = vec3(0.80, 0.88, 1.0);
                    vec3 totalLight = ambient * 0.6;
                    float totalSpecular = 0.0;
                    
                    // Vehicle Headlight Illumination
                    vec3 toHead = uHeadlightPos - vWorldPos;
                    float distHead = length(toHead);
                    vec3 L_head = toHead / max(distHead, 0.001);
                    float coneCos = dot(normalize(-uHeadlightDir), L_head);
                    float coneSpot = smoothstep(0.65, 0.95, coneCos);
                    float headAtten = coneSpot / (1.0 + 0.05 * distHead + 0.005 * distHead * distHead);
                    
                    if (headAtten > 0.002) {
                        totalLight += uHeadlightColor * headAtten * 0.6;
                        vec3 H = normalize(L_head + V);
                        totalSpecular += pow(max(dot(N, H), 0.0), 32.0) * headAtten * 1.2;
                    }
                    
                    // Streetlights Illumination (subtle glint)
                    for (int i = 0; i < 6; i++) {
                        if (i >= uStreetlightCount) break;
                        vec3 toLight = uStreetlightPos[i] - vWorldPos;
                        float d = length(toLight);
                        vec3 L_street = toLight / max(d, 0.001);
                        float atten = 1.0 / (1.0 + 0.1 * d + 0.02 * d * d);
                        if (atten > 0.005) {
                            vec3 streetCol = clamp(uStreetlightColor[i], vec3(0.0), vec3(1.0));
                            totalLight += streetCol * atten * 0.4;
                            vec3 H = normalize(L_street + V);
                            totalSpecular += pow(max(dot(N, H), 0.0), 24.0) * atten * 0.8;
                        }
                    }
                    
                    // Distance Clipping & Fading
                    float distCam = length(uCameraPos - vWorldPos);
                    float nearFade = smoothstep(0.3, 1.2, distCam);
                    float farFade = 1.0 - smoothstep(22.0, 32.0, distCam);
                    
                    // High-Visibility Silver Rain Streaks (Driveclub AAA Target)
                    float finalAlpha = mask * uRainIntensity * nearFade * farFade * 0.85;
                    vec3 finalColor = totalLight * 1.5 + vec3(totalSpecular * 1.8) + vec3(0.35, 0.40, 0.50);
                    
                    gl_FragColor = vec4(finalColor, finalAlpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        return new THREE.Mesh(instGeo, mat);
    }

    _createFarRainPoints(count) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const boxW = 40, boxH = 26, boxD = 40;

        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * boxW;
            positions[i * 3 + 1] = (Math.random() - 0.5) * boxH;
            positions[i * 3 + 2] = (Math.random() - 0.5) * boxD;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uCameraPos: { value: new THREE.Vector3() },
                uWindVector: { value: new THREE.Vector2() },
                uRainIntensity: { value: 1.0 },
            },
            vertexShader: `
                uniform vec3 uCameraPos;
                uniform vec2 uWindVector;
                uniform float uTime;

                void main() {
                    vec3 pLocal = position;
                    vec3 vel = vec3(uWindVector.x * 5.0, -32.0, uWindVector.y * 5.0);
                    
                    pLocal += vel * uTime * 0.35;
                    vec3 boxSize = vec3(40.0, 26.0, 40.0);
                    
                    pLocal.x = mod(pLocal.x + boxSize.x * 0.5, boxSize.x) - boxSize.x * 0.5;
                    pLocal.y = mod(pLocal.y + boxSize.y * 0.5, boxSize.y) - boxSize.y * 0.5;
                    pLocal.z = mod(pLocal.z + boxSize.z * 0.5, boxSize.z) - boxSize.z * 0.5;
                    
                    vec3 pWorld = uCameraPos + pLocal;
                    gl_Position = projectionMatrix * viewMatrix * vec4(pWorld, 1.0);
                    gl_PointSize = 2.2;
                }
            `,
            fragmentShader: `
                uniform float uRainIntensity;
                void main() {
                    if (uRainIntensity < 0.01) discard;
                    gl_FragColor = vec4(0.82, 0.88, 1.0, 0.22 * uRainIntensity);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        return new THREE.Points(geo, mat);
    }

    _update3DRainVolume(dt, camera) {
        if (!camera) return;

        // Calculate Camera Velocity
        if (this.prevCamPos.lengthSq() > 0.001) {
            this.cameraVel.subVectors(camera.position, this.prevCamPos).divideScalar(Math.max(dt, 0.001));
        } else {
            this.cameraVel.set(0, 0, 0);
        }
        this.prevCamPos.copy(camera.position);

        const targetIntensity = this.weatherType === 0 ? 1.0 : (this.weatherType === 1 ? 0.45 : 0.0);

        // Update Vehicle Headlight Uniforms
        const carPos = this.vehicle.mesh.position;
        const heading = this.vehicle.heading;
        const headPos = new THREE.Vector3(
            carPos.x - Math.sin(heading) * 1.8,
            carPos.y + 0.6,
            carPos.z - Math.cos(heading) * 1.8
        );
        const headDir = new THREE.Vector3(
            -Math.sin(heading),
            -0.08,
            -Math.cos(heading)
        ).normalize();

        // Update Dynamic Streetlight Uniforms (up to 6 closest streetlights)
        const streetPosArr = [];
        const streetColArr = [];
        let streetCount = 0;

        if (this.world && this.world.lightPool) {
            this.world.lightPool.forEach(pl => {
                if (pl.visible && streetCount < 6) {
                    streetPosArr.push(pl.position);
                    streetColArr.push(pl.color);
                    streetCount++;
                }
            });
        }

        // Update Instanced Layer Uniforms
        [this.nearLayer, this.midLayer].forEach(layer => {
            if (!layer) return;
            const u = layer.material.uniforms;
            u.uTime.value = this.clockTime;
            u.uCameraPos.value.copy(camera.position);
            u.uCameraVel.value.copy(this.cameraVel);
            u.uWindVector.value.copy(this.windVector);
            u.uRainIntensity.value = THREE.MathUtils.lerp(u.uRainIntensity.value, targetIntensity, dt * 4.0);

            u.uHeadlightPos.value.copy(headPos);
            u.uHeadlightDir.value.copy(headDir);

            u.uStreetlightCount.value = streetCount;
            for (let i = 0; i < streetCount; i++) {
                u.uStreetlightPos.value[i].copy(streetPosArr[i]);
                u.uStreetlightColor.value[i].copy(streetColArr[i]);
            }
        });

        if (this.farLayer) {
            const u = this.farLayer.material.uniforms;
            u.uTime.value = this.clockTime;
            u.uCameraPos.value.copy(camera.position);
            u.uWindVector.value.copy(this.windVector);
            u.uRainIntensity.value = THREE.MathUtils.lerp(u.uRainIntensity.value, targetIntensity, dt * 4.0);
        }
    }

    _initRaindropsPhysics() {
        const placeholderCanvas = document.createElement('canvas');
        placeholderCanvas.width = 1;
        placeholderCanvas.height = 1;
        this.waterTexture = new THREE.CanvasTexture(placeholderCanvas);
        this.rainPass.uniforms.uWaterMap.value = this.waterTexture;

        const textureLoader = new THREE.TextureLoader();
        let dropAlphaImg = null;
        let dropColorImg = null;

        textureLoader.load('assets/rain/drop-shine.png', (tex) => {
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            this.rainPass.uniforms.uTextureShine.value = tex;
            this.rainPass.uniforms.uRenderShine.value = false;
        });

        textureLoader.load('assets/rain/drop-alpha.png', (tex) => {
            dropAlphaImg = tex.image;
            this._tryStartRaindrops(dropAlphaImg, dropColorImg);
        });

        textureLoader.load('assets/rain/drop-color.png', (tex) => {
            dropColorImg = tex.image;
            this._tryStartRaindrops(dropAlphaImg, dropColorImg);
        });
    }

    _tryStartRaindrops(dropAlphaImg, dropColorImg) {
        if (!dropAlphaImg || !dropColorImg || this.raindrops) return;

        // Fixed high-performance physics resolution (512 width, scaled height)
        const simW = 512;
        const simH = Math.round(512 * (window.innerHeight / window.innerWidth));

        this.raindrops = new Raindrops(
            simW,
            simH,
            1,
            dropAlphaImg,
            dropColorImg,
            {
                minR: 4,
                maxR: 18,
                maxDrops: 150,
                rainChance: 0.12,
                rainLimit: 2,
                dropletsRate: 20,
                dropletsSize: [1.5, 4.0],
                trailRate: 0.4,
                trailScaleRange: [0.15, 0.3],
                spawnArea: [-0.1, 1.0],
                windSpread: 0.8,
            },
        );

        this.waterTexture = new THREE.CanvasTexture(this.raindrops.canvas);
        this.waterTexture.minFilter = THREE.LinearFilter;
        this.waterTexture.magFilter = THREE.LinearFilter;
        this.rainPass.uniforms.uWaterMap.value = this.waterTexture;

        this._setupLightningFlicker();
    }

    _initTireMist() {
        this.mistCount = 450;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.mistCount * 3);

        for (let i = 0; i < this.mistCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 4;
            positions[i * 3 + 1] = Math.random() * 0.5;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            size: 2.0,
            color: 0x88ccff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.mist = new THREE.Points(geo, mat);
        this.scene.add(this.mist);
    }

    _updateTireMist(dt, carPos, speed) {
        if (!this.mist) return;

        const isMovingOnWet = speed > 2.0 && this.weatherType !== 3;
        const targetOpacity = isMovingOnWet ? Math.min((speed / 40.0) * 0.45, 0.45) : 0.0;

        this.mist.material.opacity = THREE.MathUtils.lerp(
            this.mist.material.opacity,
            targetOpacity,
            dt * 8.0
        );

        if (this.mist.material.opacity < 0.01) return;

        const positions = this.mist.geometry.attributes.position.array;
        const heading = this.vehicle.heading;

        for (let i = 0; i < this.mistCount; i++) {
            const idx = i * 3;
            positions[idx] += dt * (this.windVector.x * 4.0);
            positions[idx + 1] += dt * (1.2 + speed * 0.07);
            positions[idx + 2] += dt * (this.windVector.y * 3.0);

            if (positions[idx + 1] > 2.4) {
                positions[idx] = carPos.x + (Math.random() - 0.5) * 2.4;
                positions[idx + 1] = carPos.y + 0.1;
                positions[idx + 2] = carPos.z + Math.cos(heading) * 2.0 + (Math.random() - 0.5) * 1.8;
            }
        }
        this.mist.geometry.attributes.position.needsUpdate = true;
    }

    _applyWetRoad() {
        if (this.world.roadMat) {
            this.world.roadMat.roughness = 0.04;
            this.world.roadMat.metalness = 0.95;
        }
        if (this.world.sidewalkMat) {
            this.world.sidewalkMat.roughness = 0.15;
        }
    }

    _setupLightningFlicker() {
        if (this.lightningIntervalId) clearInterval(this.lightningIntervalId);

        const scheduleFlicker = () => {
            if (this.weatherType === 0) { // Storm
                const flicker = Math.random() * 2.0;
                this.lightningFlash = flicker;
                this.rainPass.uniforms.uLightningFlash.value = flicker;

                this.lightningTimeoutId = setTimeout(() => {
                    this.lightningFlash = 0.0;
                    this.rainPass.uniforms.uLightningFlash.value = 0.0;
                }, 100 + Math.random() * 200);
            } else {
                this.lightningFlash = 0.0;
                this.rainPass.uniforms.uLightningFlash.value = 0.0;
            }
        };

        this.lightningIntervalId = setInterval(scheduleFlicker, 2000 + Math.random() * 3000);
    }

    setWeather(type) {
        this.weatherType = type;
        if (this.rainPass) {
            this.rainPass.uniforms.uWeatherType.value = type;
        }

        if (this.skyController) {
            const { skyParameters, skyUniforms, updateSun } = this.skyController;
            if (type === 0) { // STORM
                skyParameters.elevation = -4.0;
                skyParameters.azimuth = 180;
                skyParameters.exposure = 0.005;
                skyUniforms['turbidity'].value = 20;
                skyUniforms['rayleigh'].value = 0.15;
                skyUniforms['mieCoefficient'].value = 0.02;
                skyUniforms['mieDirectionalG'].value = 0.3;
            } else if (type === 1) { // DRIZZLE
                skyParameters.elevation = -3.0;
                skyParameters.azimuth = 180;
                skyParameters.exposure = 0.008;
                skyUniforms['turbidity'].value = 15;
                skyUniforms['rayleigh'].value = 0.8;
                skyUniforms['mieCoefficient'].value = 0.01;
                skyUniforms['mieDirectionalG'].value = 0.35;
            } else { // CLEAR
                skyParameters.elevation = -2.0;
                skyParameters.azimuth = 180;
                skyParameters.exposure = 0.012;
                skyUniforms['turbidity'].value = 10;
                skyUniforms['rayleigh'].value = 2.0;
                skyUniforms['mieCoefficient'].value = 0.005;
                skyUniforms['mieDirectionalG'].value = 0.4;
            }
            if (updateSun) updateSun();
        }

        if (this.raindrops) {
            this.raindrops.clearDrops();

            if (type === 0) { // STORM
                this.raindrops.options.raining = true;
                this.raindrops.options.minR = 4;
                this.raindrops.options.maxR = 18;
                this.raindrops.options.rainChance = 0.08;
                this.raindrops.options.rainLimit = 2;
                this.raindrops.options.dropletsRate = 15;
                this.raindrops.options.dropletsSize = [1.5, 4.0];
                this.raindrops.options.trailRate = 0.4;
                this.raindrops.options.trailScaleRange = [0.15, 0.3];
                this.raindrops.options.spawnArea = [-0.1, 1.0];
            } else if (type === 1) { // DRIZZLE
                this.raindrops.options.raining = true;
                this.raindrops.options.minR = 3;
                this.raindrops.options.maxR = 12;
                this.raindrops.options.rainChance = 0.04;
                this.raindrops.options.rainLimit = 1;
                this.raindrops.options.dropletsRate = 8;
                this.raindrops.options.dropletsSize = [1.0, 3.0];
                this.raindrops.options.trailRate = 0.2;
                this.raindrops.options.trailScaleRange = [0.15, 0.3];
                this.raindrops.options.spawnArea = [-0.1, 1.0];
            } else { // CLEAR
                this.raindrops.options.raining = false;
            }
        }
    }

    update(dt, cameraMode = 0, camera = null) {
        this.clockTime += dt;
        const carPos = this.vehicle.mesh.position;
        const speed = Math.abs(this.vehicle.speed);
        const speedRatio = Math.min(speed / 70.0, 1.8);

        // Dynamic Environmental Ambient Wind Oscillations (shifting gusts)
        const windIntensity = this.weatherType === 0 ? 0.85 : (this.weatherType === 1 ? 0.45 : 0.15);
        const targetWindX = Math.sin(this.clockTime * 0.18) * 0.75 * windIntensity;
        const targetWindY = Math.cos(this.clockTime * 0.25) * 0.35 * windIntensity;

        this.windVector.x = THREE.MathUtils.lerp(this.windVector.x, targetWindX, dt * 1.5);
        this.windVector.y = THREE.MathUtils.lerp(this.windVector.y, targetWindY, dt * 1.5);

        const isThirdPerson = cameraMode === 0;

        // Update Driveclub-style 3D camera-relative world rain volume
        this._update3DRainVolume(dt, camera);

        // Dynamic Speed & Wind Rain Physics Tuning for Screen-Space Pass (Cockpit Mode Only)
        if (this.raindrops) {
            this.raindrops.options.ambientWind = this.windVector;
            this.raindrops.options.windSpread = speedRatio > 0.04 ? (speedRatio * 3.5) : 0.0;

            if (isThirdPerson) {
                // In 3rd Person Chase Mode, Driveclub uses pure 3D Volumetric Rain with 0 screen clutter
                this.raindrops.options.raining = false;
                this.raindrops.clearDrops();
            } else if (this.weatherType === 0) { // STORM (Cockpit)
                this.raindrops.options.raining = true;
                this.raindrops.options.rainChance = 0.45 + speedRatio * 0.35;
                this.raindrops.options.dropletsRate = Math.max(10, 45 - speedRatio * 20);
                this.raindrops.options.dropFallMultiplier = 1.0 + speedRatio * 5.0;
                this.raindrops.options.globalTimeScale = 0.9 + speedRatio * 2.5;
                this.raindrops.options.spawnArea = [0.0, 1.0];
            } else if (this.weatherType === 1) { // DRIZZLE (Cockpit)
                this.raindrops.options.raining = true;
                this.raindrops.options.rainChance = 0.20 + speedRatio * 0.20;
                this.raindrops.options.dropletsRate = Math.max(5, 25 - speedRatio * 12);
                this.raindrops.options.dropFallMultiplier = 0.8 + speedRatio * 3.0;
                this.raindrops.options.globalTimeScale = 0.8 + speedRatio * 1.8;
                this.raindrops.options.spawnArea = [0.0, 1.0];
            } else {
                this.raindrops.options.raining = false;
            }
        }

        // Adjust shader uniforms for 3rd Person Camera Lens vs 1st Person Cockpit
        if (this.rainPass) {
            this.rainPass.uniforms.uDropBlurAmount.value = isThirdPerson ? 1.0 : 1.8;
            this.rainPass.uniforms.uRefractionDelta.value = isThirdPerson ? 0.015 : 0.035;
        }

        // Droplet G-Force Physics
        const targetGForceX = (this.vehicle.steerAngle || 0) * (speed / 30.0);
        const targetGForceY = (this.vehicle.speed > 0 ? 0.05 : -0.05) * (speed / 40.0);

        this.gForce.x = THREE.MathUtils.lerp(this.gForce.x, targetGForceX, dt * 6.0);
        this.gForce.y = THREE.MathUtils.lerp(this.gForce.y, targetGForceY, dt * 6.0);

        // Update Raindrops 2D Physics Canvas Texture
        if (this.raindrops && this.waterTexture) {
            this.raindrops.update(dt);
            this.waterTexture.needsUpdate = true;
        }

        // Update GLSL Shader Uniforms for Rain Refraction Pass
        this.rainPass.uniforms.uTime.value = this.clockTime;
        this.rainPass.uniforms.uSpeed.value = speed;
        this.rainPass.uniforms.uGForce.value.copy(this.gForce);
        this.rainPass.uniforms.uWindVector.value.copy(this.windVector);
        this.rainPass.uniforms.uWeatherType.value = this.weatherType;

        // Update cloud dome position & drifting texture with environmental wind
        if (this.cloudDome) {
            this.cloudDome.position.copy(carPos);
            if (this.cloudTex) {
                this.cloudTex.offset.x += dt * (0.005 + this.windVector.x * 0.012);
                this.cloudTex.offset.y += dt * (0.002 + this.windVector.y * 0.008);
            }
            if (this.cloudMat) {
                const baseEmissive = this.weatherType === 0 ? 0.3 : 0.6;
                this.cloudMat.emissiveIntensity = baseEmissive + this.lightningFlash * 2.5;
            }
        }

        // Update tire spray mist
        this._updateTireMist(dt, carPos, speed);

        // Update rain-sensing wiper physics (Cockpit mode only) & vehicle body wetness PBR
        this._updateWiperSystem(dt, cameraMode);
        this._updateVehicleWetness(dt);
    }

    _initWiperSystem() {
        this.wiperTimer = 0;
        this.wiperAngle = 0;
        this.wiperState = 'idle';
        this.wiperSpeed = 4.5;
    }

    _updateWiperSystem(dt, cameraMode = 0) {
        // Driveclub design: Wiper clearing arcs only exist in 1st-Person Cockpit View (cameraMode === 1)
        if (!this.raindrops || this.weatherType === 3 || cameraMode !== 1) return;

        // Rain-Sensing Auto Wipers Interval calculation
        const rainDensity = this.raindrops.options.dropletsRate || 40;
        const autoInterval = Math.max(0.6, 3.5 - (rainDensity * 0.05));

        this.wiperTimer += dt;
        if (this.wiperState === 'idle' && this.wiperTimer >= autoInterval) {
            this.wiperState = 'sweep_out';
            this.wiperTimer = 0;
        }

        const maxAngle = Math.PI * 0.42;
        if (this.wiperState === 'sweep_out') {
            this.wiperAngle += dt * this.wiperSpeed;
            if (this.wiperAngle >= maxAngle) {
                this.wiperAngle = maxAngle;
                this.wiperState = 'sweep_back';
            }
        } else if (this.wiperState === 'sweep_back') {
            this.wiperAngle -= dt * (this.wiperSpeed * 0.9);
            if (this.wiperAngle <= 0) {
                this.wiperAngle = 0;
                this.wiperState = 'idle';
                this.wiperTimer = 0;
            }
        }

        // Perform triangular swath wiper clearing when active
        if (this.wiperState !== 'idle') {
            const simW = this.raindrops.width / this.raindrops.scale;
            const simH = this.raindrops.height / this.raindrops.scale;

            const leftPivotX = simW * 0.30;
            const leftPivotY = simH * 1.15;

            const rightPivotX = simW * 0.70;
            const rightPivotY = simH * 1.15;

            const sweepStartAngle = -Math.PI * 0.5 - this.wiperAngle;
            const sweepEndAngle = sweepStartAngle + 0.15;

            this.raindrops.clearWiperArc(leftPivotX, leftPivotY, sweepStartAngle, sweepEndAngle, simH * 0.25, simH * 1.10);
            this.raindrops.clearWiperArc(rightPivotX, rightPivotY, sweepStartAngle, sweepEndAngle, simH * 0.25, simH * 1.10);
        }
    }

    _updateVehicleWetness(dt) {
        if (!this.vehicle || !this.vehicle.bodyMaterial) return;

        const isRaining = this.weatherType !== 3;
        const targetWetness = isRaining ? 1.0 : 0.0;
        this.wetness = THREE.MathUtils.lerp(this.wetness || 0.0, targetWetness, dt * (isRaining ? 0.3 : 0.1));

        const mat = this.vehicle.bodyMaterial;
        mat.roughness = THREE.MathUtils.lerp(0.25, 0.04, this.wetness);
        mat.clearcoat = THREE.MathUtils.lerp(0.70, 1.00, this.wetness);
        mat.clearcoatRoughness = THREE.MathUtils.lerp(0.15, 0.02, this.wetness);
    }

    _initVolumetricClouds() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#050712';
        ctx.fillRect(0, 0, 512, 512);

        // Soft cloud puff gradients
        for (let i = 0; i < 40; i++) {
            const cx = Math.random() * 512;
            const cy = Math.random() * 512;
            const cr = 60 + Math.random() * 120;
            const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, cr);
            grad.addColorStop(0, 'rgba(40, 50, 75, 0.45)');
            grad.addColorStop(0.5, 'rgba(20, 25, 40, 0.25)');
            grad.addColorStop(1, 'rgba(5, 7, 18, 0.0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, cr, 0, Math.PI * 2);
            ctx.fill();
        }

        const cloudTex = new THREE.CanvasTexture(canvas);
        cloudTex.wrapS = THREE.RepeatWrapping;
        cloudTex.wrapT = THREE.RepeatWrapping;
        cloudTex.repeat.set(4, 4);
        this.cloudTex = cloudTex;

        this.cloudMat = new THREE.MeshStandardMaterial({
            map: cloudTex,
            transparent: true,
            opacity: 0.65,
            emissive: 0x111528,
            emissiveIntensity: 0.5,
            side: THREE.BackSide,
            depthWrite: false,
        });

        const cloudGeo = new THREE.SphereGeometry(1800, 32, 16);
        this.cloudDome = new THREE.Mesh(cloudGeo, this.cloudMat);
        this.scene.add(this.cloudDome);
    }
}
