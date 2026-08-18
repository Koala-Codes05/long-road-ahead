/**
 * AudioEngine — AAA Professional Vehicle & Environmental Sound Engine
 * Features:
 *  - 100% Muted Idle MP3 Sample (Zero driving sound at rest, pure V8 sub-bass idle rumble)
 *  - High-Audibility Aerodynamic Wind Rush (Linear velocity scaling up to 12.5kHz filter sweep)
 *  - Guardrail / Barrier Proximity Doppler Pass-by Audio (Whish-whish doppler effect when driving close to road rails)
 *  - Explosive NOS Nitro Boost Engine (Initial blast thud + turbine spool + jet rush + purge hiss)
 *  - Authentic Asphalt Tire Friction & Cornering Screech
 *  - Transmission Dual-Clutch Gear Shift Pops & RPM Drops
 */
export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.engineRunning = false;
        this.isStarting = false;

        // Ferrari Audio Sample Loop Nodes
        this.ferrariBuffer = null;
        this.ferrariSource = null;
        this.ferrariGain = null;
        this.ferrariFilter = null;
        this.isFerrariLoaded = false;
        this.isFerrariPlaying = false;

        // Sub-Bass Exhaust Thud & Intake Resonance (Pure Idle & Acceleration Low-End)
        this.subBassOsc = null;  // Low Sine (28-65Hz)
        this.intakeOsc = null;   // Low Triangle (56-130Hz)
        this.exhaustFilter = null;
        this.exhaustGain = null;

        // High-Audibility Aerodynamic Wind Rush
        this.windSource = null;
        this.windGain = null;
        this.windLowpass = null;
        this.windHighpass = null;
        this.windLfoAngle = 0;

        // Guardrail / Road Barrier Proximity Doppler Pass-by Engine
        this.guardrailSource = null;
        this.guardrailFilter = null;
        this.guardrailGain = null;

        // AAA Nitro Boost Engine (Blast Thud + Turbine Whine + NOS Jet + Purge)
        this.nitroJetSource = null;
        this.nitroJetFilter = null;
        this.nitroJetHighpass = null;
        this.nitroJetGain = null;
        this.nitroTurbineOsc = null;
        this.nitroTurbineGain = null;
        this.nitroSubOsc = null;
        this.nitroSubGain = null;
        this.wasNitroActive = false;

        // Rain Cabin Ambiance
        this.rainSource = null;
        this.rainFilter = null;
        this.rainGain = null;

        // Authentic Asphalt Tire Friction Engine
        this.tireNoiseSource = null;
        this.tireBandpass1 = null;
        this.tireBandpass2 = null;
        this.tireGain = null;
        this.tireChatterAngle = 0;

        // Telemetry & State Smoothing
        this.lastGear = 1;
        this.gearShiftDrop = 0;
        this.smoothedRpm = 0.2;
        this.smoothedSpeedRatio = 0.0;
        this.smoothedIdleFactor = 1.0;

        // Preload sample
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

        // 1. Master Output & Smooth Dynamics Limiter
        this.masterCompressor = this.ctx.createDynamicsCompressor();
        this.masterCompressor.threshold.value = -9;
        this.masterCompressor.knee.value = 10;
        this.masterCompressor.ratio.value = 3.5;
        this.masterCompressor.attack.value = 0.005;
        this.masterCompressor.release.value = 0.15;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.90;

        this.masterCompressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        // 2. Decode Preloaded Ferrari MP3 Buffer
        if (this.rawArrayBuffer) {
            try {
                this.ferrariBuffer = await this.ctx.decodeAudioData(this.rawArrayBuffer.slice(0));
                this.isFerrariLoaded = true;
                console.log('✅ Ferrari 458 AudioBuffer decoded successfully!');
            } catch (e) {
                console.warn('Could not decode Ferrari audio buffer, using synth engine fallback:', e);
            }
        }

        // 3. Setup Smooth Ferrari Sample Graph
        this.ferrariGain = this.ctx.createGain();
        this.ferrariGain.gain.value = 0.0;

        this.ferrariFilter = this.ctx.createBiquadFilter();
        this.ferrariFilter.type = 'lowpass';
        this.ferrariFilter.frequency.value = 3200;
        this.ferrariFilter.Q.value = 0.6;

        this.ferrariGain.connect(this.ferrariFilter);
        this.ferrariFilter.connect(this.masterCompressor);

        // 4. Setup Sub-Bass Exhaust & Intake Layer
        this._initExhaustBassEngine();

        // 5. Setup Aerodynamic Wind Noise System (High-Audibility)
        this._initWindSystem();

        // 6. Setup Guardrail Proximity Doppler Audio Engine
        this._initGuardrailEngine();

        // 7. Setup AAA Nitro Boost Engine (Blast + Turbine Whine + NOS Jet)
        this._initNitroEngine();

        // 8. Setup Weather & Authentic Asphalt Tire Friction Engine
        this._initTireAndWeatherEngine();

        this.initialized = true;

        if (this.ctx.state === 'suspended') {
            try { await this.ctx.resume(); } catch (e) {}
        }

        this.playEngineStart();
    }

    _initExhaustBassEngine() {
        const now = this.ctx.currentTime;
        this.exhaustGain = this.ctx.createGain();
        this.exhaustGain.gain.value = 0.0;

        this.exhaustFilter = this.ctx.createBiquadFilter();
        this.exhaustFilter.type = 'lowpass';
        this.exhaustFilter.frequency.value = 320;
        this.exhaustFilter.Q.value = 0.8;

        // Sub-Bass Sine (Deep 28-65Hz V8 idle rumble & acceleration thud)
        this.subBassOsc = this.ctx.createOscillator();
        this.subBassOsc.type = 'sine';
        this.subBassOsc.frequency.setValueAtTime(32, now);

        // Warm Intake Triangle (56-130Hz manifold warmth)
        this.intakeOsc = this.ctx.createOscillator();
        this.intakeOsc.type = 'triangle';
        this.intakeOsc.frequency.setValueAtTime(64, now);

        const subGain = this.ctx.createGain(); subGain.gain.value = 0.65;
        const intakeGain = this.ctx.createGain(); intakeGain.gain.value = 0.35;

        this.subBassOsc.connect(subGain);
        this.intakeOsc.connect(intakeGain);

        subGain.connect(this.exhaustFilter);
        intakeGain.connect(this.exhaustFilter);

        this.exhaustFilter.connect(this.exhaustGain);
        this.exhaustGain.connect(this.masterCompressor);

        this.subBassOsc.start(now);
        this.intakeOsc.start(now);
    }

    _initWindSystem() {
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
        const leftChannel = noiseBuffer.getChannelData(0);
        const rightChannel = noiseBuffer.getChannelData(1);

        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;

            leftChannel[i] = pink * 0.22;
            rightChannel[i] = (Math.random() * 2 - 1) * 0.14;
        }

        this.windSource = this.ctx.createBufferSource();
        this.windSource.buffer = noiseBuffer;
        this.windSource.loop = true;

        this.windHighpass = this.ctx.createBiquadFilter();
        this.windHighpass.type = 'highpass';
        this.windHighpass.frequency.value = 140;

        this.windLowpass = this.ctx.createBiquadFilter();
        this.windLowpass.type = 'lowpass';
        this.windLowpass.frequency.value = 1200;
        this.windLowpass.Q.value = 0.8;

        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0.0;

        this.windSource.connect(this.windHighpass);
        this.windHighpass.connect(this.windLowpass);
        this.windLowpass.connect(this.windGain);
        this.windGain.connect(this.masterCompressor);

        this.windSource.start(0);
    }

    _initGuardrailEngine() {
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
        const left = noiseBuffer.getChannelData(0);
        const right = noiseBuffer.getChannelData(1);
        for (let i = 0; i < bufferSize; i++) {
            const w = Math.random() * 2 - 1;
            left[i] = w * 0.20;
            right[i] = w * 0.18;
        }

        this.guardrailSource = this.ctx.createBufferSource();
        this.guardrailSource.buffer = noiseBuffer;
        this.guardrailSource.loop = true;

        this.guardrailFilter = this.ctx.createBiquadFilter();
        this.guardrailFilter.type = 'bandpass';
        this.guardrailFilter.frequency.value = 2200;
        this.guardrailFilter.Q.value = 2.2;

        this.guardrailGain = this.ctx.createGain();
        this.guardrailGain.gain.value = 0.0;

        this.guardrailSource.connect(this.guardrailFilter);
        this.guardrailFilter.connect(this.guardrailGain);
        this.guardrailGain.connect(this.masterCompressor);

        this.guardrailSource.start(0);
    }

    _initNitroEngine() {
        const now = this.ctx.currentTime;
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        // 1. High-Pressure NOS Jet Gas Rush
        this.nitroJetSource = this.ctx.createBufferSource();
        this.nitroJetSource.buffer = noiseBuffer;
        this.nitroJetSource.loop = true;

        this.nitroJetHighpass = this.ctx.createBiquadFilter();
        this.nitroJetHighpass.type = 'highpass';
        this.nitroJetHighpass.frequency.value = 450;

        this.nitroJetFilter = this.ctx.createBiquadFilter();
        this.nitroJetFilter.type = 'lowpass';
        this.nitroJetFilter.frequency.value = 2800;
        this.nitroJetFilter.Q.value = 1.2;

        this.nitroJetGain = this.ctx.createGain();
        this.nitroJetGain.gain.value = 0.0;

        this.nitroJetSource.connect(this.nitroJetHighpass);
        this.nitroJetHighpass.connect(this.nitroJetFilter);
        this.nitroJetFilter.connect(this.nitroJetGain);
        this.nitroJetGain.connect(this.masterCompressor);
        this.nitroJetSource.start(0);

        // 2. High-Speed Nitro Turbine Spool Whine (Sine 950-2400Hz)
        this.nitroTurbineOsc = this.ctx.createOscillator();
        this.nitroTurbineOsc.type = 'sine';
        this.nitroTurbineOsc.frequency.setValueAtTime(1100, now);

        this.nitroTurbineGain = this.ctx.createGain();
        this.nitroTurbineGain.gain.value = 0.0;

        const turbFilter = this.ctx.createBiquadFilter();
        turbFilter.type = 'lowpass';
        turbFilter.frequency.value = 3500;

        this.nitroTurbineOsc.connect(turbFilter);
        turbFilter.connect(this.nitroTurbineGain);
        this.nitroTurbineGain.connect(this.masterCompressor);
        this.nitroTurbineOsc.start(now);

        // 3. Sub-Bass Thruster Impact Pulse (50Hz)
        this.nitroSubOsc = this.ctx.createOscillator();
        this.nitroSubOsc.type = 'sine';
        this.nitroSubOsc.frequency.setValueAtTime(50, now);

        this.nitroSubGain = this.ctx.createGain();
        this.nitroSubGain.gain.value = 0.0;

        const subFilter = this.ctx.createBiquadFilter();
        subFilter.type = 'lowpass';
        subFilter.frequency.value = 160;

        this.nitroSubOsc.connect(subFilter);
        subFilter.connect(this.nitroSubGain);
        this.nitroSubGain.connect(this.masterCompressor);
        this.nitroSubOsc.start(now);
    }

    _initTireAndWeatherEngine() {
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
        const leftChannel = noiseBuffer.getChannelData(0);
        const rightChannel = noiseBuffer.getChannelData(1);

        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;

            leftChannel[i] = pink * 0.20;
            rightChannel[i] = pink * 0.18;
        }

        // Rain Cabin Ambiance
        this.rainSource = this.ctx.createBufferSource();
        this.rainSource.buffer = noiseBuffer;
        this.rainSource.loop = true;

        this.rainFilter = this.ctx.createBiquadFilter();
        this.rainFilter.type = 'bandpass';
        this.rainFilter.frequency.value = 1500;
        this.rainFilter.Q.value = 0.8;

        this.rainGain = this.ctx.createGain();
        this.rainGain.gain.value = 0.0;

        this.rainSource.connect(this.rainFilter);
        this.rainFilter.connect(this.rainGain);
        this.rainGain.connect(this.masterCompressor);
        this.rainSource.start(0);

        // Asphalt Tire Friction Engine
        this.tireNoiseSource = this.ctx.createBufferSource();
        this.tireNoiseSource.buffer = noiseBuffer;
        this.tireNoiseSource.loop = true;

        this.tireBandpass1 = this.ctx.createBiquadFilter();
        this.tireBandpass1.type = 'bandpass';
        this.tireBandpass1.frequency.value = 950;
        this.tireBandpass1.Q.value = 1.8;

        this.tireBandpass2 = this.ctx.createBiquadFilter();
        this.tireBandpass2.type = 'bandpass';
        this.tireBandpass2.frequency.value = 1850;
        this.tireBandpass2.Q.value = 2.2;

        const bp1Gain = this.ctx.createGain(); bp1Gain.gain.value = 0.60;
        const bp2Gain = this.ctx.createGain(); bp2Gain.gain.value = 0.40;

        this.tireGain = this.ctx.createGain();
        this.tireGain.gain.value = 0.0;

        this.tireNoiseSource.connect(this.tireBandpass1);
        this.tireNoiseSource.connect(this.tireBandpass2);

        this.tireBandpass1.connect(bp1Gain);
        this.tireBandpass2.connect(bp2Gain);

        bp1Gain.connect(this.tireGain);
        bp2Gain.connect(this.tireGain);

        this.tireGain.connect(this.masterCompressor);
        this.tireNoiseSource.start(0);
    }

    _startFerrariLoop() {
        if (!this.ctx || !this.ferrariBuffer || this.isFerrariPlaying) return;

        try {
            this.ferrariSource = this.ctx.createBufferSource();
            this.ferrariSource.buffer = this.ferrariBuffer;
            this.ferrariSource.loop = true;
            this.ferrariSource.playbackRate.value = 0.90;
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

        // Starter Motor Cranking
        const crankOsc = this.ctx.createOscillator();
        const crankGain = this.ctx.createGain();
        crankOsc.type = 'sawtooth';
        crankOsc.frequency.setValueAtTime(22, now);
        crankOsc.frequency.linearRampToValueAtTime(36, now + 0.55);

        crankGain.gain.setValueAtTime(0.25, now);
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
                this.ferrariSource.playbackRate.setValueAtTime(0.80, burstTime);
                this.ferrariSource.playbackRate.exponentialRampToValueAtTime(1.15, burstTime + 0.35);
                this.ferrariSource.playbackRate.exponentialRampToValueAtTime(0.85, burstTime + 0.90);

                this.ferrariFilter.frequency.setValueAtTime(1800, burstTime);
                this.ferrariFilter.frequency.exponentialRampToValueAtTime(6500, burstTime + 0.35);
                this.ferrariFilter.frequency.exponentialRampToValueAtTime(2400, burstTime + 0.90);

                this.ferrariGain.gain.setValueAtTime(0.01, burstTime);
                this.ferrariGain.gain.linearRampToValueAtTime(0.35, burstTime + 0.25);
                this.ferrariGain.gain.linearRampToValueAtTime(0.0, burstTime + 0.90); // Settle to 0 (muted at idle)
            }

            if (this.exhaustGain) {
                this.exhaustGain.gain.setValueAtTime(0.01, burstTime);
                this.exhaustGain.gain.linearRampToValueAtTime(0.35, burstTime + 0.25);
                this.exhaustGain.gain.linearRampToValueAtTime(0.20, burstTime + 0.90);
            }

            this.engineRunning = true;
            this.isStarting = false;
        }, 500);
    }

    playEngineStop() {
        if (!this.initialized || !this.ctx || !this.engineRunning) return;
        const now = this.ctx.currentTime;

        if (this.ferrariSource && this.ferrariGain) {
            this.ferrariGain.gain.setTargetAtTime(0.0, now, 0.20);
        }
        if (this.exhaustGain) {
            this.exhaustGain.gain.setTargetAtTime(0.0, now, 0.20);
        }

        this.engineRunning = false;
    }

    _triggerNitroBlast() {
        if (!this.ctx || !this.initialized) return;
        const now = this.ctx.currentTime;

        // Explosive NOS Engagement Blast Thud
        const blastOsc = this.ctx.createOscillator();
        const blastGain = this.ctx.createGain();
        blastOsc.type = 'sine';
        blastOsc.frequency.setValueAtTime(90, now);
        blastOsc.frequency.exponentialRampToValueAtTime(35, now + 0.25);

        blastGain.gain.setValueAtTime(0.45, now);
        blastGain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

        blastOsc.connect(blastGain);
        blastGain.connect(this.masterCompressor);

        blastOsc.start(now);
        blastOsc.stop(now + 0.30);
    }

    triggerNitroPurge() {
        if (!this.ctx || !this.initialized) return;
        const now = this.ctx.currentTime;

        // Nitrous Purge Blow-off Hiss ("psh-shh!")
        const purgeNoise = this.ctx.createBufferSource();
        const bufferSize = Math.floor(0.35 * this.ctx.sampleRate);
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
        }
        purgeNoise.buffer = noiseBuffer;

        const purgeFilter = this.ctx.createBiquadFilter();
        purgeFilter.type = 'highpass';
        purgeFilter.frequency.value = 2200;

        const purgeGain = this.ctx.createGain();
        purgeGain.gain.setValueAtTime(0.35, now);
        purgeGain.gain.exponentialRampToValueAtTime(0.01, now + 0.32);

        purgeNoise.connect(purgeFilter);
        purgeFilter.connect(purgeGain);
        purgeGain.connect(this.masterCompressor);

        purgeNoise.start(now);
    }

    update(vehicle, isRain = true, weatherType = 0) {
        if (!this.initialized || !vehicle) return;

        if (this.ctx.state === 'suspended') {
            try { this.ctx.resume(); } catch (e) {}
        }

        if (this.isStarting) return;

        const now = this.ctx.currentTime;
        const speedKmh = vehicle.getSpeedKmh ? vehicle.getSpeedKmh() : (Math.abs(vehicle.speed || 0) * 3.6);
        const maxSpd = (vehicle.maxSpeed || 75) * 3.6; // ~270-315 KM/H
        const speedRatio = Math.max(0, Math.min(1.2, speedKmh / maxSpd));
        const rawRpm = vehicle.getRpm ? vehicle.getRpm() : 0.2;
        const gear = vehicle.getGear ? (typeof vehicle.getGear() === 'number' ? vehicle.getGear() : 1) : 1;
        const isNitro = vehicle.isNitro || false;
        const isThrottle = vehicle.acceleratingSystem ? vehicle.acceleratingSystem.isThrottle : (speedKmh > 2.5);

        // Telemetry Smoothing
        this.smoothedRpm += (rawRpm - this.smoothedRpm) * 0.18;
        this.smoothedSpeedRatio += (speedRatio - this.smoothedSpeedRatio) * 0.12;

        const targetIdle = (speedKmh < 2.5 && !isThrottle) ? 1.0 : 0.0;
        this.smoothedIdleFactor += (targetIdle - this.smoothedIdleFactor) * 0.12;

        // Gear Shift Drop
        if (gear !== this.lastGear) {
            this.gearShiftDrop = 0.18;
            this.lastGear = gear;
        }
        if (this.gearShiftDrop > 0) {
            this.gearShiftDrop = Math.max(0, this.gearShiftDrop - 0.015);
        }

        // =============================================
        // 1. FERRARI 458 AUDIO SAMPLE ENGINE (100% MUTED AT IDLE!)
        // =============================================
        if (this.isFerrariLoaded && !this.isFerrariPlaying && this.engineRunning) {
            this._startFerrariLoop();
        }

        if (this.isFerrariLoaded && this.ferrariSource && this.ferrariGain) {
            const effectiveRpm = Math.max(0.0, this.smoothedRpm - this.gearShiftDrop);
            const targetPitch = 0.82 + (gear - 1) * 0.035 + effectiveRpm * 0.38;
            const pitch = Math.max(0.70, Math.min(1.45, targetPitch));

            // CRITICAL FIX: When stationary at idle (smoothedIdleFactor > 0.90), MUTED (0.0 volume).
            // Fades in smoothly under acceleration to eliminate driving sample sound on idle!
            const sampleVol = (this.smoothedIdleFactor > 0.90) ? 0.0 : ((0.35 + this.smoothedSpeedRatio * 0.35 + effectiveRpm * 0.20) * (1.0 - this.smoothedIdleFactor));
            const filterCutoff = 1400 + (1.0 - this.smoothedIdleFactor) * 2000 + effectiveRpm * 5500;

            this.ferrariSource.playbackRate.setTargetAtTime(pitch, now, 0.04);
            this.ferrariFilter.frequency.setTargetAtTime(filterCutoff, now, 0.04);
            this.ferrariGain.gain.setTargetAtTime(sampleVol, now, 0.05);
        }

        // =============================================
        // 2. SUB-BASS EXHAUST THUD & IDLE RUMBLE (Pure Idle Sound)
        // =============================================
        if (this.subBassOsc && this.exhaustGain) {
            const baseFreq = 28.0 * this.smoothedIdleFactor + (1.0 - this.smoothedIdleFactor) * (34.0 + (gear - 1) * 4.0 + this.smoothedRpm * 35.0);
            this.subBassOsc.frequency.setTargetAtTime(baseFreq, now, 0.04);
            this.intakeOsc.frequency.setTargetAtTime(baseFreq * 2.0, now, 0.04);

            const filterCutoff = 200 * this.smoothedIdleFactor + (1.0 - this.smoothedIdleFactor) * (350 + this.smoothedRpm * 400);
            this.exhaustFilter.frequency.setTargetAtTime(filterCutoff, now, 0.04);

            // Gentle 0.20 volume at idle, blending into deep sub-bass exhaust punch under throttle
            const targetVol = (0.20 * this.smoothedIdleFactor) + ((isThrottle ? (0.18 + this.smoothedRpm * 0.20) : 0.08) * (1.0 - this.smoothedIdleFactor));
            this.exhaustGain.gain.setTargetAtTime(targetVol, now, 0.05);
        }

        // =============================================
        // 3. HIGH-AUDIBILITY AERODYNAMIC WIND RUSH
        // =============================================
        if (this.windGain && this.windLowpass && this.windHighpass) {
            // Linear velocity response: starts at 15 km/h, scaling directly up to 0.65 volume at top speed
            const windLinearRatio = Math.max(0.0, Math.min(1.0, (speedKmh - 15) / 140));
            const baseWindVol = windLinearRatio * 0.62;

            this.windLfoAngle += 0.02;
            const gustTurbulence = 1.0 + Math.sin(this.windLfoAngle) * 0.18;
            const weatherBoost = (weatherType === 0) ? 0.12 : ((weatherType === 1) ? 0.06 : 0.0);

            const targetWindVol = (baseWindVol + weatherBoost) * gustTurbulence;
            
            // Lowpass filter sweeps wide from 1200Hz to 12,500Hz for crisp high-speed camera air rush
            const targetLowpass = 1200 + windLinearRatio * 11300;

            this.windGain.gain.setTargetAtTime(targetWindVol, now, 0.05);
            this.windLowpass.frequency.setTargetAtTime(targetLowpass, now, 0.05);
        }

        // =============================================
        // 4. GUARDRAIL / BARRIER PROXIMITY DOPPLER PASS-BY AUDIO
        // =============================================
        if (this.guardrailGain && this.guardrailFilter && vehicle.mesh) {
            const carX = vehicle.mesh.position.x;
            const carZ = vehicle.mesh.position.z;
            
            // Road guardrails sit at x = -9.8m and x = +9.8m
            const distToLeftRail = Math.abs(carX - (-9.8));
            const distToRightRail = Math.abs(carX - 9.8);
            const minDist = Math.min(distToLeftRail, distToRightRail);

            if (minDist < 3.5 && speedKmh > 20) {
                const proxFactor = Math.max(0.0, 1.0 - (minDist / 3.5));
                const speedFactor = Math.min(1.0, speedKmh / 90);
                const targetRailVol = proxFactor * speedFactor * 0.42;

                // Rhythmic Doppler post-passing pulse frequency
                const dopplerPulseFreq = 1600 + Math.sin(carZ * 0.45) * 850 + speedKmh * 7.5;
                this.guardrailFilter.frequency.setTargetAtTime(dopplerPulseFreq, now, 0.03);
                this.guardrailGain.gain.setTargetAtTime(targetRailVol, now, 0.04);
            } else {
                this.guardrailGain.gain.setTargetAtTime(0.0, now, 0.08);
            }
        }

        // =============================================
        // 5. AAA NITRO BOOST AUDIO (Blast + Turbine Whine + NOS Jet + Purge)
        // =============================================
        if (this.nitroJetGain && this.nitroSubGain && this.nitroTurbineGain) {
            if (isNitro) {
                if (!this.wasNitroActive) {
                    this._triggerNitroBlast(); // Explosive initial blast thud on NOS engagement
                    this.wasNitroActive = true;
                }

                // High-pressure NOS gas rush
                const jetCutoff = 2800 + this.smoothedRpm * 4500;
                this.nitroJetFilter.frequency.setTargetAtTime(jetCutoff, now, 0.04);
                this.nitroJetGain.gain.setTargetAtTime(0.42, now, 0.04);

                // High-speed turbine whine (950Hz to 2400Hz)
                const turbineFreq = 950 + this.smoothedRpm * 1450;
                this.nitroTurbineOsc.frequency.setTargetAtTime(turbineFreq, now, 0.04);
                this.nitroTurbineGain.gain.setTargetAtTime(0.22, now, 0.04);

                // Deep sub-bass thruster pulse (50Hz)
                this.nitroSubGain.gain.setTargetAtTime(0.32, now, 0.04);
            } else {
                if (this.wasNitroActive) {
                    this.triggerNitroPurge(); // Pressurized purge hiss ("psh-shh!") on release
                    this.wasNitroActive = false;
                }
                this.nitroJetGain.gain.setTargetAtTime(0.0, now, 0.08);
                this.nitroTurbineGain.gain.setTargetAtTime(0.0, now, 0.08);
                this.nitroSubGain.gain.setTargetAtTime(0.0, now, 0.08);
            }
        }

        // =============================================
        // 6. ASPHALT TIRE FRICTION & CORNERING SCREECH
        // =============================================
        if (this.tireGain && this.tireBandpass1 && this.tireBandpass2) {
            const steerAmt = Math.abs(vehicle.steerAngle || vehicle.currentSteer || 0);
            const vLat = Math.abs(vehicle.vLat || 0);
            const isDrifting = vehicle.isDrifting || false;

            const isTireSqueal = speedKmh > 8.0 && (isDrifting || steerAmt > 0.15 || vLat > 0.8);

            if (isTireSqueal) {
                const slipFactor = Math.min(1.0, (steerAmt * 1.5) + (vLat * 0.12) + (isDrifting ? 0.4 : 0.0));

                this.tireChatterAngle += 0.35;
                const chatter = Math.sin(this.tireChatterAngle) * 45;

                const centerBp1 = 850 + slipFactor * 350 + chatter;
                const centerBp2 = 1650 + slipFactor * 450 + chatter;

                this.tireBandpass1.frequency.setTargetAtTime(centerBp1, now, 0.03);
                this.tireBandpass2.frequency.setTargetAtTime(centerBp2, now, 0.03);

                const targetTireVol = 0.12 + slipFactor * 0.28;
                this.tireGain.gain.setTargetAtTime(targetTireVol, now, 0.04);
            } else {
                const isWetScrub = speedKmh > 30 && isRain;
                const targetTireVol = isWetScrub ? 0.06 : 0.0;
                this.tireBandpass1.frequency.setTargetAtTime(800, now, 0.08);
                this.tireBandpass2.frequency.setTargetAtTime(1400, now, 0.08);
                this.tireGain.gain.setTargetAtTime(targetTireVol, now, 0.08);
            }
        }

        // =============================================
        // 7. RAIN CABIN AMBIANCE
        // =============================================
        if (this.rainGain) {
            const targetRainVol = isRain ? (weatherType === 0 ? 0.16 : 0.08) : 0.0;
            this.rainGain.gain.setTargetAtTime(targetRainVol, now, 0.08);
        }
    }
}