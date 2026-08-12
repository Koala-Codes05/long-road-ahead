import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * MotionBlurShader — High-Speed Radial Speed & Velocity Motion Blur Pass.
 * Creates dynamic peripheral speed streaks during high speed driving and Nitro boosts.
 */
export const MotionBlurShader = {
    uniforms: {
        tDiffuse: { value: null },
        uStrength: { value: 0.0 },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
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
        uniform vec2 uCenter;
        varying vec2 vUv;

        void main() {
            if (uStrength < 0.005) {
                gl_FragColor = texture2D(tDiffuse, vUv);
                return;
            }

            vec2 dir = vUv - uCenter;
            float dist = length(dir);
            vec4 color = vec4(0.0);
            const int SAMPLES = 5;
            
            // Radial streak factor increases toward outer screen edges
            float factor = uStrength * smoothstep(0.12, 0.95, dist);

            for (int i = 0; i < SAMPLES; i++) {
                float scale = 1.0 - factor * (float(i) / float(SAMPLES - 1));
                vec2 sampleUv = uCenter + dir * scale;
                sampleUv = clamp(sampleUv, vec2(0.001), vec2(0.999));
                color += texture2D(tDiffuse, sampleUv);
            }

            gl_FragColor = color / float(SAMPLES);
        }
    `
};

export function createMotionBlurPass() {
    return new ShaderPass(MotionBlurShader);
}
