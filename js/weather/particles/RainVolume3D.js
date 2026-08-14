import * as THREE from 'three';
import { createRainDropAlphaTexture, createRainDropNormalTexture } from '../textures/ProceduralTextures.js';

/**
 * RainVolume3D — High-Fidelity Driveclub-style 3D Camera-Relative Rain Volume
 * Features instanced stretched quad particles, soft Gaussian profiles, spherical normal maps,
 * dynamic vehicle headlight cones, and streetlight specular glints (N·H).
 */
export class RainVolume3D {
    constructor(scene, rainLighting) {
        this.scene = scene;
        this.rainLighting = rainLighting;

        this.rainDropAlphaTex = createRainDropAlphaTexture();
        this.rainDropNormalTex = createRainDropNormalTexture();

        // Layer 1: Near High-Detail Instanced Rain Needles (~3,000 drops)
        this.nearCount = 3000;
        this.nearLayer = this._createRainInstancedMesh(this.nearCount, 0.005, 2.20);
        this.nearLayer.frustumCulled = false;

        // Layer 2: Mid-Range Instanced Rain Needles (~7,000 drops)
        this.midCount = 7000;
        this.midLayer = this._createRainInstancedMesh(this.midCount, 0.003, 1.60);
        this.midLayer.frustumCulled = false;

        this.scene.add(this.nearLayer);
        this.scene.add(this.midLayer);

        this.prevCamPos = new THREE.Vector3();
        this.cameraVel = new THREE.Vector3();
    }

    _createRainInstancedMesh(count, baseWidth, baseLength) {
        const quadGeo = new THREE.PlaneGeometry(1, 1);

        const instGeo = new THREE.InstancedBufferGeometry();
        instGeo.index = quadGeo.index;
        instGeo.attributes = quadGeo.attributes;

        const posAttr = new Float32Array(count * 3);
        const velAttr = new Float32Array(count * 3);
        const scaleAttr = new Float32Array(count * 2);
        const seedAttr = new Float32Array(count);

        const boxW = 48, boxH = 26, boxD = 48;

        for (let i = 0; i < count; i++) {
            posAttr[i * 3] = (Math.random() - 0.5) * boxW;
            posAttr[i * 3 + 1] = (Math.random() - 0.5) * boxH;
            posAttr[i * 3 + 2] = (Math.random() - 0.5) * boxD;

            velAttr[i * 3] = (Math.random() - 0.5) * 2.0;
            velAttr[i * 3 + 1] = -50.0 - Math.random() * 20.0; // Fast realistic rain terminal velocity (50-70 m/s)
            velAttr[i * 3 + 2] = (Math.random() - 0.5) * 2.0;

            scaleAttr[i * 2] = baseWidth * (0.85 + Math.random() * 0.35);
            scaleAttr[i * 2 + 1] = baseLength * (0.80 + Math.random() * 0.60);

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
                uCameraMode: { value: 0 },
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
                varying float vDistCam;

                void main() {
                    vUv = uv;

                    float camSpeed = length(uCameraVel);
                    float speedFactor = clamp(camSpeed / 35.0, 0.0, 2.0);

                    vec3 worldParticleVel = instanceVelocity + vec3(uWindVector.x * 22.0, 0.0, uWindVector.y * 22.0);
                    vec3 relVel = worldParticleVel - uCameraVel * 1.25;
                    float relSpeed = length(relVel);

                    vec3 boxSize = vec3(48.0, 26.0, 48.0);
                    vec3 pLocal = instancePosition + relVel * uTime * 0.35;
                    pLocal.x = mod(pLocal.x + boxSize.x * 0.5, boxSize.x) - boxSize.x * 0.5;
                    pLocal.y = mod(pLocal.y + boxSize.y * 0.5, boxSize.y) - boxSize.y * 0.5;
                    pLocal.z = mod(pLocal.z + boxSize.z * 0.5, boxSize.z) - boxSize.z * 0.5;

                    // Aerodynamic Curvature Offset: Curves smoothly from top to inward bottom at high speed
                    float distCamSq = dot(pLocal, pLocal);
                    float normDist = sqrt(distCamSq) / 28.0;
                    
                    // Downward curve arc pulling particles from top (y > 0) towards bottom (y < 0) as they approach camera
                    float topToBottomArc = speedFactor * 3.5 * max(0.0, 1.0 - normDist) * (smoothstep(-5.0, 12.0, pLocal.y));

                    vec3 curvedLocal = pLocal;
                    curvedLocal.y -= topToBottomArc;

                    vec3 pWorldHead = uCameraPos + curvedLocal;
                    
                    // Tangent trajectory vector for curved streak direction
                    vec3 curveVel = relVel + vec3(0.0, -topToBottomArc * 3.0, 0.0);
                    vec3 streakDirWorld = normalize(mix(relVel, curveVel, speedFactor * 0.65));

                    // True 3D streak length in world space - stretches into needle streaks with speed
                    float tailLength = (0.080 + min(relSpeed, 120.0) * 0.006) * instanceScale.y * 2.2;
                    vec3 pWorldTail = pWorldHead - streakDirWorld * min(tailLength * relSpeed, 18.0);

                    vWorldPos = pWorldHead;
                    vViewDir = normalize(uCameraPos - pWorldHead);
                    vDistCam = length(uCameraPos - pWorldHead);

                    vec4 headClip = projectionMatrix * viewMatrix * vec4(pWorldHead, 1.0);
                    vec4 tailClip = projectionMatrix * viewMatrix * vec4(pWorldTail, 1.0);

                    vec2 headNdc = headClip.xy / max(0.001, headClip.w);
                    vec2 tailNdc = tailClip.xy / max(0.001, tailClip.w);

                    vec2 streakDir = headNdc - tailNdc;
                    float streakLen = length(streakDir);
                    if (streakLen < 0.0001) {
                        streakDir = vec2(0.0, -0.01);
                    } else {
                        streakDir /= streakLen;
                    }
                    vec2 streakNormal = vec2(-streakDir.y, streakDir.x);

                    float widthNdc = instanceScale.x * 0.008 / max(0.25, headClip.w * 0.06);

                    // Vertex interpolation between tail and head in NDC
                    vec2 ndcPos = mix(tailNdc, headNdc, uv.y) + streakNormal * ((uv.x - 0.5) * widthNdc);
                    gl_Position = vec4(ndcPos * headClip.w, headClip.z, headClip.w);
                }
            `,
            fragmentShader: `
                uniform sampler2D uAlphaTex;
                uniform sampler2D uNormalTex;
                uniform float uRainIntensity;
                uniform int uCameraMode;
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
                varying float vDistCam;

                void main() {
                    if (uRainIntensity < 0.01) discard;
                    
                    // Razor-sharp motion-blurred rain streak profile along full length
                    float edgeX = 1.0 - abs(vUv.x - 0.5) * 2.0;
                    float coreX = pow(max(0.0, edgeX), 2.5);
                    float coreY = smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
                    float mask = coreX * coreY;
                    if (mask < 0.005) discard;
                    
                    vec3 nMap = texture2D(uNormalTex, vUv).xyz * 2.0 - 1.0;
                    vec3 N = normalize(nMap);
                    vec3 V = normalize(vViewDir);
                    
                    vec3 ambient = vec3(0.72, 0.82, 0.95);
                    vec3 totalLight = ambient * 0.60;
                    float totalSpecular = 0.0;
                    
                    // Vehicle Headlight Spot Cone Illumination
                    vec3 toHead = uHeadlightPos - vWorldPos;
                    float distHead = length(toHead);
                    vec3 L_head = toHead / max(distHead, 0.001);
                    float coneCos = dot(normalize(-uHeadlightDir), L_head);
                    float coneSpot = smoothstep(0.60, 0.96, coneCos);
                    float headAtten = coneSpot / (1.0 + 0.03 * distHead + 0.003 * distHead * distHead);
                    
                    if (headAtten > 0.001) {
                        totalLight += uHeadlightColor * headAtten * 3.2;
                        vec3 H = normalize(L_head + V);
                        totalSpecular += pow(max(dot(N, H), 0.0), 16.0) * headAtten * 6.0;
                    }
                    
                    // Streetlight Illumination with Specular Glints
                    for (int i = 0; i < 6; i++) {
                        if (i >= uStreetlightCount) break;
                        vec3 toLight = uStreetlightPos[i] - vWorldPos;
                        float d = length(toLight);
                        vec3 L_street = toLight / max(d, 0.001);
                        float atten = 1.0 / (1.0 + 0.08 * d + 0.015 * d * d);
                        if (atten > 0.005) {
                            vec3 streetCol = clamp(uStreetlightColor[i], vec3(0.0), vec3(1.0));
                            totalLight += streetCol * atten * 1.8;
                            vec3 H = normalize(L_street + V);
                            totalSpecular += pow(max(dot(N, H), 0.0), 16.0) * atten * 3.5;
                        }
                    }
                    
                    // Tight near-camera eye fade (prevents clipping directly into camera lens while rain falls dense all over the car)
                    float minNearDist = 0.3;
                    float maxNearDist = 0.8;
                    float nearFade = smoothstep(minNearDist, maxNearDist, vDistCam);
                    if (nearFade < 0.005) discard;

                    float farFade = 1.0 - smoothstep(36.0, 48.0, vDistCam);
                    
                    float finalAlpha = mask * uRainIntensity * nearFade * farFade * (0.50 + headAtten * 0.50);
                    vec3 finalColor = (totalLight + vec3(totalSpecular * 1.8) + vec3(0.40, 0.50, 0.65)) * 1.6;
                    
                    gl_FragColor = vec4(finalColor, finalAlpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        return new THREE.Mesh(instGeo, mat);
    }

    update(dt, camera, clockTime, targetIntensity, windVector, cameraMode = 0) {
        if (!camera) return;

        if (this.prevCamPos.lengthSq() > 0.001) {
            const rawVel = new THREE.Vector3().subVectors(camera.position, this.prevCamPos).divideScalar(Math.max(dt, 0.0001));
            this.cameraVel.lerp(rawVel, Math.min(1.0, dt * 25.0));
        } else {
            this.cameraVel.set(0, 0, 0);
        }
        this.prevCamPos.copy(camera.position);

        [this.nearLayer, this.midLayer].forEach(layer => {
            if (!layer) return;
            const u = layer.material.uniforms;
            u.uTime.value = clockTime;
            u.uCameraPos.value.copy(camera.position);
            u.uCameraVel.value.copy(this.cameraVel);
            u.uWindVector.value.copy(windVector);
            u.uRainIntensity.value = THREE.MathUtils.lerp(u.uRainIntensity.value, targetIntensity, dt * 4.0);
            if (u.uCameraMode) u.uCameraMode.value = cameraMode;

            if (this.rainLighting) {
                u.uHeadlightPos.value.copy(this.rainLighting.headlightPos);
                u.uHeadlightDir.value.copy(this.rainLighting.headlightDir);
                u.uHeadlightColor.value.copy(this.rainLighting.headlightColor);

                u.uStreetlightCount.value = this.rainLighting.streetCount;
                for (let i = 0; i < this.rainLighting.streetCount; i++) {
                    u.uStreetlightPos.value[i].copy(this.rainLighting.streetPositions[i]);
                    u.uStreetlightColor.value[i].copy(this.rainLighting.streetColors[i]);
                }
            }
        });
    }
}
