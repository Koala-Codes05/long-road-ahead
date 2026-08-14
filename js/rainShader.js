import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * RainShader — GLSL Screen-Space Glass Refraction Shader ported directly
 * from rauschermate/react-weather-effects (water.frag & RainRenderer)
 * with multi-tap glass refraction blur.
 */
export const RainShader = {
    uniforms: {
        tDiffuse: { value: null },                  // Scene color texture
        uWaterMap: { value: new THREE.Texture() },  // Raindrops 2D canvas water map
        uTextureShine: { value: new THREE.Texture() }, // Drop specular shine texture
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uMinRefraction: { value: 0.2 },
        uRefractionDelta: { value: 1.5 },
        uBrightness: { value: 1.0 },
        uAlphaMultiply: { value: 12.0 },
        uAlphaSubtract: { value: 3.0 },
        uDropBlurAmount: { value: 0.2 },           // Tiny, subtle depth-of-field blur
        uLightningFlash: { value: 0.0 },
        uRenderShine: { value: false },
        uRenderShadow: { value: false },
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
        uniform float uAlphaMultiply;
        uniform float uAlphaSubtract;
        uniform float uDropBlurAmount;
        uniform float uLightningFlash;
        uniform bool uRenderShine;
        uniform bool uRenderShadow;
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

        vec2 pixel() {
            return vec2(1.0) / uResolution;
        }

        vec4 fgColor(vec2 uvOffset) {
            return texture2D(uWaterMap, vUv + uvOffset);
        }

        void main() {
            vec4 bg = texture2D(tDiffuse, vUv);

            // Apply storm lightning flash to background scene
            if (uLightningFlash > 0.001) {
                bg.rgb *= (1.0 + 0.5 * uLightningFlash);
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

            // Driveclub Target Setting: Balanced glass droplet opacity (0.28 - 0.42)
            float speedRatio = clamp(uSpeed / 60.0, 0.0, 1.2);
            float speedOpacityCap = mix(0.28, 0.42, speedRatio);
            float a = smoothstep(0.005, 0.45, cur.a) * speedOpacityCap;

            if (a < 0.001) {
                gl_FragColor = bg;
                return;
            }

            // Normal vector, g-force cornering & ambient environmental wind refraction adjustment
            vec2 refraction = (vec2(x, y) - 0.5) * 2.0;
            refraction.x += (uGForce.x * 0.08) + (uWindVector.x * 0.12);
            refraction.y += (uWindVector.y * 0.08);

            vec2 refractionPos = vUv + (pixel() * refraction * (uMinRefraction + (d * uRefractionDelta)));
            refractionPos = clamp(refractionPos, vec2(0.001), vec2(0.999));

            // Multi-tap bokeh depth-of-field blur kernel (9 high-quality taps, 1.0 total weight)
            vec2 pRad = pixel() * uDropBlurAmount * (1.0 + d * 0.8);
            vec4 tex = texture2D(tDiffuse, refractionPos) * 0.40;

            // Inner Ring
            tex += texture2D(tDiffuse, refractionPos + vec2(pRad.x, 0.0)) * 0.10;
            tex += texture2D(tDiffuse, refractionPos - vec2(pRad.x, 0.0)) * 0.10;
            tex += texture2D(tDiffuse, refractionPos + vec2(0.0, pRad.y)) * 0.10;
            tex += texture2D(tDiffuse, refractionPos - vec2(0.0, pRad.y)) * 0.10;

            // Outer Bokeh Ring
            vec2 pRad2 = pRad * 1.8;
            tex += texture2D(tDiffuse, refractionPos + pRad2 * 0.707) * 0.05;
            tex += texture2D(tDiffuse, refractionPos - pRad2 * 0.707) * 0.05;
            tex += texture2D(tDiffuse, refractionPos + vec2(pRad2.x, -pRad2.y) * 0.707) * 0.05;
            tex += texture2D(tDiffuse, refractionPos + vec2(-pRad2.x, pRad2.y) * 0.707) * 0.05;

            // Specular drop shine glints & 3D liquid highlight calculation
            if (uRenderShine) {
                float maxShine = 490.0;
                float minShine = maxShine * 0.18;
                vec2 shinePos = vec2(0.5) + ((1.0 / 512.0) * refraction) * -(minShine + ((maxShine - minShine) * d));
                shinePos = clamp(shinePos, vec2(0.001), vec2(0.999));
                vec4 shine = texture2D(uTextureShine, shinePos);
                tex = blend(tex, shine * 0.7);
            }

            // 3D Liquid Specular Refraction & Rim Highlight from environment
            vec3 N = normalize(vec3(refraction * 0.7, sqrt(max(0.01, 1.0 - dot(refraction * 0.7, refraction * 0.7)))));
            vec3 L = normalize(vec3(-0.35, 0.65, 0.68));
            vec3 V = vec3(0.0, 0.0, 1.0);
            vec3 H = normalize(L + V);

            // Rim & specular highlight glints (tiny bright directional edge)
            float rim = pow(1.0 - max(0.0, dot(N, V)), 3.0);
            float specHighlight = pow(max(0.0, dot(N, H)), 24.0) * (0.5 + d * 1.5);
            vec3 lightGlint = vec3(0.90, 0.96, 1.0) * (specHighlight + rim * 0.25 * d);

            // Refracted scene light transmission
            vec3 refractedScene = tex.rgb * uBrightness * (1.0 + 0.5 * uLightningFlash);
            vec3 dropColor = refractedScene + lightGlint;

            // Pure physical refraction blend over background scene
            gl_FragColor = vec4(mix(bg.rgb, dropColor, a), bg.a);
        }

    `,
};

export function createRainPass() {
    return new ShaderPass(RainShader);
}


