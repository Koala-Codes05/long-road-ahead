import * as THREE from 'three';

/**
 * RoadImpactSplashes — Instanced Ground Rain Impact & Water Ripple Ring Particle Engine.
 * Simulates tiny bright splashes, small expanding water ripples, and temporary normal/specular
 * disturbances when raindrops strike the wet road surface.
 */
export class RoadImpactSplashes {
    constructor(scene) {
        this.scene = scene;
        this.maxSplashes = 1500; // 1,500 instanced impact particles

        // Create Procedural Radial Splash & Ripple Texture
        this.splashTex = this._createSplashTexture();

        // Build Instanced Quads
        this.mesh = this._createImpactInstancedMesh(this.maxSplashes);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);

        this.clockTime = 0;
    }

    _createSplashTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Center bright splash point
        const gradCenter = ctx.createRadialGradient(32, 32, 0, 32, 32, 10);
        gradCenter.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        gradCenter.addColorStop(0.4, 'rgba(210, 235, 255, 0.8)');
        gradCenter.addColorStop(1.0, 'rgba(160, 210, 255, 0.0)');
        ctx.fillStyle = gradCenter;
        ctx.fillRect(0, 0, 64, 64);

        // Water Ripple Ring
        ctx.beginPath();
        ctx.arc(32, 32, 22, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(180, 225, 255, 0.65)';
        ctx.lineWidth = 4;
        ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return tex;
    }

    _createImpactInstancedMesh(count) {
        const quadGeo = new THREE.PlaneGeometry(1, 1);
        // Rotate horizontal quad to lay flat on road plane (y = 0)
        quadGeo.rotateX(-Math.PI / 2);

        const instGeo = new THREE.InstancedBufferGeometry();
        instGeo.index = quadGeo.index;
        instGeo.attributes = quadGeo.attributes;

        const posAttr = new Float32Array(count * 3);
        const seedAttr = new Float32Array(count * 2);

        const boxW = 50, boxD = 50;

        for (let i = 0; i < count; i++) {
            posAttr[i * 3 + 0] = (Math.random() - 0.5) * boxW;
            posAttr[i * 3 + 1] = 0.03 + Math.random() * 0.02; // Road surface level y = 0.03m
            posAttr[i * 3 + 2] = (Math.random() - 0.5) * boxD;

            seedAttr[i * 2 + 0] = Math.random();               // Time offset seed
            seedAttr[i * 2 + 1] = 0.15 + Math.random() * 0.15; // Lifetime (0.15s - 0.30s)
        }

        instGeo.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(posAttr, 3));
        instGeo.setAttribute('instanceSeed', new THREE.InstancedBufferAttribute(seedAttr, 2));

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uCameraPos: { value: new THREE.Vector3() },
                uRainIntensity: { value: 1.0 },
                uMap: { value: this.splashTex },
            },
            vertexShader: `
                attribute vec3 instancePosition;
                attribute vec2 instanceSeed;

                uniform vec3 uCameraPos;
                uniform float uTime;
                uniform float uRainIntensity;

                varying vec2 vUv;
                varying float vProgress;
                varying float vDistCam;

                void main() {
                    vUv = uv;

                    float timeOffset = instanceSeed.x * 100.0;
                    float lifetime = instanceSeed.y;
                    float cycleTime = mod(uTime + timeOffset, lifetime);
                    vProgress = cycleTime / lifetime;

                    // Wrap instance positions around camera position (50m x 50m box)
                    vec3 boxSize = vec3(50.0, 0.0, 50.0);
                    vec3 relPos = instancePosition - uCameraPos;

                    relPos.x = mod(relPos.x + boxSize.x * 0.5, boxSize.x) - boxSize.x * 0.5;
                    relPos.z = mod(relPos.z + boxSize.z * 0.5, boxSize.z) - boxSize.z * 0.5;

                    vec3 worldPos = uCameraPos + relPos;
                    worldPos.y = instancePosition.y; // Keep anchored to road surface

                    vDistCam = length(uCameraPos - worldPos);

                    // Expanding ripple ring animation (0.15m -> 0.75m)
                    float currentSize = mix(0.15, 0.75, vProgress);
                    vec3 localPos = position * currentSize;

                    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos + localPos, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uMap;
                uniform float uRainIntensity;
                varying vec2 vUv;
                varying float vProgress;
                varying float vDistCam;

                void main() {
                    if (uRainIntensity < 0.01) discard;

                    vec4 tex = texture2D(uMap, vUv);
                    
                    // Fade near camera to prevent lens clipping & fade far away
                    float nearFade = smoothstep(0.4, 1.2, vDistCam);
                    float farFade = 1.0 - smoothstep(30.0, 42.0, vDistCam);
                    
                    // Lifetime pulse: Flash bright splash on impact (progress 0.0), expanding ripple ring fades out
                    float flash = exp(-vProgress * 6.0) * 1.5;
                    float rippleFade = (1.0 - vProgress);
                    
                    float alpha = (tex.a * rippleFade + flash * 0.6) * uRainIntensity * nearFade * farFade * 0.85;
                    if (alpha < 0.005) discard;

                    // Bright specular glint tint on impact splash
                    vec3 splashColor = mix(vec3(1.0, 1.0, 1.0), vec3(0.70, 0.88, 1.0), vProgress);
                    
                    gl_FragColor = vec4(splashColor * tex.rgb * 2.0, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        return new THREE.Mesh(instGeo, mat);
    }

    update(dt, camera, clockTime, rainIntensity) {
        if (!this.mesh || !camera) return;

        this.clockTime = clockTime;
        const u = this.mesh.material.uniforms;
        u.uTime.value = clockTime;
        u.uCameraPos.value.copy(camera.position);
        u.uRainIntensity.value = rainIntensity;
    }
}
