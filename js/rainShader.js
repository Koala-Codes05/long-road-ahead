import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * RainShader — High-Clarity Screen-Space Glass Refraction & Droplet Shader using
 * Lucas Bebber's dynamic 2D physics water map (uWaterMap).
 */
export const RainShader = {
    uniforms: {
        tDiffuse: { value: null },
        uWaterMap: { value: new THREE.Texture() },
        uTime: { value: 0.0 },
        uSpeed: { value: 0.0 },
        uGForce: { value: new THREE.Vector2(0, 0) },
        uRefractionDelta: { value: 0.18 }, // Bold, vivid glass lens refraction
        uWeatherType: { value: 0 },
        uCameraMode: { value: 0 },
        uLightningFlash: { value: 0.0 },
        // Modular weather-engine knobs (WindshieldPass / WiperController)
        uResolution: { value: new THREE.Vector2(1, 1) },
        uWindVector: { value: new THREE.Vector2(0, 0) },
        uMinRefraction: { value: 0.002 },   // Soft gate: absorb micro-droplet noise
        uDropBlurAmount: { value: 0.005 },  // Extra small blur inside droplet area
        uTextureShine: { value: (() => { // valid 1×1 placeholder (avoids "no image data" warning)
            const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
            t.needsUpdate = true;
            return t;
        })() }, // Drop glint shine map
        uRenderShine: { value: false },     // Enable texture-driven glints
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D uWaterMap;
        uniform float uTime;
        uniform float uSpeed;
        uniform vec2 uGForce;
        uniform float uRefractionDelta;
        uniform int uWeatherType;
        uniform int uCameraMode;
        uniform float uLightningFlash;
        uniform vec2 uResolution;
        uniform vec2 uWindVector;
        uniform float uMinRefraction;
        uniform float uDropBlurAmount;
        uniform sampler2D uTextureShine;
        uniform bool uRenderShine;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec2 totalRefraction = vec2(0.0);
            float totalShine = 0.0;
            float totalAlpha = 0.0;

            // Sample Lucas Bebber dynamic 2D canvas water map physics
            if (uWeatherType == 0 || uWeatherType == 1 || uWeatherType == 2) {
                vec4 waterSample = texture2D(uWaterMap, uv);

                if (waterSample.a > 0.01) {
                    // Bold, clear droplet opacity across camera views
                    float dropOpacity = (uWeatherType == 0) ? 0.85 : ((uWeatherType == 1) ? 0.65 : 0.50);

                    // Red & Green channels store normal vector, Blue stores depth/shine
                    vec2 norm = (waterSample.rg - vec2(0.5)) * 2.0;
                    norm.x += uGForce.x * 0.08; // Lateral refraction response to cornering G-Force
                    norm += uWindVector * 0.04; // Storm wind smear

                    totalRefraction += norm * waterSample.a * dropOpacity;
                    totalShine += waterSample.b * waterSample.a * dropOpacity;
                    totalAlpha = waterSample.a * dropOpacity;
                }
            }

            // Soft threshold: kills sub-perceptual refraction noise
            totalRefraction *= smoothstep(uMinRefraction * 0.6, uMinRefraction * 2.5, length(totalRefraction));

            // Apply glass lens refraction displacement
            vec2 finalUv = uv + totalRefraction * uRefractionDelta;
            finalUv = clamp(finalUv, vec2(0.001), vec2(0.999));

            vec4 sceneColor = texture2D(tDiffuse, finalUv);

            // Cheap 4-tap blur inside droplet areas (cockpit view sells the glass depth)
            if (totalAlpha > 0.01 && uDropBlurAmount > 0.0005) {
                vec2 px = vec2(1.0) / max(uResolution, vec2(1.0));
                vec2 b = uDropBlurAmount * 60.0 * px;
                vec3 blurCol = sceneColor.rgb;
                blurCol += texture2D(tDiffuse, clamp(finalUv + vec2( b.x,  b.y), 0.001, 0.999)).rgb;
                blurCol += texture2D(tDiffuse, clamp(finalUv + vec2(-b.x,  b.y), 0.001, 0.999)).rgb;
                blurCol += texture2D(tDiffuse, clamp(finalUv + vec2( b.x, -b.y), 0.001, 0.999)).rgb;
                blurCol += texture2D(tDiffuse, clamp(finalUv + vec2(-b.x, -b.y), 0.001, 0.999)).rgb;
                sceneColor.rgb = mix(sceneColor.rgb, blurCol * 0.2, clamp(totalAlpha * 0.9, 0.0, 1.0));
            }

            // Apply vivid glass droplet rim glints & realistic refraction highlights
            if (totalAlpha > 0.01) {
                float dropEdge = smoothstep(0.10, 0.95, totalAlpha);
                vec3 rimGlint = vec3(0.90, 0.96, 1.0) * totalShine * dropEdge * 0.45;

                if (uRenderShine) {
                    vec3 shineTex = texture2D(uTextureShine, uv).rgb;
                    rimGlint *= (0.6 + shineTex * 1.4); // Photoreal sparkle map
                }

                // Clear glass refraction tint & highlights
                sceneColor.rgb = mix(sceneColor.rgb, sceneColor.rgb * 0.82 + rimGlint, totalAlpha * 0.70);
                sceneColor.rgb += rimGlint * 0.35;
            }

            // Storm Lightning Flash effect
            if (uLightningFlash > 0.01) {
                sceneColor.rgb += vec3(0.75, 0.85, 1.0) * uLightningFlash;
            }

            gl_FragColor = sceneColor;
        }
    `,
};

export function createRainPass() {
    return new ShaderPass(RainShader);
}
