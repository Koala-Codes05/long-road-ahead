import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * CinematicGradeShader — Cinematic Exposure, Highlight Compression, Shadow Lift & Color Grading Pass
 * 
 * 1. Exposure ↓ — Tones down global brightness and bottom road overexposure.
 * 2. Highlights ↓↓↓ — Non-linear highlight compression curve to recover asphalt & exhaust details.
 * 3. Shadows ↑ slightly — Lifts shadow floor so wet road & chassis details stay visible.
 * 4. Color Grade:
 *    - Shadows → slightly blue/cyan
 *    - Midtones → neutral/cool
 *    - Highlights → slightly warm
 *    - Saturation → moderate
 */
export function createCinematicGradePass() {
    const shader = {
        uniforms: {
            tDiffuse: { value: null },
            uExposure: { value: 0.88 },          // 1. Exposure ↓
            uHighlightCompress: { value: 0.70 }, // 2. Highlights ↓↓↓
            uShadowLift: { value: 0.035 },         // 3. Shadows ↑ slightly
            uSaturation: { value: 1.04 },          // 5. Saturation moderate
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
            uniform float uExposure;
            uniform float uHighlightCompress;
            uniform float uShadowLift;
            uniform float uSaturation;

            varying vec2 vUv;

            void main() {
                vec4 texColor = texture2D(tDiffuse, vUv);
                vec3 color = texColor.rgb;

                // 1. Exposure Control (Exposure ↓)
                color *= uExposure;

                // Calculate Luma (Rec. 709)
                float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

                // 2. Non-Linear Highlight Recovery (Highlights ↓↓↓)
                // Smoothly compresses blown-out specular highlights on road reflections & exhaust
                float highlightMask = smoothstep(0.40, 1.0, luma);
                vec3 compressedHighlights = color / (vec3(1.0) + color * uHighlightCompress * 1.25);
                color = mix(color, compressedHighlights, highlightMask * 0.82);

                // Recalculate Luma post-compression
                luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

                // 3. Shadow Floor Lift (Shadows ↑ slightly)
                // Prevents dark road & undercarriage from collapsing into solid black
                float shadowMask = 1.0 - smoothstep(0.0, 0.42, luma);
                color += vec3(uShadowLift) * shadowMask;

                // 5. Cinematic Split-Tone Color Grade:
                // - Shadows → slightly blue / cyan
                // - Midtones → neutral / cool
                // - Highlights → slightly warm
                vec3 shadowTint = vec3(0.0, 0.022, 0.040);   // Subtle blue/cyan shadow lift
                vec3 midtoneTint = vec3(0.97, 1.0, 1.02);   // Cool neutral midtone balance
                vec3 highlightTint = vec3(1.04, 1.01, 0.96); // Warm golden highlight sheen

                vec3 graded = color * midtoneTint;
                graded += shadowTint * shadowMask;
                graded = mix(graded, graded * highlightTint, highlightMask);

                // Saturation Adjustment (Moderate)
                float gradedLuma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
                graded = mix(vec3(gradedLuma), graded, uSaturation);

                gl_FragColor = vec4(max(vec3(0.0), graded), texColor.a);
            }
        `
    };

    return new ShaderPass(shader);
}
