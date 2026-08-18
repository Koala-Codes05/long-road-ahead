import * as THREE from 'three';

/**
 * VolumetricAtmosphericFog — Dynamic Volumetric Height Fog & Light Scattering Engine.
 * Manages distance extinction, blue-gray ambient fog color presets, height-based ground mist quads,
 * and warm orange/red forward light scattering near the wet road surface.
 */
export class VolumetricAtmosphericFog {
    constructor(scene, vehicle) {
        this.scene = scene;
        this.vehicle = vehicle;
        
        this.currentFogColor = new THREE.Color(0x0a101d);
        this.targetFogColor = new THREE.Color(0x162232);
        this.currentDensity = 0.0055;
        this.targetDensity = 0.0125;

        // 1. Setup Ground Mist Billboard Volume (Froxel Height Fog)
        this.mistCount = 36;
        this.mistMesh = this._createGroundMistVolume();
        if (this.mistMesh) this.scene.add(this.mistMesh);

        // 2. Setup Road Light Scattering Glow Sprite (Warm Amber/Red Rear Scattering)
        this.scatterSprite = this._createRoadScatteringSprite();
        if (this.scatterSprite) this.scene.add(this.scatterSprite);
    }

    _createGroundMistVolume() {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.mistCount * 3);
        const sizes = new Float32Array(this.mistCount);
        const alphas = new Float32Array(this.mistCount);

        for (let i = 0; i < this.mistCount; i++) {
            positions[i * 3 + 0] = (Math.random() - 0.5) * 120.0;
            positions[i * 3 + 1] = 0.5 + Math.random() * 3.5; // Low height fog (0.5m to 4m above road)
            positions[i * 3 + 2] = (Math.random() - 0.5) * 120.0;
            sizes[i] = 18.0 + Math.random() * 22.0;
            alphas[i] = 0.0;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

        // Soft volumetric smoke texture
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
        grad.addColorStop(0.0, 'rgba(180, 205, 235, 0.45)');
        grad.addColorStop(0.4, 'rgba(140, 175, 215, 0.20)');
        grad.addColorStop(1.0, 'rgba(80, 110, 150, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        const mistTex = new THREE.CanvasTexture(canvas);

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: mistTex },
                uColor: { value: new THREE.Color(0x1e2c3d) }
            },
            vertexShader: `
                attribute float size;
                attribute float alpha;
                varying float vAlpha;
                void main() {
                    vAlpha = alpha;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (260.0 / -mvPosition.z);
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
            depthWrite: false
        });

        const points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        return points;
    }

    _createRoadScatteringSprite() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
        grad.addColorStop(0.0, 'rgba(255, 70, 20, 0.65)');  // Warm Red/Orange tail light scatter core
        grad.addColorStop(0.35, 'rgba(255, 120, 40, 0.30)');
        grad.addColorStop(0.70, 'rgba(200, 90, 30, 0.08)');
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({
            map: tex,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.0
        });

        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(9.5, 5.0, 1.0); // Road-level wide volumetric light scattering cloud
        return sprite;
    }

    updatePreset(weatherType) {
        if (weatherType === 0) {       // STORM
            this.targetFogColor.setHex(0x162232); // Moody slate blue-gray ambient fog
            this.targetDensity = 0.0125;           // Strong distance extinction
        } else if (weatherType === 1) { // DRIZZLE
            this.targetFogColor.setHex(0x203042); // Deep cool atmospheric gray
            this.targetDensity = 0.0078;
        } else if (weatherType === 2) { // CLOUDY DAY
            this.targetFogColor.setHex(0x324254);
            this.targetDensity = 0.0055;
        } else {                        // CLEAR
            this.targetFogColor.setHex(0x0a101d);
            this.targetDensity = 0.0040;
        }
    }

    update(dt, camera, weatherType, windVector) {
        if (!this.scene) return;

        // Smoothly interpolate Fog Color & Density
        this.currentFogColor.lerp(this.targetFogColor, dt * 2.5);
        this.currentDensity = THREE.MathUtils.lerp(this.currentDensity, this.targetDensity, dt * 2.5);

        if (this.scene.fog) {
            this.scene.fog.color.copy(this.currentFogColor);
            this.scene.fog.density = this.currentDensity;
        }

        // Update Ground Mist Position & Alpha
        if (this.mistMesh && camera) {
            const targetMistAlpha = weatherType === 0 ? 0.35 : (weatherType === 1 ? 0.20 : 0.0);
            
            const posAttr = this.mistMesh.geometry.attributes.position;
            const alphaAttr = this.mistMesh.geometry.attributes.alpha;
            const posArr = posAttr.array;
            const alphaArr = alphaAttr.array;

            const camPos = camera.position;

            for (let i = 0; i < this.mistCount; i++) {
                const idx3 = i * 3;
                
                // Wrap mist particles around camera in 120m box
                let dx = posArr[idx3 + 0] - camPos.x;
                let dz = posArr[idx3 + 2] - camPos.z;

                if (dx > 60.0) posArr[idx3 + 0] -= 120.0;
                else if (dx < -60.0) posArr[idx3 + 0] += 120.0;

                if (dz > 60.0) posArr[idx3 + 2] -= 120.0;
                else if (dz < -60.0) posArr[idx3 + 2] += 120.0;

                posArr[idx3 + 0] += windVector.x * 1.5 * dt;
                posArr[idx3 + 2] += windVector.y * 1.5 * dt;

                alphaArr[i] = THREE.MathUtils.lerp(alphaArr[i], targetMistAlpha, dt * 3.0);
            }

            posAttr.needsUpdate = true;
            alphaAttr.needsUpdate = true;
        }

        // Update Road Surface Light Scattering Sprite (Orange/Red Tail Light Scattering)
        if (this.scatterSprite && this.vehicle && this.vehicle.mesh) {
            const targetSpriteOp = weatherType === 0 ? 0.70 : (weatherType === 1 ? 0.40 : 0.0);
            
            const carPos = this.vehicle.mesh.position;
            this.scatterSprite.position.set(carPos.x, carPos.y + 0.60, carPos.z + 0.50);
            this.scatterSprite.material.opacity = THREE.MathUtils.lerp(this.scatterSprite.material.opacity, targetSpriteOp, dt * 3.0);
        }
    }
}
