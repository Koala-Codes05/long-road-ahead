import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * FilmGrainShader — Cinematic 35mm Analog Film Grain Pass.
 * Features luminance-weighted noise distribution, dynamic per-frame temporal seed,
 * and customizable grain intensity for a AAA filmic look.
 */
export const FilmGrainShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0.0 },
        uIntensity: { value: 0.055 }, // Balanced filmic grain strength
        uSpeedBoost: { value: 0.0 },  // Dynamic boost during high speed
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
        uniform float uTime;
        uniform float uIntensity;
        uniform float uSpeedBoost;
        varying vec2 vUv;

        // High-precision pseudo-random noise generator
        float rand(vec2 co) {
            return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);

            if (uIntensity <= 0.001) {
                gl_FragColor = color;
                return;
            }

            // Screen-space noise coordinate animated with dynamic time seed
            vec2 seedUv = vUv + vec2(sin(uTime * 17.0), cos(uTime * 23.0)) * 0.05;
            float noise = rand(seedUv * 800.0) - 0.5;

            // Luminance of current pixel (grain is more visible in midtones/shadows than bright blown-out speculars)
            float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            float lumWeight = smoothstep(0.98, 0.20, lum); // Attenuate in bright highlights

            // Calculate active grain strength with speed boost factor
            float effectiveIntensity = uIntensity + uSpeedBoost * 0.03;
            vec3 grain = vec3(noise) * effectiveIntensity * lumWeight;

            // Apply fine film grain to RGB color channels
            color.rgb += grain;

            gl_FragColor = color;
        }
    `
};

export function createFilmGrainPass() {
    return new ShaderPass(FilmGrainShader);
}
