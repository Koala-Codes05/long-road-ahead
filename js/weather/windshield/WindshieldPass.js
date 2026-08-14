import * as THREE from 'three';
import { createRainPass } from '../../rainShader.js';

/**
 * WindshieldPass — Manages the GLSL Screen-Space Glass Refraction Pass in EffectComposer,
 * window resize listeners, and uniform values.
 */
export class WindshieldPass {
    constructor(composer) {
        this.composer = composer;
        this.rainPass = createRainPass();
        this.rainPass.uniforms.uRenderShine.value = true;
        this.composer.addPass(this.rainPass);

        this._onResize = () => {
            if (this.rainPass) {
                this.rainPass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
            }
        };
        window.addEventListener('resize', this._onResize);
    }

    setWeatherType(type) {
        if (this.rainPass) {
            this.rainPass.uniforms.uWeatherType.value = type;
        }
    }

    updateUniforms(speed, gForce, windVector, time) {
        if (!this.rainPass) return;
        const u = this.rainPass.uniforms;
        if (u.uSpeed) u.uSpeed.value = speed;
        if (u.uGForce) u.uGForce.value.copy(gForce);
        if (u.uWindVector) u.uWindVector.value.copy(windVector);
        if (u.uTime) u.uTime.value = time;
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
    }
}
