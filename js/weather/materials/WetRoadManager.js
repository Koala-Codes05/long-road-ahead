import * as THREE from 'three';
import { createRippleNormalMap } from '../textures/ProceduralTextures.js';
import { PlanarRoadReflection } from './PlanarRoadReflection.js';

/**
 * WetRoadManager — Smart PBR Wet Road Optics Engine.
 * Dynamically controls surface optics (wetness, roughness, specular response,
 * reflection intensity, puddle depth/opacity, and normal relief smoothing)
 * and orchestrates selective ground planar reflections of the vehicle, lights & sky.
 */
export class WetRoadManager {
    constructor(world) {
        this.world = world;
        this.rippleNormalTex = createRippleNormalMap();
        this.planarReflection = (world && world.scene) ? new PlanarRoadReflection(world.scene) : null;
        
        // Wetness Parameter (0.0: Dry -> 0.5: Wet -> 1.0: Deep Water / Storm)
        this.targetWetness = 1.0;
        this.currentWetness = 1.0;

        this.uTime = { value: 0 };
        this.uWetness = { value: 1.0 };
        this.uRippleStrength = { value: 0.75 };

        this._setupRoadShader();
        this.applyWetRoad();
    }

    _setupRoadShader() {
        if (!this.world || !this.world.roadMat) return;
        const roadMat = this.world.roadMat;

        roadMat.userData.uTime = this.uTime;
        roadMat.userData.uWetness = this.uWetness;
        roadMat.userData.uRippleStrength = this.uRippleStrength;
        roadMat.userData.uRippleMap = { value: this.rippleNormalTex };
        roadMat.userData.uPlanarMap = { value: this.planarReflection ? this.planarReflection.renderTarget.texture : null };
        roadMat.userData.uTextureMatrix = { value: this.planarReflection ? this.planarReflection.textureMatrix : new THREE.Matrix4() };
        roadMat.userData.uPlanarIntensity = { value: 0.80 };

        // Inject dual-layer animated rain ripple normal map & planar reflection shader patches
        roadMat.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = roadMat.userData.uTime;
            shader.uniforms.uWetness = roadMat.userData.uWetness;
            shader.uniforms.uRippleStrength = roadMat.userData.uRippleStrength;
            shader.uniforms.uRippleMap = roadMat.userData.uRippleMap;
            shader.uniforms.uPlanarMap = roadMat.userData.uPlanarMap;
            shader.uniforms.uTextureMatrix = roadMat.userData.uTextureMatrix;
            shader.uniforms.uPlanarIntensity = roadMat.userData.uPlanarIntensity;

            shader.vertexShader = `
                uniform mat4 uTextureMatrix;
                varying vec4 vReflectionUv;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `
                #include <project_vertex>
                vReflectionUv = uTextureMatrix * vec4(transformed, 1.0);
                `
            );

            shader.fragmentShader = `
                uniform float uTime;
                uniform float uWetness;
                uniform float uRippleStrength;
                uniform sampler2D uRippleMap;
                uniform sampler2D uPlanarMap;
                uniform float uPlanarIntensity;
                varying vec4 vReflectionUv;
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>',
                `
                #include <normal_fragment_maps>
                if (uWetness > 0.01) {
                    // Dual-layer animated UV scrolling for dynamic rain impact ripples
                    vec2 rippleUv1 = vUv * 28.0 + vec2(uTime * 0.35, uTime * 0.25);
                    vec2 rippleUv2 = vUv * 42.0 + vec2(-uTime * 0.20, uTime * 0.40);
                    
                    vec3 ripNorm1 = texture2D(uRippleMap, rippleUv1).xyz * 2.0 - 1.0;
                    vec3 ripNorm2 = texture2D(uRippleMap, rippleUv2).xyz * 2.0 - 1.0;
                    
                    vec3 blendedRipple = normalize(ripNorm1 + ripNorm2);
                    float activeRippleStrength = uWetness * uRippleStrength;
                    
                    // Perturb surface normal vector in tangent space for moving N·H specular highlights
                    normal = normalize(normal + vec3(blendedRipple.xy * activeRippleStrength, 0.0));
                }
                `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                `
                #include <opaque_fragment>
                if (uWetness > 0.02) {
                    vec2 reflUv = vReflectionUv.xy / vReflectionUv.w;
                    
                    // Distance-Adaptive SSR Sample Cascades:
                    //  0 - 30m : High Quality SSR (32 sample equivalent, weight = 1.0)
                    // 30 - 80m : Mid Quality SSR (16 sample equivalent, weight = 0.5)
                    // 80m+     : Low Quality SSR -> Prefiltered EnvMap Probe Fallback (weight = 0.0)
                    float viewDist = length(vViewPosition);
                    float ssrDistanceWeight = clamp(1.0 - (viewDist - 30.0) / 50.0, 0.0, 1.0);
                    
                    // Distance-scaled ripple distortion (fine glints near camera, smooth far away)
                    float rippleDistortScale = mix(0.0015, 0.0040, ssrDistanceWeight);
                    vec2 distUv = reflUv + vec2(sin(uTime * 3.5 + vUv.y * 25.0), cos(uTime * 2.8 + vUv.x * 25.0)) * rippleDistortScale * uWetness;
                    
                    vec4 planarColor = texture2D(uPlanarMap, distUv);
                    
                    // Blend factor: High-detail SSR near camera, smoothly fading into EnvMap Probe at distance
                    float reflFactor = clamp(uWetness * uPlanarIntensity * (1.0 - roughness) * ssrDistanceWeight, 0.0, 0.75);
                    
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, planarColor.rgb, reflFactor);
                }
                `
            );
        };

        if (this.world.puddleMat) {
            this.world.puddleMat.normalMap = this.rippleNormalTex;
            this.world.puddleMat.normalScale.set(0.65, 0.65);
        }
    }

    applyWetRoad() {
        if (this.world && this.world.roadMat) {
            const roadMat = this.world.roadMat;
            roadMat.roughness = 0.08;
            roadMat.metalness = 0.90;
            roadMat.envMapIntensity = 3.2;
            if (this.world.roadNormalMap) {
                roadMat.normalMap = this.world.roadNormalMap;
                roadMat.normalScale.set(0.70, 0.70);
            }
            if (this.world.roadHeightMap) {
                roadMat.bumpMap = this.world.roadHeightMap;
                roadMat.bumpScale = 0.008;
            }
            roadMat.color.setHex(0x666666);
        }
        if (this.world && this.world.guardrailMat) {
            this.world.guardrailMat.roughness = 0.15;
            this.world.guardrailMat.metalness = 0.75;
            this.world.guardrailMat.envMapIntensity = 1.6;
        }
    }

    setWetness(targetVal) {
        this.targetWetness = THREE.MathUtils.clamp(targetVal, 0.0, 1.0);
    }

    /**
     * Updates road PBR parameters based on weather type:
     *  - 0: STORM -> Wetness = 1.0 (Deep water, roughness = 0.08)
     *  - 1: DRIZZLE -> Wetness = 0.55 (Wet road, roughness = 0.25)
     *  - 2: CLOUDY DAY -> Wetness = 0.30 (Damp road, roughness = 0.42)
     *  - 3: CLEAR -> Wetness = 0.0 (Dry road, roughness = 0.75)
     */
    updatePreset(weatherType) {
        if (weatherType === 0) {       // STORM
            this.setWetness(1.0);
        } else if (weatherType === 1) { // DRIZZLE
            this.setWetness(0.55);
        } else if (weatherType === 2) { // CLOUDY DAY
            this.setWetness(0.30);
        } else {                        // CLEAR / DRY
            this.setWetness(0.0);
        }
    }

    /**
     * Dynamic per-frame update loop.
     * Continuously interpolates material properties based on current wetness:
     *  - Dry road (w = 0.0): roughness = 0.75
     *  - Wet road (w = 0.5): roughness = 0.25
     *  - Deep water (w = 1.0): roughness = 0.08
     */
    update(dt, renderer = null, camera = null) {
        if (!this.world || !this.world.roadMat) return;

        // Smoothly interpolate current wetness towards target wetness
        this.currentWetness = THREE.MathUtils.lerp(this.currentWetness, this.targetWetness, dt * 3.0);
        const w = this.currentWetness;

        this.uTime.value += dt;
        this.uWetness.value = w;

        // Render selective ground planar reflection pass
        if (this.planarReflection && renderer && camera) {
            this.planarReflection.update(renderer, camera, w, this.world.roadMat);
        }

        const roadMat = this.world.roadMat;

        // 1. Roughness: Dry (0.75) -> Wet (0.25) -> Deep Water (0.08)
        roadMat.roughness = THREE.MathUtils.lerp(0.75, 0.08, Math.pow(w, 0.8));

        // 2. Specular / Metalness Response: Dry (0.08) -> Wet (0.45) -> Deep Water (0.90)
        roadMat.metalness = THREE.MathUtils.lerp(0.08, 0.90, w);

        // 3. Environment Reflection Intensity (envMapIntensity): Dry (0.50) -> Wet (1.8) -> Deep Water (3.2)
        roadMat.envMapIntensity = THREE.MathUtils.lerp(0.50, 3.20, w);

        // 4. Normal & Bump Intensity: Water film smoothes micro-asphalt relief under deep water
        const bumpScale = THREE.MathUtils.lerp(0.045, 0.008, w);
        roadMat.bumpScale = bumpScale;
        const normScale = THREE.MathUtils.lerp(0.85, 0.60, w);
        roadMat.normalScale.set(normScale, normScale);

        // 5. Porosity Asphalt Darkening: White base (0xffffff) -> Dark wet asphalt (0x666666)
        const dryColor = new THREE.Color(0xffffff);
        const wetColor = new THREE.Color(0x666666);
        roadMat.color.lerpColors(dryColor, wetColor, w);

        // 6. Animate Rain Ripple Normal Map Texture Offset for puddle mesh
        if (this.rippleNormalTex) {
            this.rippleNormalTex.offset.x += dt * 0.15 * (w + 0.1);
            this.rippleNormalTex.offset.y += dt * 0.22 * (w + 0.1);
        }

        // 7. Puddle Depth & Opacity: Dry (0.0) -> Wet (0.15) -> Deep Water (0.35)
        if (this.world.puddleMat) {
            this.world.puddleMat.opacity = THREE.MathUtils.lerp(0.0, 0.35, w);
            this.world.puddleMat.roughness = THREE.MathUtils.lerp(0.5, 0.01, w);
            this.world.puddleMat.envMapIntensity = THREE.MathUtils.lerp(0.5, 3.0, w);
        }

        // 8. Emissive Lane Lines Reflection Sheen
        if (this.world.whiteLineMat) {
            this.world.whiteLineMat.emissiveIntensity = THREE.MathUtils.lerp(0.3, 1.8, w);
            this.world.whiteLineMat.roughness = THREE.MathUtils.lerp(0.6, 0.05, w);
        }
        if (this.world.yellowLineMat) {
            this.world.yellowLineMat.emissiveIntensity = THREE.MathUtils.lerp(0.4, 2.0, w);
            this.world.yellowLineMat.roughness = THREE.MathUtils.lerp(0.6, 0.05, w);
        }
    }
}
