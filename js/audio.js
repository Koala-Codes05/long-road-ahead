/**
 * AudioEngine — AAA Ferrari 458 Italia Web Audio Buffer Engine
 * Loads and plays real Ferrari 458 MP3 recording via Web Audio API AudioBuffer decoding.
 * Modulates playbackRate & lowpass filter in real time for 100% authentic, fluid, zero-stutter engine sound.
 */
export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.engineRunning = false;
        this.isStarting = false;

        // Web Audio Buffer Nodes for Real Ferrari Sound
        this.ferrariBuffer = null;
        this.ferrariSource = null;
        this.ferrariGain = null;
        this.ferrariFilter = null;
        this.isFerrariLoaded = false;
        this.isFerrariPlaying = false;

        // Turbo / Nitro Spool
        this.turboOsc = null;
        this.turboGain = null;

        // Rain Cabin Ambiance
        this.rainNoise = null;
        this.rainFilter = null;
        this.rainGain = null;

        this.lastGear = 1;
        this.gearShiftDrop = 0;
        this.smoothedRpm = 0.2;

        // Pre-fetch audio buffer
        this._preloadFerrariAudio();
    }

    async _preloadFerrariAudio() {
        const candidatePaths = [
            'assets/Sounds/ferrari/ferrari-458-italia-sound-effect-going-fast-360530.mp3',
            'assets/ferrari.mp3',
            'assets/ferrari.wav',
        ];

        for (const path of candidatePaths) {
            try {
                const response = await fetch(path);
                if (!response.ok) continue;
                this.rawArrayBuffer = await response.arrayBuffer();
                console.log(`🎵 Ferrari AudioBuffer preloaded from: ${path}`);
                break;
            } catch (err) {
                // Try next
            }
        }
    }

    async init() {
        if (this.initialized) {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            if (!this.engineRunning && !this.isStarting) {
                this.playEngineStart();
            }
            return;
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        this.ctx = new AudioCtx();

        // Master Gain Node
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.60;
        this.masterGain.connect(this.ctx.destination);

        // Ferrari Engine Nodes Setup
        this.ferrariGain = this.ctx.createGain();
        this.ferrariGain.gain.value = 0.0;

        this.ferrariFilter = this.ctx.createBiquadFilter();
        this.ferrariFilter.type = 'lowpass';
        this.ferrariFilter.frequency.value = 2500;

        this.ferrariGain.connect(this.ferrariFilter);
        this.ferrariFilter.connect(this.masterGain);

        // Decode preloaded AudioBuffer
        if (this.rawArrayBuffer) {
            try {
                this.ferrariBuffer = await this.ctx.decodeAudioData(this.rawArrayBuffer.slice(0));
                this.isFerrariLoaded = true;
                console.log('✅ Ferrari 458 AudioBuffer decoded successfully!');
            } catch (e) {
                console.warn('Could not decode Ferrari audio buffer:', e);
            }
        }

        // Turbo / Nitro Whistle Node
        this.turboOsc = this.ctx.createOscillator();
        this.turboOsc.type = 'sine';
        this.turboGain = this.ctx.createGain();
        this.turboGain.gain.value = 0.0;
        this.turboOsc.connect(this.turboGain);
        this.turboGain.connect(this.masterGain);
        this.turboOsc.start();

        // Rain Cabin Ambiance Noise Node
        this.rainNoise = this._createNoiseNode();
        this.rainFilter = this.ctx.createBiquadFilter();
        this.rainFilter.type = 'bandpass';
        this.rainFilter.frequency.value = 1400;
        this.rainFilter.Q.value = 0.7;
        this.rainGain = this.ctx.createGain();
        this.rainGain.gain.value = 0.0;

        this.rainNoise.connect(this.rainFilter);
        this.rainFilter.connect(this.rainGain);
        this.rainGain.connect(this.masterGain);

        this.initialized = true;

        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        this.playEngineStart();
    }

    _startFerrariLoop() {
        if (!this.ctx || !this.ferrariBuffer || this.isFerrariPlaying) return;

        try {
            this.ferrariSource = this.ctx.createBufferSource();
            this.ferrariSource.buffer = this.ferrariBuffer;
            this.ferrariSource.loop = true;
            this.ferrariSource.playbackRate.value = 0.62;
            this.ferrariSource.connect(this.ferrariGain);
            this.ferrariSource.start(0);
            this.isFerrariPlaying = true;
        } catch (e) {
            console.warn('Failed to start Ferrari audio loop:', e);
        }
    }

    playEngineStart() {
        if (!this.initialized || !this.ctx) return;
        if (this.isStarting || this.engineRunning) return;
        this.isStarting = true;

        const now = this.ctx.currentTime;

        // Starter Motor Cranking (chk-chk-chk)
        const crankOsc = this.ctx.createOscillator();
        const crankGain = this.ctx.createGain();
        crankOsc.type = 'sawtooth';
        crankOsc.frequency.setValueAtTime(24, now);
        crankOsc.frequency.linearRampToValueAtTime(36, now + 0.50);

        crankGain.gain.setValueAtTime(0.25, now);
        crankGain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);

        crankOsc.connect(crankGain);
        crankGain.connect(this.masterGain);

        crankOsc.start(now);
        crankOsc.stop(now + 0.55);

        // Ferrari Ignition Rev Burst
        setTimeout(() => {
            if (!this.ctx) return;

            if (this.isFerrariLoaded && !this.isFerrariPlaying) {
                this._startFerrariLoop();
            }

            if (this.ferrariSource && this.ferrariGain) {
                const burstTime = this.ctx.currentTime;

                // Pitch burst: 0.65 -> 1.25 -> 0.62 (Settles to real Ferrari idle)
                this.ferrariSource.playbackRate.setValueAtTime(0.65, burstTime);
                this.ferrariSource.playbackRate.exponentialRampToValueAtTime(1.25, burstTime + 0.35);
                this.ferrariSource.playbackRate.exponentialRampToValueAtTime(0.62, burstTime + 0.90);

                this.ferrariFilter.frequency.setValueAtTime(2000, burstTime);
                this.ferrariFilter.frequency.exponentialRampToValueAtTime(8000, burstTime + 0.35);
                this.ferrariFilter.frequency.exponentialRampToValueAtTime(2500, burstTime + 0.90);

                this.ferrariGain.gain.setValueAtTime(0.01, burstTime);
                this.ferrariGain.gain.linearRampToValueAtTime(0.55, burstTime + 0.25);
                this.ferrariGain.gain.linearRampToValueAtTime(0.25, burstTime + 0.90);
            }

            this.engineRunning = true;
            this.isStarting = false;
        }, 500);
    }

    playEngineStop() {
        if (!this.initialized || !this.ctx || !this.engineRunning) return;
        const now = this.ctx.currentTime;

        if (this.ferrariSource && this.ferrariGain) {
            this.ferrariSource.playbackRate.setTargetAtTime(0.3, now, 0.2);
            this.ferrariFilter.frequency.setTargetAtTime(200, now, 0.2);
            this.ferrariGain.gain.setTargetAtTime(0.0, now, 0.25);
        }

        this.engineRunning = false;
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
        if (!this.initialized || !vehicle) return;

        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        if (this.isStarting) return;

        const now = this.ctx.currentTime;
        const speedKmh = vehicle.getSpeedKmh ? vehicle.getSpeedKmh() : 0;
        const maxSpd = vehicle.maxSpeed || 85;
        const speedRatio = Math.max(0, Math.min(1.0, Math.abs(vehicle.speed || 0) / maxSpd));
        const rawRpm = vehicle.getRpm ? vehicle.getRpm() : 0.2;
        const gear = vehicle.getGear ? (typeof vehicle.getGear() === 'number' ? vehicle.getGear() : 1) : 1;
        const isNitro = vehicle.isNitro || false;

        this.smoothedRpm += (rawRpm - this.smoothedRpm) * 0.15;

        // Gear shift pitch drop
        if (gear !== this.lastGear) {
            this.gearShiftDrop = 0.18;
            this.lastGear = gear;
        }
        if (this.gearShiftDrop > 0) {
            this.gearShiftDrop = Math.max(0, this.gearShiftDrop - 0.015);
        }

        // Web Audio Real Ferrari Recording Playback
        if (this.isFerrariLoaded && this.ferrariSource && this.ferrariGain) {
            let targetPitch = 0.62; // Authentic Ferrari idle pitch
            let targetVol = 0.25;   // Clear idle volume

            if (speedKmh > 0.5) {
                const effectiveRpm = Math.max(0.0, this.smoothedRpm - this.gearShiftDrop);
                targetPitch = 0.65 + (gear - 1) * 0.06 + effectiveRpm * 0.42;
                targetVol = 0.35 + speedRatio * 0.45 + effectiveRpm * 0.20;
            }

            targetPitch = Math.max(0.48, Math.min(1.65, targetPitch));
            const filterCutoff = 2500 + this.smoothedRpm * 7500 + speedRatio * 2000;

            this.ferrariSource.playbackRate.setTargetAtTime(targetPitch, now, 0.04);
            this.ferrariFilter.frequency.setTargetAtTime(filterCutoff, now, 0.04);
            this.ferrariGain.gain.setTargetAtTime(targetVol, now, 0.04);
        }

        // Turbo / Nitro Spool Sound
        if (isNitro) {
            this.turboOsc.frequency.setTargetAtTime(1600 + this.smoothedRpm * 1400, now, 0.04);
            this.turboGain.gain.setTargetAtTime(0.20, now, 0.04);
        } else {
            this.turboGain.gain.setTargetAtTime(0.0, now, 0.08);
        }

        // Rain Cabin Ambiance Sound
        if (isRain) {
            this.rainGain.gain.setTargetAtTime(0.12, now, 0.08);
        } else {
            this.rainGain.gain.setTargetAtTime(0.0, now, 0.08);
        }
    }
}