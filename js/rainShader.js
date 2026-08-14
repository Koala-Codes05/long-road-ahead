import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * RainShader — AAA Driveclub Camera Lens & Windshield Water Refraction Shader.
 * Features:
 *  - 9-tap disc bokeh depth-of-field kernel for out-of-focus camera lens droplets
 *  - Chromatic dispersion / optical aberration on refracted scene rays
 *  - Dynamic liquid surface normals with G-force & aerodynamic wind distortion
 *  - 3D specular highlight glints (N·H) and Fresnel rim contrast
 *  - Lightning flash reactivity and variable lens wetness
 */
export const RainShader = {
    uniforms: {
        tDiffuse: { value: null },                  // Scene color texture
        uWaterMap: { value: new THREE.Texture() },  // Raindrops 2D canvas water map
        uTextureShine: { value: new THREE.Texture() }, // Specular shine texture
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uMinRefraction: { value: 0.008 },
        uRefractionDelta: { value: 0.032 },
        uBrightness: { value: 1.05 },
        uDropBlurAmount: { value: 0.025 },          // Bokeh micro blur
        uLightningFlash: { value: 0.0 },
        uRenderShine: { value: true },
        uWeatherType: { value: 0 },
        uGForce: { value: new THREE.Vector2(0, 0) },
        uWindVector: { value: new THREE.Vector2(0, 0) },
        uTime: { value: 0.0 },
        uSpeed: { value: 0.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        precision mediump float;

        uniform sampler2D tDiffuse;
        uniform sampler2D uWaterMap;
        uniform sampler2D uTextureShine;

        uniform vec2 uResolution;
        uniform float uMinRefraction;
        uniform float uRefractionDelta;
        uniform float uBrightness;
        uniform float uDropBlurAmount;
        uniform float uLightningFlash;
        uniform bool uRenderShine;
        uniform int uWeatherType;
        uniform vec2 uGForce;
        uniform vec2 uWindVector;
        uniform float uSpeed;

        varying vec2 vUv;

        // Alpha-blends two RGBA colors
        vec4 blend(vec4 bg, vec4 fg) {
            vec3 bgm = bg.rgb * bg.a;
            vec3 fgm = fg.rgb * fg.a;
            float ia = 1.0 - fg.a;
            float a = fg.a + bg.a * ia;
            vec3 rgb = (a != 0.0) ? (fgm + bgm * ia) / a : vec3(0.0);
            return vec4(rgb, a);
        }

        void main() {
            vec4 bg = texture2D(tDiffuse, vUv);

            // Apply storm lightning flash to background scene
            if (uLightningFlash > 0.001) {
                bg.rgb *= (1.0 + 0.65 * uLightningFlash);
            }

            // Clear / Sunny weather - no rain
            if (uWeatherType == 3) {
                gl_FragColor = bg;
                return;
            }

            vec4 cur = texture2D(uWaterMap, vUv);

            float d = cur.b; // Droplet depth / thickness
            float x = cur.g; // Normal X
            float y = cur.r; // Normal Y

            float speedRatio = clamp(uSpeed / 60.0, 0.0, 1.5);
            float speedOpacityCap = mix(0.85, 0.98, min(speedRatio, 1.0));
            float a = smoothstep(0.01, 0.28, cur.a) * speedOpacityCap;

            if (a < 0.001) {
                gl_FragColor = bg;
                return;
            }

            // Normal vector in [-1, 1] range
            vec2 norm = (vec2(x, y) - 0.5) * 2.0;
            norm.x += (uGForce.x * 0.04) + (uWindVector.x * 0.06);
            norm.y += (uWindVector.y * 0.04);

            // True physical UV refraction offset (bending scene optics)
            float refrStrength = uMinRefraction + (d * uRefractionDelta);
            vec2 refrOffset = norm * refrStrength;

            // Optical refraction position
            vec2 refractionPos = vUv - refrOffset;
            refractionPos = clamp(refractionPos, vec2(0.002), vec2(0.998));

            // Chromatic aberration dispersion on lens droplet edges
            vec2 chromaOffset = norm * (refrStrength * 0.35);
            vec2 refrR = clamp(refractionPos - chromaOffset, vec2(0.002), vec2(0.998));
            vec2 refrB = clamp(refractionPos + chromaOffset, vec2(0.002), vec2(0.998));

            // 9-Tap Circular Bokeh Disc Kernel for out-of-focus camera lens water droplets
            vec2 pixelUnit = 1.0 / uResolution;
            vec2 pRad = pixelUnit * (1.5 + uDropBlurAmount * 10.0);
            
            // Sample scene with chromatic dispersion + bokeh blur
            vec3 colSample = vec3(0.0);
            
            // Center sample with chromatic dispersion
            colSample.r += texture2D(tDiffuse, refrR).r * 0.28;
            colSample.g += texture2D(tDiffuse, refractionPos).g * 0.28;
            colSample.b += texture2D(tDiffuse, refrB).b * 0.28;

            // Ring of 8 Poisson/disc bokeh taps
            const float k0 = 0.70710678; // cos/sin(45 deg)
            colSample += texture2D(tDiffuse, refractionPos + vec2( pRad.x,  0.0)).rgb * 0.09;
            colSample += texture2D(tDiffuse, refractionPos + vec2(-pRad.x,  0.0)).rgb * 0.09;
            colSample += texture2D(tDiffuse, refractionPos + vec2( 0.0,  pRad.y)).rgb * 0.09;
            colSample += texture2D(tDiffuse, refractionPos + vec2( 0.0, -pRad.y)).rgb * 0.09;
            colSample += texture2D(tDiffuse, refractionPos + vec2( pRad.x * k0,  pRad.y * k0)).rgb * 0.09;
            colSample += texture2D(tDiffuse, refractionPos + vec2(-pRad.x * k0,  pRad.y * k0)).rgb * 0.09;
            colSample += texture2D(tDiffuse, refractionPos + vec2( pRad.x * k0, -pRad.y * k0)).rgb * 0.09;
            colSample += texture2D(tDiffuse, refractionPos + vec2(-pRad.x * k0, -pRad.y * k0)).rgb * 0.09;

            // Specular drop shine glints
            if (uRenderShine) {
                vec2 shinePos = vUv - refrOffset * 0.45;
                shinePos = clamp(shinePos, vec2(0.002), vec2(0.998));
                vec4 shine = texture2D(uTextureShine, shinePos);
                colSample = blend(vec4(colSample, 1.0), shine * 0.55).rgb;
            }

            // 3D Liquid Surface Normal & Specular Glints
            vec3 N = normalize(vec3(norm * 0.90, sqrt(max(0.02, 1.0 - dot(norm * 0.90, norm * 0.90)))));
            vec3 L1 = normalize(vec3(-0.30, 0.85, 0.45)); // Sky / ambient key light
            vec3 L2 = normalize(vec3( 0.40, 0.60, 0.70)); // Secondary fill light
            vec3 V = vec3(0.0, 0.0, 1.0);
            vec3 H1 = normalize(L1 + V);
            vec3 H2 = normalize(L2 + V);

            // Fresnel Rim Occlusion (deep dark meniscus border on droplet rim for rich 3D liquid definition)
            float NdotV = max(0.0, dot(N, V));
            float rimOcclusion = pow(1.0 - NdotV, 2.2);

            // Primary + Secondary specular highlights
            float spec1 = pow(max(0.0, dot(N, H1)), 36.0) * (0.9 + d * 2.5);
            float spec2 = pow(max(0.0, dot(N, H2)), 18.0) * (0.4 + d * 1.2);
            vec3 lightGlint = (vec3(0.92, 0.96, 1.0) * spec1 + vec3(0.80, 0.90, 1.0) * spec2) * (1.0 + uLightningFlash * 1.5);

            // Refracted scene light transmission with dark rim meniscus and specular highlight
            vec3 refractedScene = (colSample * uBrightness) * (1.0 - rimOcclusion * 0.40) + lightGlint;

            // Pure physical refraction blend over background scene
            gl_FragColor = vec4(mix(bg.rgb, refractedScene, a), bg.a);
        }
    `,
};

export function createRainPass() {
    return new ShaderPass(RainShader);
}



