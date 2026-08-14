import * as THREE from 'three';

/**
 * FarRainPoints — Low-cost background atmospheric rain streak volume (~14,000 particles).
 * Rendered as velocity-aligned motion streaks (LineSegments) instead of static point drops.
 */
export class FarRainPoints {
    constructor(scene) {
        this.scene = scene;
        this.farCount = 14000;
        this.mesh = this._createFarRainStreaks(this.farCount);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);

        this.prevCamPos = new THREE.Vector3();
        this.cameraVel = new THREE.Vector3();
    }

    _createFarRainStreaks(count) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 2 * 3); // 2 vertices per line streak
        const isTail = new Float32Array(count * 2);
        const boxW = 64, boxH = 36, boxD = 64;

        for (let i = 0; i < count; i++) {
            const px = (Math.random() - 0.5) * boxW;
            const py = (Math.random() - 0.5) * boxH;
            const pz = (Math.random() - 0.5) * boxD;

            // Head vertex (isTail = 0)
            positions[i * 6]     = px;
            positions[i * 6 + 1] = py;
            positions[i * 6 + 2] = pz;
            isTail[i * 2]        = 0.0;

            // Tail vertex (isTail = 1)
            positions[i * 6 + 3] = px;
            positions[i * 6 + 4] = py;
            positions[i * 6 + 5] = pz;
            isTail[i * 2 + 1]    = 1.0;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('isTail', new THREE.BufferAttribute(isTail, 1));

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uCameraPos: { value: new THREE.Vector3() },
                uCameraVel: { value: new THREE.Vector3() },
                uWindVector: { value: new THREE.Vector2() },
                uRainIntensity: { value: 1.0 },
                uCameraMode: { value: 0 },
            },
            vertexShader: `
                attribute float isTail;

                uniform vec3 uCameraPos;
                uniform vec3 uCameraVel;
                uniform vec2 uWindVector;
                uniform float uTime;

                varying float vDistCam;
                varying float vIsTail;

                void main() {
                    vIsTail = isTail;

                    float camSpeed = length(uCameraVel);
                    float speedFactor = clamp(camSpeed / 35.0, 0.0, 2.0);

                    vec3 worldParticleVel = vec3(uWindVector.x * 22.0, -56.0, uWindVector.y * 22.0);
                    vec3 relVel = worldParticleVel - uCameraVel * 1.25;
                    float relSpeed = length(relVel);

                    vec3 pLocal = position + relVel * uTime * 0.35;
                    vec3 boxSize = vec3(64.0, 36.0, 64.0);

                    pLocal.x = mod(pLocal.x + boxSize.x * 0.5, boxSize.x) - boxSize.x * 0.5;
                    pLocal.y = mod(pLocal.y + boxSize.y * 0.5, boxSize.y) - boxSize.y * 0.5;
                    pLocal.z = mod(pLocal.z + boxSize.z * 0.5, boxSize.z) - boxSize.z * 0.5;

                    // Aerodynamic Curvature: Top to Inward Bottom
                    float distCamSq = dot(pLocal, pLocal);
                    float normDist = sqrt(distCamSq) / 36.0;
                    
                    float topToBottomArc = speedFactor * 4.0 * max(0.0, 1.0 - normDist) * (smoothstep(-6.0, 15.0, pLocal.y));

                    vec3 curvedLocal = pLocal;
                    curvedLocal.y -= topToBottomArc;

                    vec3 curveVel = relVel + vec3(0.0, -topToBottomArc * 3.0, 0.0);
                    vec3 velDir = normalize(mix(relVel, curveVel, speedFactor * 0.65));

                    float streakLen = 0.40 + min(relSpeed, 120.0) * 0.015;
                    vec3 pWorld = uCameraPos + curvedLocal - velDir * (streakLen * isTail);

                    vDistCam = length(uCameraPos - pWorld);
                    gl_Position = projectionMatrix * viewMatrix * vec4(pWorld, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uRainIntensity;
                uniform int uCameraMode;
                varying float vDistCam;
                varying float vIsTail;

                void main() {
                    if (uRainIntensity < 0.01) discard;

                    float minNearDist = 0.3;
                    float maxNearDist = 0.8;
                    float nearFade = smoothstep(minNearDist, maxNearDist, vDistCam);
                    if (nearFade < 0.005) discard;

                    float tailAlpha = 1.0 - vIsTail * 0.60;
                    float finalAlpha = 0.28 * uRainIntensity * nearFade * tailAlpha;

                    gl_FragColor = vec4(0.72, 0.82, 0.95, finalAlpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        return new THREE.LineSegments(geo, mat);
    }

    update(dt, camera, clockTime, targetIntensity, windVector, cameraMode = 0) {
        if (!this.mesh || !camera) return;

        if (this.prevCamPos.lengthSq() > 0.001) {
            const rawVel = new THREE.Vector3().subVectors(camera.position, this.prevCamPos).divideScalar(Math.max(dt, 0.0001));
            this.cameraVel.lerp(rawVel, Math.min(1.0, dt * 25.0));
        } else {
            this.cameraVel.set(0, 0, 0);
        }
        this.prevCamPos.copy(camera.position);

        const u = this.mesh.material.uniforms;
        u.uTime.value = clockTime;
        u.uCameraPos.value.copy(camera.position);
        u.uCameraVel.value.copy(this.cameraVel);
        u.uWindVector.value.copy(windVector);
        u.uRainIntensity.value = THREE.MathUtils.lerp(u.uRainIntensity.value, targetIntensity, dt * 4.0);
        if (u.uCameraMode) u.uCameraMode.value = cameraMode;
    }
}

