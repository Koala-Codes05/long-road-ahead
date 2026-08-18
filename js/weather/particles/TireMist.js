import * as THREE from 'three';
import { getRoadPoint } from '../../world.js';

/* ----------------------------------------------------
   ZERO-GC VECTOR3 POOL & MATH HELPERS
---------------------------------------------------- */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _wheelPos = new THREE.Vector3();
const _forwardDir = new THREE.Vector3();
const _outwardDir = new THREE.Vector3();
const _rightVec = new THREE.Vector3();

/* ----------------------------------------------------
   PROCEDURAL TEXTURE CREATORS (CACHED ONCE)
---------------------------------------------------- */
let _cachedSprayTex = null;
function getWetSprayParticleTexture() {
    if (_cachedSprayTex) return _cachedSprayTex;
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 15);
    grad.addColorStop(0.0, 'rgba(240, 248, 255, 1.0)');
    grad.addColorStop(0.35, 'rgba(200, 230, 255, 0.65)');
    grad.addColorStop(0.70, 'rgba(160, 205, 250, 0.20)');
    grad.addColorStop(1.0, 'rgba(120, 180, 240, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    _cachedSprayTex = new THREE.CanvasTexture(canvas);
    _cachedSprayTex.minFilter = THREE.LinearFilter;
    _cachedSprayTex.magFilter = THREE.LinearFilter;
    return _cachedSprayTex;
}

let _cachedSmokeTex = null;
function getSmokeParticleTexture() {
    if (_cachedSmokeTex) return _cachedSmokeTex;
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0.0, 'rgba(240, 245, 252, 0.90)');
    grad.addColorStop(0.3, 'rgba(215, 225, 238, 0.55)');
    grad.addColorStop(0.65, 'rgba(180, 195, 215, 0.18)');
    grad.addColorStop(1.0, 'rgba(120, 140, 165, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    _cachedSmokeTex = new THREE.CanvasTexture(canvas);
    _cachedSmokeTex.minFilter = THREE.LinearFilter;
    _cachedSmokeTex.magFilter = THREE.LinearFilter;
    return _cachedSmokeTex;
}

let _cachedTrackTex = null;
function getWetTireTrackTexture() {
    if (_cachedTrackTex) return _cachedTrackTex;
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 32, 0);
    grad.addColorStop(0.0, 'rgba(10, 14, 22, 0.0)');
    grad.addColorStop(0.18, 'rgba(10, 14, 22, 0.95)');
    grad.addColorStop(0.82, 'rgba(10, 14, 22, 0.95)');
    grad.addColorStop(1.0, 'rgba(10, 14, 22, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 64);

    ctx.fillStyle = 'rgba(4, 6, 10, 0.65)';
    ctx.fillRect(6, 0, 3, 64);
    ctx.fillRect(13, 0, 3, 64);
    ctx.fillRect(19, 0, 3, 64);
    ctx.fillRect(24, 0, 3, 64);

    _cachedTrackTex = new THREE.CanvasTexture(canvas);
    _cachedTrackTex.wrapS = THREE.ClampToEdgeWrapping;
    _cachedTrackTex.wrapT = THREE.RepeatWrapping;
    _cachedTrackTex.minFilter = THREE.LinearFilter;
    _cachedTrackTex.magFilter = THREE.LinearFilter;
    return _cachedTrackTex;
}

/* ----------------------------------------------------
   1. WET TIRE TRACKS SUB-SYSTEM (ZERO-GC RING BUFFER)
---------------------------------------------------- */
class TrackPoint {
    constructor() {
        this.pos = new THREE.Vector3();
        this.rightVec = new THREE.Vector3();
        this.width = 0.3;
        this.opacity = 0;
        this.age = 0;
        this.maxAge = 4.0;
    }
}

class WetTireTracks {
    constructor(scene) {
        this.scene = scene;
        this.maxPointsPerWheel = 50; // 50 points = 49 quads (Ultra-lightweight & smooth)
        this.trackTex = getWetTireTrackTexture();

        this.wheelsData = [];
        this.meshes = [];

        this.trackMat = new THREE.ShaderMaterial({
            uniforms: { uMap: { value: this.trackTex } },
            vertexShader: `
                attribute float aAlpha;
                attribute float aAgeRatio;
                varying vec2 vUv;
                varying float vAlpha;
                varying float vAgeRatio;

                void main() {
                    vUv = uv;
                    vAlpha = aAlpha;
                    vAgeRatio = aAgeRatio;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D uMap;
                varying vec2 vUv;
                varying float vAlpha;
                varying float vAgeRatio;

                void main() {
                    vec4 tex = texture2D(uMap, vUv);
                    float edgeMask = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
                    float ageFade = pow(clamp(1.0 - vAgeRatio, 0.0, 1.0), 1.6);
                    float alpha = vAlpha * tex.a * edgeMask * ageFade * 0.75;
                    if (alpha < 0.005) discard;
                    gl_FragColor = vec4(vec3(0.04, 0.06, 0.09), alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -1.5,
            polygonOffsetUnits: -4.0,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending,
        });

        for (let w = 0; w < 4; w++) {
            const geo = this._createRibbonGeo();
            const mesh = new THREE.Mesh(geo, this.trackMat);
            mesh.frustumCulled = false;
            mesh.renderOrder = 15;
            this.scene.add(mesh);
            this.meshes.push(mesh);

            // Preallocate fixed TrackPoint array
            const pool = [];
            for (let i = 0; i < this.maxPointsPerWheel; i++) {
                pool.push(new TrackPoint());
            }

            this.wheelsData.push({
                pool,
                activeCount: 0,
                geo,
                lastPos: new THREE.Vector3(99999, 99999, 99999),
            });
        }
    }

    _createRibbonGeo() {
        const geo = new THREE.BufferGeometry();
        const maxVerts = this.maxPointsPerWheel * 2;
        const maxIndices = (this.maxPointsPerWheel - 1) * 6;

        const positions = new Float32Array(maxVerts * 3);
        const uvs = new Float32Array(maxVerts * 2);
        const alphas = new Float32Array(maxVerts);
        const ageRatios = new Float32Array(maxVerts);
        const indices = new Uint16Array(maxIndices);

        for (let i = 0; i < this.maxPointsPerWheel - 1; i++) {
            const r1 = i * 2;
            const r2 = (i + 1) * 2;
            indices[i * 6 + 0] = r1;
            indices[i * 6 + 1] = r1 + 1;
            indices[i * 6 + 2] = r2;
            indices[i * 6 + 3] = r2;
            indices[i * 6 + 4] = r1 + 1;
            indices[i * 6 + 5] = r2 + 1;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
        geo.setAttribute('aAgeRatio', new THREE.BufferAttribute(ageRatios, 1));
        geo.setIndex(new THREE.BufferAttribute(indices, 1));
        geo.setDrawRange(0, 0);
        return geo;
    }

    update(dt, wheelStates, wetness, speedKmh) {
        for (let w = 0; w < 4; w++) {
            const wData = this.wheelsData[w];
            const state = wheelStates[w];

            if (wetness >= 0.02 && speedKmh >= 0.5 && state) {
                const distSq = state.pos.distanceToSquared(wData.lastPos);
                if (distSq >= 0.0625) { // ~0.25m spacing
                    wData.lastPos.copy(state.pos);

                    // Push new point into ring pool (shift pool right)
                    const pool = wData.pool;
                    const lastPt = pool[this.maxPointsPerWheel - 1];
                    for (let i = this.maxPointsPerWheel - 1; i > 0; i--) {
                        pool[i] = pool[i - 1];
                    }
                    pool[0] = lastPt;

                    const speedFactor = Math.min(speedKmh / 60.0, 1.2);
                    lastPt.pos.copy(state.pos);
                    lastPt.rightVec.copy(state.rightVec);
                    lastPt.width = state.width;
                    lastPt.opacity = Math.min(0.42 + speedFactor * 0.48, 0.92) * wetness;
                    lastPt.age = 0.0;
                    lastPt.maxAge = 3.5 + wetness * 2.5;

                    if (wData.activeCount < this.maxPointsPerWheel) {
                        wData.activeCount++;
                    }
                }
            }

            this._updateWheelGeo(w, dt);
        }
    }

    _updateWheelGeo(w, dt) {
        const wData = this.wheelsData[w];
        const pool = wData.pool;

        // Age points & compute active range
        let validCount = 0;
        for (let i = 0; i < wData.activeCount; i++) {
            const pt = pool[i];
            pt.age += dt;
            if (pt.age < pt.maxAge) {
                validCount = i + 1;
            }
        }
        wData.activeCount = validCount;

        if (validCount < 2) {
            wData.geo.setDrawRange(0, 0);
            return;
        }

        const posArr = wData.geo.attributes.position.array;
        const uvArr = wData.geo.attributes.uv.array;
        const alphaArr = wData.geo.attributes.aAlpha.array;
        const ageRatioArr = wData.geo.attributes.aAgeRatio.array;

        let accumDist = 0;

        for (let i = 0; i < validCount; i++) {
            const pt = pool[i];
            const halfW = pt.width * 0.5;

            if (i > 0) {
                accumDist += pt.pos.distanceTo(pool[i - 1].pos);
            }

            const lx = pt.pos.x - pt.rightVec.x * halfW;
            const ly = pt.pos.y;
            const lz = pt.pos.z - pt.rightVec.z * halfW;

            const rx = pt.pos.x + pt.rightVec.x * halfW;
            const ry = pt.pos.y;
            const rz = pt.pos.z + pt.rightVec.z * halfW;

            const idx6 = i * 6;
            posArr[idx6 + 0] = lx; posArr[idx6 + 1] = ly; posArr[idx6 + 2] = lz;
            posArr[idx6 + 3] = rx; posArr[idx6 + 4] = ry; posArr[idx6 + 5] = rz;

            const idx4 = i * 4;
            const vUv = accumDist * 0.8;
            uvArr[idx4 + 0] = 0.0; uvArr[idx4 + 1] = vUv;
            uvArr[idx4 + 2] = 1.0; uvArr[idx4 + 3] = vUv;

            const idx2 = i * 2;
            const ageRatio = pt.age / pt.maxAge;
            alphaArr[idx2 + 0] = pt.opacity;
            alphaArr[idx2 + 1] = pt.opacity;

            ageRatioArr[idx2 + 0] = ageRatio;
            ageRatioArr[idx2 + 1] = ageRatio;
        }

        wData.geo.attributes.position.needsUpdate = true;
        wData.geo.attributes.uv.needsUpdate = true;
        wData.geo.attributes.aAlpha.needsUpdate = true;
        wData.geo.attributes.aAgeRatio.needsUpdate = true;
        wData.geo.setDrawRange(0, (validCount - 1) * 6);
    }
}

/* ----------------------------------------------------
   2. WATER DISPLACEMENT SPRAY (ACTIVE-INDEX RECYCLING)
---------------------------------------------------- */
class WaterDisplacementSpray {
    constructor(scene) {
        this.scene = scene;
        this.maxParticles = 320; // Reduced from 1400 -> 320 (Instant 80% CPU speedup!)
        this.wetTex = getWetSprayParticleTexture();

        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxParticles * 3);
        const sizes = new Float32Array(this.maxParticles);
        const alphas = new Float32Array(this.maxParticles);

        for (let i = 0; i < this.maxParticles; i++) {
            positions[i * 3 + 1] = -100;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: this.wetTex },
                uColor: { value: new THREE.Color(0xdbe9ff) },
            },
            vertexShader: `
                attribute float size;
                attribute float alpha;
                varying float vAlpha;

                void main() {
                    vAlpha = alpha;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (180.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D uMap;
                uniform vec3 uColor;
                varying float vAlpha;

                void main() {
                    vec4 tex = texture2D(uMap, gl_PointCoord);
                    float a = tex.a * vAlpha;
                    if (a < 0.01) discard;
                    gl_FragColor = vec4(uColor * tex.rgb, a);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.mesh = new THREE.Points(geo, this.material);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);

        this.lifetimes = new Float32Array(this.maxParticles);
        this.maxLifetimes = new Float32Array(this.maxParticles);
        this.velocities = new Float32Array(this.maxParticles * 3);
        this.baseSizes = new Float32Array(this.maxParticles);

        // Active index list for O(Active) updates
        this.activeIndices = new Int32Array(this.maxParticles);
        this.activeCount = 0;
        this.nextFreeIdx = 0;
    }

    spawnSpray(wheelState, speedKmh, wetness, puddleFactor, count = 1) {
        const positions = this.mesh.geometry.attributes.position.array;
        const sizes = this.mesh.geometry.attributes.size.array;
        const alphas = this.mesh.geometry.attributes.alpha.array;

        const speedRatio = speedKmh / 60.0;
        const speedMps = speedKmh / 3.6;

        for (let c = 0; c < count; c++) {
            const idx = this.nextFreeIdx;
            this.nextFreeIdx = (this.nextFreeIdx + 1) % this.maxParticles;

            // Register in active indices if not already active
            let isAlreadyActive = false;
            for (let a = 0; a < this.activeCount; a++) {
                if (this.activeIndices[a] === idx) {
                    isAlreadyActive = true;
                    break;
                }
            }
            if (!isAlreadyActive && this.activeCount < this.maxParticles) {
                this.activeIndices[this.activeCount++] = idx;
            }

            this.lifetimes[idx] = 0.0;
            this.maxLifetimes[idx] = 0.22 + Math.random() * 0.35 + Math.min(speedRatio * 0.2, 0.3);

            const spreadRadius = 0.12 + Math.random() * 0.12;
            const pIdx = idx * 3;
            positions[pIdx + 0] = wheelState.pos.x + (Math.random() - 0.5) * spreadRadius;
            positions[pIdx + 1] = wheelState.pos.y + 0.05 + Math.random() * 0.06;
            positions[pIdx + 2] = wheelState.pos.z + (Math.random() - 0.5) * spreadRadius;

            const flingBackSpeed = (speedMps * (0.4 + Math.random() * 0.5) + 2.0 + Math.random() * 1.5);
            const flingOutSpeed = wheelState.sideSign * (1.0 + speedRatio * 2.2) * (0.7 + Math.random() * 0.5);
            const flingUpSpeed = 0.8 + speedRatio * 3.0 + Math.random() * 1.8;

            this.velocities[pIdx + 0] = wheelState.forwardDir.x * (-flingBackSpeed) + wheelState.outwardDir.x * flingOutSpeed;
            this.velocities[pIdx + 1] = flingUpSpeed;
            this.velocities[pIdx + 2] = wheelState.forwardDir.z * (-flingBackSpeed) + wheelState.outwardDir.z * flingOutSpeed;

            const bSize = (1.4 + Math.random() * 1.5) * (1.0 + Math.min(speedRatio * 0.7, 1.0));
            this.baseSizes[idx] = bSize;
            sizes[idx] = bSize;

            alphas[idx] = Math.min(0.5 + speedRatio * 0.4, 0.95) * wetness * puddleFactor;
        }
    }

    update(dt, windVector) {
        if (this.activeCount === 0) return;

        const positions = this.mesh.geometry.attributes.position.array;
        const sizes = this.mesh.geometry.attributes.size.array;
        const alphas = this.mesh.geometry.attributes.alpha.array;

        let needsPos = false, needsSize = false, needsAlpha = false;
        const drag = Math.pow(0.84, dt * 60);

        for (let a = this.activeCount - 1; a >= 0; a--) {
            const i = this.activeIndices[a];
            const idx3 = i * 3;

            this.lifetimes[i] += dt;
            const progress = this.lifetimes[i] / this.maxLifetimes[i];

            if (progress >= 1.0 || alphas[i] <= 0.001) {
                alphas[i] = 0.0;
                positions[idx3 + 1] = -100;

                // Swap & pop to remove from active array in O(1)
                this.activeIndices[a] = this.activeIndices[this.activeCount - 1];
                this.activeCount--;

                needsPos = true;
                needsAlpha = true;
            } else {
                this.velocities[idx3 + 1] -= 12.0 * dt;
                this.velocities[idx3 + 0] *= drag;
                this.velocities[idx3 + 2] *= drag;

                positions[idx3 + 0] += (this.velocities[idx3 + 0] + windVector.x * 2.0) * dt;
                positions[idx3 + 1] += this.velocities[idx3 + 1] * dt;
                positions[idx3 + 2] += (this.velocities[idx3 + 2] + windVector.y * 1.8) * dt;

                sizes[i] = this.baseSizes[i] * (1.0 + progress * 1.3);
                alphas[i] *= 0.98;

                if (positions[idx3 + 1] <= 0.03) {
                    positions[idx3 + 1] = 0.03;
                    this.velocities[idx3 + 1] = 0;
                    alphas[i] *= 0.85;
                }

                needsPos = true;
                needsSize = true;
                needsAlpha = true;
            }
        }

        if (needsPos) this.mesh.geometry.attributes.position.needsUpdate = true;
        if (needsSize) this.mesh.geometry.attributes.size.needsUpdate = true;
        if (needsAlpha) this.mesh.geometry.attributes.alpha.needsUpdate = true;
    }
}

/* ----------------------------------------------------
   3. WHEEL MIST PLUME (LIGHTWEIGHT VOLUMETRIC SPRAY CLOUD)
---------------------------------------------------- */
class WheelMistPlume {
    constructor(scene) {
        this.scene = scene;
        this.maxParticles = 240; // Reduced from 1000 -> 240
        this.smokeTex = getSmokeParticleTexture();

        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxParticles * 3);
        const sizes = new Float32Array(this.maxParticles);
        const alphas = new Float32Array(this.maxParticles);

        for (let i = 0; i < this.maxParticles; i++) {
            positions[i * 3 + 1] = -100;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: this.smokeTex },
                uColor: { value: new THREE.Color(0xcae2ff) },
            },
            vertexShader: `
                attribute float size;
                attribute float alpha;
                varying float vAlpha;

                void main() {
                    vAlpha = alpha;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (200.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D uMap;
                uniform vec3 uColor;
                varying float vAlpha;

                void main() {
                    vec4 tex = texture2D(uMap, gl_PointCoord);
                    float a = tex.a * vAlpha;
                    if (a < 0.005) discard;
                    gl_FragColor = vec4(uColor * tex.rgb, a);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.mesh = new THREE.Points(geo, this.material);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);

        this.lifetimes = new Float32Array(this.maxParticles);
        this.maxLifetimes = new Float32Array(this.maxParticles);
        this.velocities = new Float32Array(this.maxParticles * 3);
        this.baseSizes = new Float32Array(this.maxParticles);

        this.activeIndices = new Int32Array(this.maxParticles);
        this.activeCount = 0;
        this.nextFreeIdx = 0;
    }

    spawnMist(wheelState, speedKmh, wetness, count = 1) {
        const positions = this.mesh.geometry.attributes.position.array;
        const sizes = this.mesh.geometry.attributes.size.array;
        const alphas = this.mesh.geometry.attributes.alpha.array;

        const speedRatio = speedKmh / 60.0;
        const speedMps = speedKmh / 3.6;

        for (let c = 0; c < count; c++) {
            const idx = this.nextFreeIdx;
            this.nextFreeIdx = (this.nextFreeIdx + 1) % this.maxParticles;

            let isAlreadyActive = false;
            for (let a = 0; a < this.activeCount; a++) {
                if (this.activeIndices[a] === idx) {
                    isAlreadyActive = true;
                    break;
                }
            }
            if (!isAlreadyActive && this.activeCount < this.maxParticles) {
                this.activeIndices[this.activeCount++] = idx;
            }

            this.lifetimes[idx] = 0.0;
            this.maxLifetimes[idx] = 0.4 + Math.random() * 0.5 + Math.min(speedRatio * 0.3, 0.5);

            const pIdx = idx * 3;
            positions[pIdx + 0] = wheelState.pos.x + (Math.random() - 0.5) * 0.25;
            positions[pIdx + 1] = wheelState.pos.y + 0.12 + Math.random() * 0.2;
            positions[pIdx + 2] = wheelState.pos.z + (Math.random() - 0.5) * 0.25;

            const mistBackSpeed = (speedMps * 0.55 + 3.5) * (0.7 + Math.random() * 0.4);
            const mistOutSpeed = wheelState.sideSign * (0.7 + speedRatio * 1.3) * (0.6 + Math.random() * 0.6);
            const mistUpSpeed = 0.6 + Math.random() * 1.5;

            this.velocities[pIdx + 0] = wheelState.forwardDir.x * (-mistBackSpeed) + wheelState.outwardDir.x * mistOutSpeed;
            this.velocities[pIdx + 1] = mistUpSpeed;
            this.velocities[pIdx + 2] = wheelState.forwardDir.z * (-mistBackSpeed) + wheelState.outwardDir.z * mistOutSpeed;

            const bSize = (2.0 + Math.random() * 2.0) * (1.0 + Math.min(speedRatio * 0.5, 0.8));
            this.baseSizes[idx] = bSize;
            sizes[idx] = bSize;

            alphas[idx] = Math.min(0.16 + speedRatio * 0.3, 0.50) * wetness;
        }
    }

    update(dt, windVector, time) {
        if (this.activeCount === 0) return;

        const positions = this.mesh.geometry.attributes.position.array;
        const sizes = this.mesh.geometry.attributes.size.array;
        const alphas = this.mesh.geometry.attributes.alpha.array;

        let needsPos = false, needsSize = false, needsAlpha = false;
        const drag = Math.pow(0.88, dt * 60);

        for (let a = this.activeCount - 1; a >= 0; a--) {
            const i = this.activeIndices[a];
            const idx3 = i * 3;

            this.lifetimes[i] += dt;
            const progress = this.lifetimes[i] / this.maxLifetimes[i];

            if (progress >= 1.0 || alphas[i] <= 0.001) {
                alphas[i] = 0.0;
                positions[idx3 + 1] = -100;

                this.activeIndices[a] = this.activeIndices[this.activeCount - 1];
                this.activeCount--;

                needsPos = true;
                needsAlpha = true;
            } else {
                const turbulenceX = Math.sin(time * 4.0 + i) * 0.5;
                const turbulenceZ = Math.cos(time * 3.5 + i) * 0.5;

                this.velocities[idx3 + 0] *= drag;
                this.velocities[idx3 + 1] += 0.35 * dt;
                this.velocities[idx3 + 2] *= drag;

                positions[idx3 + 0] += (this.velocities[idx3 + 0] + turbulenceX + windVector.x * 1.8) * dt;
                positions[idx3 + 1] += this.velocities[idx3 + 1] * dt;
                positions[idx3 + 2] += (this.velocities[idx3 + 2] + turbulenceZ + windVector.y * 1.2) * dt;

                sizes[i] = this.baseSizes[i] * (1.0 + progress * 2.4);

                const fade = Math.sin(progress * Math.PI);
                alphas[i] = Math.min(alphas[i], fade * 0.42);

                needsPos = true;
                needsSize = true;
                needsAlpha = true;
            }
        }

        if (needsPos) this.mesh.geometry.attributes.position.needsUpdate = true;
        if (needsSize) this.mesh.geometry.attributes.size.needsUpdate = true;
        if (needsAlpha) this.mesh.geometry.attributes.alpha.needsUpdate = true;
    }
}

/* ----------------------------------------------------
   4. TIREMIST MAIN ORCHESTRATOR
---------------------------------------------------- */
export class TireMist {
    constructor(scene, vehicle, world = null) {
        this.scene = scene;
        this.vehicle = vehicle;
        this.world = world;
        this.time = 0;

        // Pre-allocated Wheel States array (ZERO GC)
        this.wheelStates = [
            { id: 0, name: 'FL', localX: -0.94, localZ: -1.35, isFront: true,  sideSign: -1, pos: new THREE.Vector3(), forwardDir: new THREE.Vector3(), outwardDir: new THREE.Vector3(), rightVec: new THREE.Vector3(), width: 0.30 },
            { id: 1, name: 'FR', localX:  0.94, localZ: -1.35, isFront: true,  sideSign:  1, pos: new THREE.Vector3(), forwardDir: new THREE.Vector3(), outwardDir: new THREE.Vector3(), rightVec: new THREE.Vector3(), width: 0.30 },
            { id: 2, name: 'RL', localX: -0.94, localZ:  1.35, isFront: false, sideSign: -1, pos: new THREE.Vector3(), forwardDir: new THREE.Vector3(), outwardDir: new THREE.Vector3(), rightVec: new THREE.Vector3(), width: 0.30 },
            { id: 3, name: 'RR', localX:  0.94, localZ:  1.35, isFront: false, sideSign:  1, pos: new THREE.Vector3(), forwardDir: new THREE.Vector3(), outwardDir: new THREE.Vector3(), rightVec: new THREE.Vector3(), width: 0.30 },
        ];

        // Subsystems
        this.wetTracks = new WetTireTracks(this.scene);
        this.waterSpray = new WaterDisplacementSpray(this.scene);
        this.mistPlume = new WheelMistPlume(this.scene);

        // Dry Weather Smoke Subsystem
        this._initDrySmokeTrail();
    }

    _initDrySmokeTrail() {
        this.smokeCount = 200;
        this.smokeTex = getSmokeParticleTexture();

        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.smokeCount * 3);
        const sizes = new Float32Array(this.smokeCount);
        const alphas = new Float32Array(this.smokeCount);

        for (let i = 0; i < this.smokeCount; i++) {
            positions[i * 3 + 1] = -100;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

        this.smokeMat = new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: this.smokeTex },
                uColor: { value: new THREE.Color(0xe0e6ed) },
            },
            vertexShader: `
                attribute float size;
                attribute float alpha;
                varying float vAlpha;

                void main() {
                    vAlpha = alpha;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (200.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D uMap;
                uniform vec3 uColor;
                varying float vAlpha;

                void main() {
                    vec4 tex = texture2D(uMap, gl_PointCoord);
                    float a = tex.a * vAlpha;
                    if (a < 0.005) discard;
                    gl_FragColor = vec4(uColor * tex.rgb, a);
                }
            `,
            transparent: true,
            blending: THREE.NormalBlending,
            depthWrite: false,
        });

        this.smokeMesh = new THREE.Points(geo, this.smokeMat);
        this.smokeMesh.frustumCulled = false;
        this.scene.add(this.smokeMesh);

        this.smokeLifetimes = new Float32Array(this.smokeCount);
        this.smokeMaxLifetimes = new Float32Array(this.smokeCount);
        this.smokeVelocities = new Float32Array(this.smokeCount * 3);
        this.smokeBaseSizes = new Float32Array(this.smokeCount);

        this.activeSmokeIndices = new Int32Array(this.smokeCount);
        this.activeSmokeCount = 0;
        this.nextSmokeIdx = 0;
    }

    _updateWheelStatesInPlace() {
        if (!this.vehicle || !this.vehicle.mesh) return;

        const carPos = this.vehicle.mesh.position;
        const heading = this.vehicle.heading || 0;
        const steer = this.vehicle.currentSteer || 0;

        const cosH = Math.cos(heading);
        const sinH = Math.sin(heading);

        for (let i = 0; i < 4; i++) {
            const w = this.wheelStates[i];

            w.pos.set(
                carPos.x + cosH * w.localX + sinH * w.localZ,
                carPos.y + 0.025,
                carPos.z - sinH * w.localX + cosH * w.localZ
            );

            const wheelAngle = heading + (w.isFront ? steer * 0.85 : 0);
            const cosW = Math.cos(wheelAngle);
            const sinW = Math.sin(wheelAngle);

            w.forwardDir.set(-sinW, 0, -cosW);
            w.outwardDir.set(cosW * w.sideSign, 0, -sinW * w.sideSign);
            w.rightVec.set(cosW, 0, -sinW);
        }
    }

    update(dt, weatherType, windVector) {
        this.time += dt;

        if (!this.vehicle || !this.vehicle.mesh) return;

        const speedKmh = this.vehicle.getSpeedKmh ? this.vehicle.getSpeedKmh() : Math.abs(this.vehicle.speed || 0) * 3.6;
        const isWet = (weatherType === 0 || weatherType === 1 || weatherType === 2); // Storm, Drizzle, Cloudy Day

        let wetness = 0.0;
        if (weatherType === 0) wetness = 1.0;        // STORM
        else if (weatherType === 1) wetness = 0.65;   // DRIZZLE
        else if (weatherType === 2) wetness = 0.85;   // CLOUDY DAY STORM

        this._updateWheelStatesInPlace();

        if (isWet) {
            const puddleFactor = 1.25; // Optimized constant puddle boost

            // 1. UPDATE WET TIRE TRACKS ON ROAD SURFACE
            this.wetTracks.update(dt, this.wheelStates, wetness, speedKmh);

            // 2. SPAWN & UPDATE WATER DISPLACEMENT SPRAY
            if (speedKmh > 3.0 && wetness > 0.05) {
                const countPerWheel = Math.random() < Math.min(speedKmh / 40.0, 1.8) * wetness ? 1 : 0;
                if (countPerWheel > 0) {
                    for (let w = 0; w < 4; w++) {
                        this.waterSpray.spawnSpray(this.wheelStates[w], speedKmh, wetness, puddleFactor, countPerWheel);
                    }
                }
            }
            this.waterSpray.update(dt, windVector);

            // 3. SPAWN & UPDATE WHEEL MIST PLUME
            if (speedKmh > 15.0 && wetness > 0.05) {
                const countPerWheel = Math.random() < Math.min(speedKmh / 50.0, 1.2) * wetness ? 1 : 0;
                if (countPerWheel > 0) {
                    for (let w = 0; w < 4; w++) {
                        this.mistPlume.spawnMist(this.wheelStates[w], speedKmh, wetness, countPerWheel);
                    }
                }
            }
            this.mistPlume.update(dt, windVector, this.time);

        } else {
            this.wetTracks.update(dt, this.wheelStates, 0.0, speedKmh);
            this.waterSpray.update(dt, windVector);
            this.mistPlume.update(dt, windVector, this.time);
            this._updateDrySmoke(dt, speedKmh, windVector);
        }
    }

    _updateDrySmoke(dt, speedKmh, windVector) {
        const isDrifting = this.vehicle.driftingSystem && this.vehicle.driftingSystem.isDrifting;
        const isNitro = !!this.vehicle.isNitro;

        if ((speedKmh > 8.0 || isDrifting) && (isDrifting || isNitro)) {
            const targetSmokeOp = isDrifting ? 0.60 : 0.25;

            [2, 3].forEach(wIdx => {
                const ws = this.wheelStates[wIdx];

                if (Math.random() < (isDrifting ? 0.6 : 0.2)) {
                    const idx = this.nextSmokeIdx;
                    this.nextSmokeIdx = (this.nextSmokeIdx + 1) % this.smokeCount;

                    let isAlreadyActive = false;
                    for (let a = 0; a < this.activeSmokeCount; a++) {
                        if (this.activeSmokeIndices[a] === idx) {
                            isAlreadyActive = true;
                            break;
                        }
                    }
                    if (!isAlreadyActive && this.activeSmokeCount < this.smokeCount) {
                        this.activeSmokeIndices[this.activeSmokeCount++] = idx;
                    }

                    this.smokeLifetimes[idx] = 0.0;
                    this.smokeMaxLifetimes[idx] = 0.5 + Math.random() * 0.5;

                    const positions = this.smokeMesh.geometry.attributes.position.array;
                    const sizes = this.smokeMesh.geometry.attributes.size.array;
                    const alphas = this.smokeMesh.geometry.attributes.alpha.array;

                    const pIdx = idx * 3;
                    positions[pIdx + 0] = ws.pos.x + (Math.random() - 0.5) * 0.25;
                    positions[pIdx + 1] = ws.pos.y + 0.10 + Math.random() * 0.15;
                    positions[pIdx + 2] = ws.pos.z + (Math.random() - 0.5) * 0.25;

                    const bSpeed = 2.5 + speedKmh * 0.04;
                    const oSpeed = ws.sideSign * (0.6 + Math.random() * 1.2);
                    const uSpeed = 0.8 + Math.random() * 1.5;

                    this.smokeVelocities[pIdx + 0] = ws.forwardDir.x * (-bSpeed) + ws.outwardDir.x * oSpeed;
                    this.smokeVelocities[pIdx + 1] = uSpeed;
                    this.smokeVelocities[pIdx + 2] = ws.forwardDir.z * (-bSpeed) + ws.outwardDir.z * oSpeed;

                    this.smokeBaseSizes[idx] = 2.0 + Math.random() * 2.0;
                    sizes[idx] = this.smokeBaseSizes[idx];
                    alphas[idx] = targetSmokeOp;
                }
            });
        }

        if (this.activeSmokeCount > 0) {
            const positions = this.smokeMesh.geometry.attributes.position.array;
            const sizes = this.smokeMesh.geometry.attributes.size.array;
            const alphas = this.smokeMesh.geometry.attributes.alpha.array;

            let needsPos = false, needsSize = false, needsAlpha = false;

            for (let a = this.activeSmokeCount - 1; a >= 0; a--) {
                const i = this.activeSmokeIndices[a];
                const idx3 = i * 3;
                this.smokeLifetimes[i] += dt;
                const progress = this.smokeLifetimes[i] / this.smokeMaxLifetimes[i];

                if (progress >= 1.0 || alphas[i] <= 0.001) {
                    alphas[i] = 0.0;
                    positions[idx3 + 1] = -100;
                    this.activeSmokeIndices[a] = this.activeSmokeIndices[this.activeSmokeCount - 1];
                    this.activeSmokeCount--;
                    needsPos = true; needsAlpha = true;
                } else {
                    positions[idx3 + 0] += (this.smokeVelocities[idx3 + 0] + windVector.x * 1.2) * dt;
                    positions[idx3 + 1] += this.smokeVelocities[idx3 + 1] * dt;
                    positions[idx3 + 2] += (this.smokeVelocities[idx3 + 2] + windVector.y * 0.8) * dt;

                    sizes[i] = this.smokeBaseSizes[i] * (1.0 + progress * 2.2);
                    alphas[i] *= 0.95;

                    this.smokeVelocities[idx3 + 0] *= Math.pow(0.88, dt * 60);
                    this.smokeVelocities[idx3 + 1] += 0.5 * dt;
                    this.smokeVelocities[idx3 + 2] *= Math.pow(0.88, dt * 60);

                    needsPos = true; needsSize = true; needsAlpha = true;
                }
            }

            if (needsPos) this.smokeMesh.geometry.attributes.position.needsUpdate = true;
            if (needsSize) this.smokeMesh.geometry.attributes.size.needsUpdate = true;
            if (needsAlpha) this.smokeMesh.geometry.attributes.alpha.needsUpdate = true;
        }
    }
}
