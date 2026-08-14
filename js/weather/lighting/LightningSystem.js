/**
 * LightningSystem — Controls storm lightning flash timers, random intervals,
 * and updates GLSL pass lightning uniforms.
 */
export class LightningSystem {
    constructor(rainPass) {
        this.rainPass = rainPass;
        this.lightningFlash = 0.0;
        this.lightningTimer = 0;
        this.lightningTimeoutId = null;
        this.lightningIntervalId = null;
        this.weatherType = 0;

        this.setupLightningFlicker();
    }

    setWeatherType(type) {
        this.weatherType = type;
        if (type !== 0) {
            this.lightningFlash = 0.0;
            if (this.rainPass && this.rainPass.uniforms.uLightningFlash) {
                this.rainPass.uniforms.uLightningFlash.value = 0.0;
            }
        }
    }

    setupLightningFlicker() {
        if (this.lightningIntervalId) clearInterval(this.lightningIntervalId);

        const scheduleFlicker = () => {
            if (this.weatherType === 0) { // Storm weather
                const flicker = 1.2 + Math.random() * 1.5;
                this.lightningFlash = flicker;
                if (this.rainPass && this.rainPass.uniforms.uLightningFlash) {
                    this.rainPass.uniforms.uLightningFlash.value = flicker;
                }

                this.lightningTimeoutId = setTimeout(() => {
                    this.lightningFlash = 0.0;
                    if (this.rainPass && this.rainPass.uniforms.uLightningFlash) {
                        this.rainPass.uniforms.uLightningFlash.value = 0.0;
                    }
                }, 100 + Math.random() * 220);
            } else {
                this.lightningFlash = 0.0;
                if (this.rainPass && this.rainPass.uniforms.uLightningFlash) {
                    this.rainPass.uniforms.uLightningFlash.value = 0.0;
                }
            }
        };

        this.lightningIntervalId = setInterval(scheduleFlicker, 2200 + Math.random() * 3200);
    }

    dispose() {
        if (this.lightningIntervalId) clearInterval(this.lightningIntervalId);
        if (this.lightningTimeoutId) clearTimeout(this.lightningTimeoutId);
    }
}
