/**
 * AudioEngine — AAA Ferrari 458 Italia & Aerodynamic Wind Sound Engine
 * Features:
 *  - Real Ferrari 458 Italia V8 Audio Sample Playback & Pitch Modulation
 *  - Multi-Harmonic V8 Synthesizer Engine (Sub-bass rumble + Intake harmonics)
 *  - Dynamic Aerodynamic Cockpit Wind Rush Engine (Scales exponentially with speed & weather gusts)
 *  - Transmission Dual-Clutch Gear Shift Pops & RPM Drops
 *  - Rain Cabin Ambiance & Wet Surface Tire Hiss
 *  - Auto-Resume Web Audio Context on User Interaction
 */
export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.engineRunning = false;
        this.isStarting = false;

        // Ferrari Audio Sample Nodes
        this.ferrariBuffer = null;
        this.ferrariSource = null;
        this.ferrariGain = null;
        this.ferrariFilter = null;
        this.isFerrariLoaded = false;
        this.isFerrariPlaying = false;

        // V8 Multi-Harmonic Synthesizer (Layering & Fallback)
        this.synthOsc1 = null; // Fundamental Sawtooth
        this.synthOsc2 = null; // Sub-Bass Sine
        this.synthOsc3 = null; // Mechanical Intake Triangle
        this.synthGain = null;
        this.synthFilter = null;

        // Aerodynamic Wind Rush Engine
        this.windSource = null;
        this.windGain = null;
        this.windLowpass = null;
        this.windHighpass = null;
        this.windLfoAngle = 0;

        // Turbo / Nitro Spool
        this.turboOsc = null;
        this.turboGain = null;

        // Rain Cabin Ambiance
        this.rainSource = null;
        this.rainFilter = null;
        this.rainGain = null;

        // Tire Wet Friction Hiss
        this.tireSource = null;
        this.tireFilter = null;
        this.tireGain = null;

        // Telemetry & Gear Logic
        this.lastGear = 1;
        this.gearShiftDrop = 0;
        this.smoothedRpm = 0.2;
        this.smoothedSpeedRatio = 0.0;

        // Auto Preload
        this._preloadFerrariAudio();
    }

    async _preloadFerrariAudio() {
        const candidatePaths = [
            'assets/Sounds/ferrari/ferrari-458-italia-sound-effect-going-fast-360530.mp3',
            'assets/ferrari.mp3',
        ];

        for (const path of candidatePaths) {
            try {
                const response = await fetch(path);
                if (!response.ok) continue;
                this.rawArrayBuffer = await response.arrayBuffer();
                console.log(`🎵 Ferrari AudioBuffer preloaded from: ${path}`);
                break;
            } catch (err) {
                // Try next candidate
            }
        }
    }

    async init() {
        if (this.initialized) {
            if (this.ctx && this.ctx.state === 'suspended') {
                try { await this.ctx.resume(); } catch (e) {}
            }
            if (!this.engineRunning && !this.isStarting) {
                this.playEngineStart();
            }
            return;
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        this.ctx = new AudioCtx();

        // 1. Master Output & Dynamics Limiter/Compressor
        this.masterCompressor = this.ctx.createDynamicsCompressor();
        this.masterCompressor.threshold.value = -12;
        this.masterCompressor.knee.value = 10;
        this.masterCompressor.ratio.value = 4;
        this.masterCompressor.attack.value = 0.003;
        this.masterCompressor.release.value = 0.15;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.70;

        this.masterCompressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        // 2. Decode Preloaded Ferrari MP3 Buffer
        if (this.rawArrayBuffer) {
            try {
                this.ferrariBuffer = await this.ctx.decodeAudioData(this.rawArrayBuffer.slice(0));
                this.isFerrariLoaded = true;
                console.log('✅ Ferrari 458 AudioBuffer decoded successfully!');
            } catch (e) {
                console.warn('Could not decode Ferrari audio buffer, using synth engine:', e);
            }
        }

        // 3. Setup Ferrari Sample Graph
        this.ferrariGain = this.ctx.createGain();
        this.ferrariGain.gain.value = 0.0;

        this.ferrariFilter = this.ctx.createBiquadFilter();
        this.ferrariFilter.type = 'lowpass';
        this.ferrariFilter.frequency.value = 3200;
        this.ferrariFilter.Q.value = 1.2;

        this.ferrariGain.connect(this.ferrariFilter);
        this.ferrariFilter.connect(this.masterCompressor);

        // 4. Setup Multi-Harmonic V8 Synthesizer Graph
        this._initSynthEngine();

        // 5. Setup Aerodynamic Wind Noise System
        this._initWindSystem();

        // 6. Setup Turbo / Nitro Spool Oscillator
        this.turboOsc = this.ctx.createOscillator();
        this.turboOsc.type = 'sine';
        this.turboGain = this.ctx.createGain();
        this.turboGain.gain.value = 0.0;
        this.turboOsc.connect(this.turboGain);
        this.turboGain.connect(this.masterCompressor);
        this.turboOsc.start();

        // 7. Setup Rain Ambiance & Tire Friction Hiss Nodes
        this._initWeatherAndTireNodes();

        this.initialized = true;

        if (this.ctx.state === 'suspended') {
            try { await this.ctx.resume(); } catch (e) {}
        }

        this.playEngineStart();
    }

    _initSynthEngine() {
        const now = this.ctx.currentTime;
        this.synthGain = this.ctx.createGain();
        this.synthGain.gain.value = 0.0;

        this.synthFilter = this.ctx.createBiquadFilter();
        this.synthFilter.type = 'lowpass';
        this.synthFilter.frequency.value = 1500;
        this.synthFilter.Q.value = 2.0;

        // Osc 1: Sawtooth (Fundamental V8 firing order)
        this.synthOsc1 = this.ctx.createOscillator();
        this.synthOsc1.type = 'sawtooth';
        this.synthOsc1.frequency.setValueAtTime(32, now);

        // Osc 2: Sub-Bass Sine (Deep exhaust thud)
        this.synthOsc2 = this.ctx.createOscillator();
        this.synthOsc2.type = 'sine';
        this.synthOsc2.frequency.setValueAtTime(16, now);

        // Osc 3: Triangle (Intake manifold resonance)
        this.synthOsc3 = this.ctx.createOscillator();
        this.synthOsc3.type = 'triangle';
        this.synthOsc3.frequency.setValueAtTime(64, now);

        const osc1Gain = this.ctx.createGain(); osc1Gain.gain.value = 0.50;
        const osc2Gain = this.ctx.createGain(); osc2Gain.gain.value = 0.40;
        const osc3Gain = this.ctx.createGain(); osc3Gain.gain.value = 0.25;

        this.synthOsc1.connect(osc1Gain);
        this.synthOsc2.connect(osc2Gain);
        this.synthOsc3.connect(osc3Gain);

        osc1Gain.connect(this.synthFilter);
        osc2Gain.connect(this.synthFilter);
        osc3Gain.connect(this.synthFilter);

        this.synthFilter.connect(this.synthGain);
        this.synthGain.connect(this.masterCompressor);

        this.synthOsc1.start(now);
        this.synthOsc2.start(now);
        this.synthOsc3.start(now);
    }

    _initWindSystem() {
        // Create 2-second stereo pink/white noise buffer for dynamic wind rush
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
        const leftChannel = noiseBuffer.getChannelData(0);
        const rightChannel = noiseBuffer.getChannelData(1);

        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            // Pink noise filtering algorithm
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;

            leftChannel[i] = pink * 0.11;
            rightChannel[i] = (Math.random() * 2 - 1) * 0.08; // Slight stereo variance
        }

        this.windSource = this.ctx.createBufferSource();
        this.windSource.buffer = noiseBuffer;
        this.windSource.loop = true;

        this.windHighpass = this.ctx.createBiquadFilter();
        this.windHighpass.type = 'highpass';
        this.windHighpass.frequency.value = 110;

        this.windLowpass = this.ctx.createBiquadFilter();
        this.windLowpass.type = 'lowpass';
        this.windLowpass.frequency.value = 400;
        this.windLowpass.Q.value = 0.8;

        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0.0;

        this.windSource.connect(this.windHighpass);
        this.windHighpass.connect(this.windLowpass);
        this.windLowpass.connect(this.windGain);
        this.windGain.connect(this.masterCompressor);

        this.windSource.start(0);
    }

    _initWeatherAndTireNodes() {
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        // Rain Ambiance
        this.rainSource = this.ctx.createBufferSource();
        this.rainSource.buffer = noiseBuffer;
        this.rainSource.loop = true;

        this.rainFilter = this.ctx.createBiquadFilter();
        this.rainFilter.type = 'bandpass';
        this.rainFilter.frequency.value = 1600;
        this.rainFilter.Q.value = 0.8;

        this.rainGain = this.ctx.createGain();
        this.rainGain.gain.value = 0.0;

        this.rainSource.connect(this.rainFilter);
        this.rainFilter.connect(this.rainGain);
        this.rainGain.connect(this.masterCompressor);
        this.rainSource.start(0);

        // Tire Wet Surface Hiss
        this.tireSource = this.ctx.createBufferSource();
        this.tireSource.buffer = noiseBuffer;
        this.tireSource.loop = true;

        this.tireFilter = this.ctx.createBiquadFilter();
        this.tireFilter.type = 'bandpass';
        this.tireFilter.frequency.value = 800;

        this.tireGain = this.ctx.createGain();
        this.tireGain.gain.value = 0.0;

        this.tireSource.connect(this.tireFilter);
        this.tireFilter.connect(this.tireGain);
        this.tireGain.connect(this.masterCompressor);
        this.tireSource.start(0);
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
        crankOsc.frequency.linearRampToValueAtTime(38, now + 0.55);

        crankGain.gain.setValueAtTime(0.30, now);
        crankGain.gain.exponentialRampToValueAtTime(0.01, now + 0.60);

        crankOsc.connect(crankGain);
        crankGain.connect(this.masterCompressor);

        crankOsc.start(now);
        crankOsc.stop(now + 0.60);

        // Ferrari Ignition Rev Burst
        setTimeout(() => {
            if (!this.ctx) return;

            if (this.isFerrariLoaded && !this.isFerrariPlaying) {
                this._startFerrariLoop();
            }

            const burstTime = this.ctx.currentTime;

            if (this.ferrariSource && this.ferrariGain) {
                // Pitch burst: 0.65 -> 1.30 -> 0.65 (Settles to authentic V8 idle)
                this.ferrariSource.playbackRate.setValueAtTime(0.65, burstTime);
                this.ferrariSource.playbackRate.exponentialRampToValueAtTime(1.30, burstTime + 0.35);
                this.ferrariSource.playbackRate.exponentialRampToValueAtTime(0.65, burstTime + 0.90);

                this.ferrariFilter.frequency.setValueAtTime(2200, burstTime);
                this.ferrariFilter.frequency.exponentialRampToValueAtTime(8500, burstTime + 0.35);
                this.ferrariFilter.frequency.exponentialRampToValueAtTime(3200, burstTime + 0.90);

                this.ferrariGain.gain.setValueAtTime(0.01, burstTime);
                this.ferrariGain.gain.linearRampToValueAtTime(0.55, burstTime + 0.25);
                this.ferrariGain.gain.linearRampToValueAtTime(0.32, burstTime + 0.90);
            }

            // Synth Engine Ignition Burst
            if (this.synthGain) {
                this.synthGain.gain.setValueAtTime(0.01, burstTime);
                this.synthGain.gain.linearRampToValueAtTime(0.35, burstTime + 0.25);
                this.synthGain.gain.linearRampToValueAtTime(0.18, burstTime + 0.90);
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
        if (this.synthGain) {
            this.synthGain.gain.setTargetAtTime(0.0, now, 0.25);
        }

        this.engineRunning = false;
    }

    update(vehicle, isRain = true, weatherType = 0) {
        if (!this.initialized || !vehicle) return;

        if (this.ctx.state === 'suspended') {
            try { this.ctx.resume(); } catch (e) {}
        }

        if (this.isStarting) return;

        const now = this.ctx.currentTime;
        const speedKmh = vehicle.getSpeedKmh ? vehicle.getSpeedKmh() : (Math.abs(vehicle.speed || 0) * 3.6);
        const maxSpd = (vehicle.maxSpeed || 75) * 3.6; // ~270 KM/H
        const speedRatio = Math.max(0, Math.min(1.2, speedKmh / maxSpd));
        const rawRpm = vehicle.getRpm ? vehicle.getRpm() : 0.2;
        const gear = vehicle.getGear ? (typeof vehicle.getGear() === 'number' ? vehicle.getGear() : 1) : 1;
        const isNitro = vehicle.isNitro || false;
        const isAccelerating = vehicle.throttle > 0 || speedRatio > 0.05;

        // Smooth telemetry interpolations
        this.smoothedRpm += (rawRpm - this.smoothedRpm) * 0.18;
        this.smoothedSpeedRatio += (speedRatio - this.smoothedSpeedRatio) * 0.12;

        // Gear shift pitch drop & dual-clutch pop effect
        if (gear !== this.lastGear) {
            this.gearShiftDrop = 0.22;
            this.lastGear = gear;
        }
        if (this.gearShiftDrop > 0) {
            this.gearShiftDrop = Math.max(0, this.gearShiftDrop - 0.02);
        }

        // =============================================
        // 1. FERRARI 458 AUDIO SAMPLE LOOP (Real V8 Engine)
        // =============================================
        if (this.isFerrariLoaded && !this.isFerrariPlaying && this.engineRunning) {
            this._startFerrariLoop();
        }

        if (this.isFerrariLoaded && this.ferrariSource && this.ferrariGain) {
            let targetPitch = 0.65; // Authentic V8 idle pitch
            let targetVol = 0.32;   // Crisp idle volume

            if (speedKmh > 0.5) {
                const effectiveRpm = Math.max(0.0, this.smoothedRpm - this.gearShiftDrop);
                targetPitch = 0.62 + (gear - 1) * 0.08 + effectiveRpm * 0.48;
                targetVol = 0.35 + this.smoothedSpeedRatio * 0.42 + effectiveRpm * 0.25;
            }

            targetPitch = Math.max(0.45, Math.min(1.85, targetPitch));
            const filterCutoff = 2800 + this.smoothedRpm * 8500 + this.smoothedSpeedRatio * 3000;

            this.ferrariSource.playbackRate.setTargetAtTime(targetPitch, now, 0.04);
            this.ferrariFilter.frequency.setTargetAtTime(filterCutoff, now, 0.04);
            this.ferrariGain.gain.setTargetAtTime(targetVol, now, 0.04);
        }

        // =============================================
        // 2. MULTI-HARMONIC V8 SYNTHESIZER (Bass Punch & Layer)
        // =============================================
        if (this.synthOsc1 && this.synthGain) {
            const baseFreq = 30.0 + (gear - 1) * 6.0 + this.smoothedRpm * 110.0;
            this.synthOsc1.frequency.setTargetAtTime(baseFreq, now, 0.04);
            this.synthOsc2.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.04);
            this.synthOsc3.frequency.setTargetAtTime(baseFreq * 2.0, now, 0.04);

            const synthCutoff = 1200 + this.smoothedRpm * 4500;
            this.synthFilter.frequency.setTargetAtTime(synthCutoff, now, 0.04);

            // Layer synth moderately when accelerating for visceral low-end rumble
            const targetSynthVol = isAccelerating ? (0.15 + this.smoothedRpm * 0.20) : 0.08;
            this.synthGain.gain.setTargetAtTime(targetSynthVol, now, 0.05);
        }

        // =============================================
        // 3. AERODYNAMIC WIND RUSH AUDIO ENGINE (Wind System)
        // =============================================
        if (this.windGain && this.windLowpass && this.windHighpass) {
            // Wind volume scales non-linearly with vehicle speed (silent at rest -> intense storm rush at high speed)
            const baseWindVol = Math.pow(this.smoothedSpeedRatio, 1.45) * 0.42;

            // Gust LFO turbulence modulation (0.3Hz natural breeze swell)
            this.windLfoAngle += 0.02;
            const gustTurbulence = 1.0 + Math.sin(this.windLfoAngle) * 0.15;

            // Weather modifier (Storm weather adds extra atmospheric wind gust volume)
            const weatherWindBoost = (weatherType === 0) ? 0.08 : ((weatherType === 1) ? 0.04 : 0.0);
            const targetWindVolume = (baseWindVol + weatherWindBoost) * gustTurbulence;

            // Dynamic filter opening (300Hz low speed -> 4800Hz roaring wind rush)
            const targetLowpass = 300 + Math.pow(this.smoothedSpeedRatio, 1.2) * 4500;
            const targetHighpass = 90 + this.smoothedSpeedRatio * 220;

            this.windGain.gain.setTargetAtTime(targetWindVolume, now, 0.06);
            this.windLowpass.frequency.setTargetAtTime(targetLowpass, now, 0.06);
            this.windHighpass.frequency.setTargetAtTime(targetHighpass, now, 0.06);
        }

        // =============================================
        // 4. TURBO / NITRO BOOST SPOOL
        // =============================================
        if (this.turboGain && this.turboOsc) {
            if (isNitro) {
                this.turboOsc.frequency.setTargetAtTime(1800 + this.smoothedRpm * 1600, now, 0.04);
                this.turboGain.gain.setTargetAtTime(0.22, now, 0.04);
            } else {
                this.turboGain.gain.setTargetAtTime(0.0, now, 0.08);
            }
        }

        // =============================================
        // 5. RAIN & TIRE FRICTION AMBIANCE
        // =============================================
        if (this.rainGain) {
            const targetRainVol = isRain ? (weatherType === 0 ? 0.18 : 0.09) : 0.0;
            this.rainGain.gain.setTargetAtTime(targetRainVol, now, 0.08);
        }

        if (this.tireGain && this.tireFilter) {
            const isTireSqueal = speedKmh > 10 && (vehicle.isDrifting || Math.abs(vehicle.steerAngle || 0) > 0.25);
            const targetTireVol = isTireSqueal ? 0.25 : (speedKmh > 30 && isRain ? 0.08 : 0.0);
            const tireCutoff = isTireSqueal ? 2400 : 900;

            this.tireFilter.frequency.setTargetAtTime(tireCutoff, now, 0.05);
            this.tireGain.gain.setTargetAtTime(targetTireVol, now, 0.05);
        }
    }
}