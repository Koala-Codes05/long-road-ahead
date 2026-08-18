import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * RainShader — Clean GLSL Screen-Space Glass Refraction Shader using
 * Lucas Bebber's dynamic 2D physics water map (uWaterMap) from rauschermate/react-weather-effects.
 */
export const RainShader = {
    uniforms: {
        tDiffuse: { value: null },             // WebGL Scene frame
        uWaterMap: { value: new THREE.Texture() }, // Lucas Bebber dynamic 2D physics canvas
        uTime: { value: 0.0 },
        uSpeed: { value: 0.0 },
        uGForce: { value: new THREE.Vector2(0, 0) },
        uRefractionDelta: { value: 0.06 },
        uWeatherType: { value: 0 },
        uCameraMode: { value: 0 },             // 0: 3rd Person Chase, 1: Cockpit, 2: Bumper
        uLightningFlash: { value: 0.0 },
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
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec2 totalRefraction = vec2(0.0);
            float totalShine = 0.0;
            float totalAlpha = 0.0;

            // 1. Sample Lucas Bebber dynamic 2D canvas water map physics
            if (uWeatherType == 0 || uWeatherType == 1 || uWeatherType == 2) { // Storm, Drizzle, or Cloudy Day
                vec4 waterSample = texture2D(uWaterMap, uv);

                if (waterSample.a > 0.01) {
                    float speedFactor = smoothstep(0.0, 70.0, uSpeed);
                    float speedOpacity = mix(1.0, (uWeatherType == 2 ? 0.30 : 0.65), speedFactor);
                    float weatherOpacity = (uWeatherType == 1) ? 0.32 : (uWeatherType == 2 ? 0.20 : 0.45);

                    // Refined subtle opacity reduction for 3rd person camera
                    if (uCameraMode == 0) {
                        weatherOpacity *= (uWeatherType == 2 ? 0.45 : 0.60);
                    }

                    float dropOpacity = speedOpacity * weatherOpacity;
                    // Red & Green channels store normal vector, Blue stores depth/shine
                    vec2 norm = (waterSample.rg - vec2(0.5)) * 2.0;
                    norm.x += uGForce.x * 0.05; // Subtle lateral refraction tilt on cornering
                    totalRefraction += norm * waterSample.a * dropOpacity;
                    totalShine += waterSample.b * waterSample.a * dropOpacity;
                    totalAlpha = waterSample.a * dropOpacity;
                }
            }

            // 2. Apply glass lens refraction displacement
            vec2 finalUv = uv + totalRefraction * uRefractionDelta;
            finalUv = clamp(finalUv, vec2(0.001), vec2(0.999));

            vec4 sceneColor = texture2D(tDiffuse, finalUv);

            // 3. Apply subtle drop shine glints & light clear glass edge response
            if (totalAlpha > 0.01) {
                float sparkleNoise = fract(sin(dot(floor(uv * vec2(95.0, 53.0)), vec2(12.9898, 78.233))) * 43758.5453);
                float whiteSparkle = smoothstep(0.88, 0.99, totalShine) * step(0.90, sparkleNoise);
                vec3 wetTint = vec3(0.55, 0.70, 0.85) * totalShine * 0.12;
                vec3 brightGlint = vec3(0.95, 0.98, 1.0) * totalShine * whiteSparkle * 0.22;
                sceneColor.rgb += wetTint + brightGlint;
                // Soft clear glass attenuation instead of heavy opaque black rings
                sceneColor.rgb *= (1.0 - totalAlpha * 0.05);
            }

            // 4. Storm Lightning Flash effect
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
