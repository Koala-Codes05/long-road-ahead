import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * FisheyeShader — Tuned Nitro Energy Corner Fisheye Pass.
 * Progressive distortion curve:
 *  - Center: 2% - 5% (Clean & focused)
 *  - Mid-frame: 12% - 18%
 *  - Edges: 32% - 38%
 *  - Extreme Corners: 55% - 58%
 * Subtle chromatic separation for motion energy without RGB artifacts.
 */
export const FisheyeShader = {
    uniforms: {
        tDiffuse: { value: null },
        uStrength: { value: 0.0 }, // 0.0 = inactive, 1.0 = full nitro distortion
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
        uniform float uStrength;
        varying vec2 vUv;

        void main() {
            if (uStrength < 0.001) {
                gl_FragColor = texture2D(tDiffuse, vUv);
                return;
            }

            // Center UV coordinates to [-1, 1] range
            vec2 p = (vUv - 0.5) * 2.0;
            float r = length(p);

            // Normalized radius from center (0.0) to extreme corner (1.0 at r = sqrt(2))
            float normR = clamp(r / 1.41421356, 0.0, 1.0);

            // 4-Tier Progressive Distortion Curve:
            // Center ~2-5% | Mid-frame ~15% | Edges ~35% | Extreme corners ~58%
            float progressiveDistortion = mix(0.02, 0.58, pow(normR, 1.8));
            float distortion = progressiveDistortion * uStrength;

            // Smooth scale factor mapping for edge-to-edge full screen fill
            float scale = 1.0 - distortion * 0.42;
            vec2 pSample = p * scale;
            vec2 uv = clamp(pSample * 0.5 + 0.5, vec2(0.0001), vec2(0.9999));

            // Subtle chromatic separation (motion/energy feel, no heavy RGB artifacting)
            float ca = 0.0045 * uStrength * pow(normR, 2.2);
            vec2 pSampleR = p * (scale - ca);
            vec2 pSampleB = p * (scale + ca);

            vec2 uvR = clamp(pSampleR * 0.5 + 0.5, vec2(0.0001), vec2(0.9999));
            vec2 uvB = clamp(pSampleB * 0.5 + 0.5, vec2(0.0001), vec2(0.9999));

            float red = texture2D(tDiffuse, uvR).r;
            float green = texture2D(tDiffuse, uv).g;
            float blue = texture2D(tDiffuse, uvB).b;

            gl_FragColor = vec4(red, green, blue, 1.0);
        }
    `
};

export function createFisheyePass() {
    return new ShaderPass(FisheyeShader);
}
