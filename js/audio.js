/**
 * AudioEngine — Web Audio API Procedural Sound Synthesizer
 * Zero-dependency audio engine providing realistic engine revs mapped to RPM/gears,
 * turbo nitro spool whistle, and rain cabin ambiance using browser Web Audio synthesis.
 */
export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.initialized = false;

        // Engine Oscillators & Filter Nodes
        this.engineOsc1 = null;
        this.engineOsc2 = null;
        this.engineSub = null;
        this.engineGain = null;
        this.engineFilter = null;

        // Turbo / Nitro Spool
        this.turboOsc = null;
        this.turboGain = null;

        // Rain Cabin Ambiance
        this.rainNoise = null;
        this.rainFilter = null;
        this.rainGain = null;
    }

    init() {
        if (this.initialized) return;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        this.ctx = new AudioCtx();

        // Master Gain Node
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.4;
        this.masterGain.connect(this.ctx.destination);

        // 1. Procedural Engine Sound (Dual Sawtooth + Sub-Square)
        this.engineOsc1 = this.ctx.createOscillator();
        this.engineOsc2 = this.ctx.createOscillator();
        this.engineSub = this.ctx.createOscillator();

        this.engineOsc1.type = 'sawtooth';
        this.engineOsc2.type = 'sawtooth';
        this.engineSub.type = 'square';

        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 400;

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.0;

        this.engineOsc1.connect(this.engineFilter);
        this.engineOsc2.connect(this.engineFilter);
        this.engineSub.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.masterGain);

        this.engineOsc1.start();
        this.engineOsc2.start();
        this.engineSub.start();

        // 2. Turbo / Nitro Whistle (High-Frequency Sine Wave)
        this.turboOsc = this.ctx.createOscillator();
        this.turboOsc.type = 'sine';
        this.turboGain = this.ctx.createGain();
        this.turboGain.gain.value = 0.0;
        this.turboOsc.connect(this.turboGain);
        this.turboGain.connect(this.masterGain);
        this.turboOsc.start();

        // 3. Rain Ambiance (Filtered White Noise)
        this.rainNoise = this._createNoiseNode();
        this.rainFilter = this.ctx.createBiquadFilter();
        this.rainFilter.type = 'bandpass';
        this.rainFilter.frequency.value = 1200;
        this.rainFilter.Q.value = 0.8;
        this.rainGain = this.ctx.createGain();
        this.rainGain.gain.value = 0.0;

        this.rainNoise.connect(this.rainFilter);
        this.rainFilter.connect(this.rainGain);
        this.rainGain.connect(this.masterGain);

        this.initialized = true;
    }

    _createNoiseNode() {
        const bufferSize = 2 * this.ctx.sampleRate;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = buffer;
        whiteNoise.loop = true;
        whiteNoise.start();
        return whiteNoise;
    }

    update(vehicle, isRain = true) {
        if (!this.initialized) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const rpm = vehicle.getRpm ? vehicle.getRpm() : 0.2;
        const speedKmh = vehicle.getSpeedKmh ? vehicle.getSpeedKmh() : 0;
        const isNitro = vehicle.isNitro || false;

        const now = this.ctx.currentTime;

        // Base Engine Pitch mapped to RPM (60Hz idle up to 380Hz redline)
        const baseFreq = 60 + rpm * 320;

        this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.03);
        this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.03);
        this.engineSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.03);

        // Lowpass filter cutoff opens up as RPM increases
        this.engineFilter.frequency.setTargetAtTime(300 + rpm * 2800, now, 0.03);

        // Engine Volume
        const targetEngineGain = speedKmh > 0.5 ? 0.25 + rpm * 0.2 : 0.08;
        this.engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.05);

        // Turbo / Nitro Spool Sound
        if (isNitro) {
            this.turboOsc.frequency.setTargetAtTime(1400 + rpm * 1200, now, 0.05);
            this.turboGain.gain.setTargetAtTime(0.18, now, 0.05);
        } else {
            this.turboGain.gain.setTargetAtTime(0.0, now, 0.1);
        }

        // Rain Cabin Ambiance Sound
        if (isRain) {
            this.rainGain.gain.setTargetAtTime(0.12, now, 0.1);
        } else {
            this.rainGain.gain.setTargetAtTime(0.0, now, 0.1);
        }
    }
}