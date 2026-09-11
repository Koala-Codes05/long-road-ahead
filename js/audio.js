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

        // Rain Cabin Ambiance (Authentic Stereo WAV Loops)
        this.stormRainSource = null;
        this.drizzleRainSource = null;
        this.stormRainGain = null;
        this.drizzleRainGain = null;
        this.rainLowpass = null;
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

        // Essential Sounds Buffer Map & Sound Instances
        this.essentialBuffers = {};
        this.essentialSources = {};

        // Preload samples
        this._preloadFerrariAudio();
        this._preloadEssentialSounds();
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

    async _preloadEssentialSounds() {
        const soundMap = {
            startEngine: 'assets/Sounds/Vehicle_Essentials_NOX_SOUND/Vehicle_Essential_Car/Vehicle_Car_Start_Engine_Exterior_Mono.wav',
            stopEngine: 'assets/Sounds/Vehicle_Essentials_NOX_SOUND/Vehicle_Essential_Car/Vehicle_Car_Stop_Engine_Exterior_Mono.wav',
            horn: 'assets/Sounds/Vehicle_Essentials_NOX_SOUND/Vehicle_Essential_Car/Vehicle_Car_Horn_Exterior_Mono.wav',
            handbrake: 'assets/Sounds/Vehicle_Essentials_NOX_SOUND/Vehicle_Essential_Car/Vehicle_Car_Hand_Brake_Mono_01.wav',
            click: 'assets/Sounds/Vehicle_Essentials_NOX_SOUND/Vehicle_Essential_Car/Vehicle_Car_Button_Mono_01.wav',
            door: 'assets/Sounds/Vehicle_Essentials_NOX_SOUND/Vehicle_Essential_Car/Vehicle_Car_Door_Closing_Exterior_Mono_01.wav',
            stormRain: 'assets/Sounds/Nature_Essentials_NOX_SOUND/Ambiance_Rain_Strong_Loop_Stereo.wav',
            drizzleRain: 'assets/Sounds/Nature_Essentials_NOX_SOUND/Ambiance_Rain_Calm_Loop_Stereo.wav',
            windAmbiance: 'assets/Sounds/Nature_Essentials_NOX_SOUND/Ambiance_Wind_Calm_Loop_Stereo.wav',
            nightAmbiance: 'assets/Sounds/Nature_Essentials_NOX_SOUND/Ambiance_Night_Loop_Stereo.wav',
        };

        this.rawEssentialBuffers = {};
        for (const [key, path] of Object.entries(soundMap)) {
            try {
                const res = await fetch(path);
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    this.rawEssentialBuffers[key] = buf;
                    console.log(`🔊 Essential Sound preloaded: ${key}`);
                    if (this.ctx) {
                        try {
                            this.essentialBuffers[key] = await this.ctx.decodeAudioData(buf.slice(0));
                            if (key === 'stormRain' || key === 'drizzleRain') {
                                this._startRainLoops();
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {}
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

        // Decode Essential Sound Buffers
        if (this.rawEssentialBuffers) {
            for (const [key, buf] of Object.entries(this.rawEssentialBuffers)) {
                try {
                    this.essentialBuffers[key] = await this.ctx.decodeAudioData(buf.slice(0));
                } catch (err) {
                    console.warn(`Could not decode Essential Sound [${key}]:`, err);
                }
            }
        }

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

        // Rain Cabin Ambiance Engine (Stereo Noise Hiss + Droplet Transients)
        const rainBufLen = 4 * this.ctx.sampleRate;
        this.proceduralRainBuffer = this.ctx.createBuffer(2, rainBufLen, this.ctx.sampleRate);
        const pLeft = this.proceduralRainBuffer.getChannelData(0);
        const pRight = this.proceduralRainBuffer.getChannelData(1);
        let rp0 = 0, rp1 = 0;
        for (let i = 0; i < rainBufLen; i++) {
            const w1 = Math.random() * 2 - 1;
            const w2 = Math.random() * 2 - 1;
            // High-pass + Pink Noise blend (1.2kHz - 6kHz rain hiss)
            rp0 = 0.85 * rp0 + w1 * 0.15;
            rp1 = 0.85 * rp1 + w2 * 0.15;
            const rainHiss1 = (w1 - rp0) * 0.45;
            const rainHiss2 = (w2 - rp1) * 0.45;
            // Pitter-patter droplet transients
            const drop1 = Math.random() > 0.994 ? (Math.random() * 0.75) : 0;
            const drop2 = Math.random() > 0.994 ? (Math.random() * 0.75) : 0;
            pLeft[i] = rainHiss1 * 0.65 + drop1;
            pRight[i] = rainHiss2 * 0.65 + drop2;
        }

        this.rainLowpass = this.ctx.createBiquadFilter();
        this.rainLowpass.type = 'lowpass';
        this.rainLowpass.frequency.value = 2500;
        this.rainLowpass.Q.value = 0.7;

        this.stormRainGain = this.ctx.createGain();
        this.stormRainGain.gain.value = 0.0;

        this.drizzleRainGain = this.ctx.createGain();
        this.drizzleRainGain.gain.value = 0.0;

        this.stormRainGain.connect(this.rainLowpass);
        this.drizzleRainGain.connect(this.rainLowpass);
        this.rainLowpass.connect(this.masterCompressor);

        this._startRainLoops();

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

    playSoundSample(key, volume = 1.0, pitch = 1.0, loop = false) {
        if (!this.ctx || !this.initialized) return null;
        const buffer = this.essentialBuffers[key];
        if (!buffer) return null;

        try {
            const src = this.ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = loop;
            src.playbackRate.value = pitch;

            const gain = this.ctx.createGain();
            gain.gain.value = volume;

            src.connect(gain);
            gain.connect(this.masterCompressor);
            src.start(0);
            return { src, gain };
        } catch (e) {
            return null;
        }
    }

    playHorn() {
        this.playSoundSample('horn', 0.85);
    }

    playHandbrake() {
        this.playSoundSample('handbrake', 0.65, 1.05);
    }

    playGearShift() {
        this.playSoundSample('click', 0.50, 1.1 + Math.random() * 0.15);
    }

    playDoorClose() {
        this.playSoundSample('door', 0.70);
    }

    playEngineStart() {
        if (!this.initialized || !this.ctx) return;
        if (this.isStarting || this.engineRunning) return;
        this.isStarting = true;

        const now = this.ctx.currentTime;

        // Play Door Shut & Real Engine Ignition WAV Sample from Vehicle_Essentials_NOX_SOUND
        this.playDoorClose();
        this.playSoundSample('startEngine', 0.85);

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

        this.playSoundSample('stopEngine', 0.85);

        if (this.ferrariSource && this.ferrariGain) {
            this.ferrariGain.gain.setTargetAtTime(0.0, now, 0.20);
        }
        if (this.exhaustGain) {
            this.exhaustGain.gain.setTargetAtTime(0.0, now, 0.20);
        }

        this.engineRunning = false;
    }

    _startRainLoops() {
        if (!this.ctx) return;

        const stormBuf = this.essentialBuffers['stormRain'] || this.proceduralRainBuffer;
        const drizzleBuf = this.essentialBuffers['drizzleRain'] || this.proceduralRainBuffer;
        const isStormWav = !!this.essentialBuffers['stormRain'];
        const isDrizzleWav = !!this.essentialBuffers['drizzleRain'];

        // If currently using procedural fallback but authentic WAV is now loaded, replace source
        if (this.stormRainSource && isStormWav && !this.isStormUsingWav) {
            try {
                this.stormRainSource.stop();
                this.stormRainSource.disconnect();
            } catch (e) {}
            this.stormRainSource = null;
        }

        if (this.drizzleRainSource && isDrizzleWav && !this.isDrizzleUsingWav) {
            try {
                this.drizzleRainSource.stop();
                this.drizzleRainSource.disconnect();
            } catch (e) {}
            this.drizzleRainSource = null;
        }

        if (stormBuf && !this.stormRainSource) {
            try {
                this.stormRainSource = this.ctx.createBufferSource();
                this.stormRainSource.buffer = stormBuf;
                this.stormRainSource.loop = true;
                this.stormRainSource.connect(this.stormRainGain);
                this.stormRainSource.start(0);
                this.isStormUsingWav = isStormWav;
            } catch (e) {}
        }

        if (drizzleBuf && !this.drizzleRainSource) {
            try {
                this.drizzleRainSource = this.ctx.createBufferSource();
                this.drizzleRainSource.buffer = drizzleBuf;
                this.drizzleRainSource.loop = true;
                this.drizzleRainSource.connect(this.drizzleRainGain);
                this.drizzleRainSource.start(0);
                this.isDrizzleUsingWav = isDrizzleWav;
            } catch (e) {}
        }
    }

    _triggerNitroBlast() {
        if (!this.ctx || !this.initialized) return;
        const now = this.ctx.currentTime;

        // 1. Visceral Engagement Sub-Bass Thud (Shockwave Impact 140Hz -> 25Hz)
        const blastOsc = this.ctx.createOscillator();
        const blastGain = this.ctx.createGain();
        blastOsc.type = 'sawtooth';
        blastOsc.frequency.setValueAtTime(140, now);
        blastOsc.frequency.exponentialRampToValueAtTime(25, now + 0.35);

        const blastFilter = this.ctx.createBiquadFilter();
        blastFilter.type = 'lowpass';
        blastFilter.frequency.setValueAtTime(450, now);
        blastFilter.frequency.exponentialRampToValueAtTime(80, now + 0.35);

        blastGain.gain.setValueAtTime(0.65, now);
        blastGain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);

        blastOsc.connect(blastFilter);
        blastFilter.connect(blastGain);
        blastGain.connect(this.masterCompressor);

        blastOsc.start(now);
        blastOsc.stop(now + 0.40);

        // 2. Initial NOS Igniter Pop (High-Frequency Transient Click/Crack)
        const popNoise = this.ctx.createBufferSource();
        const bufSize = Math.floor(0.08 * this.ctx.sampleRate);
        const noiseBuf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15));
        }
        popNoise.buffer = noiseBuf;

        const popFilter = this.ctx.createBiquadFilter();
        popFilter.type = 'bandpass';
        popFilter.frequency.value = 3500;
        popFilter.Q.value = 3.0;

        const popGain = this.ctx.createGain();
        popGain.gain.setValueAtTime(0.55, now);
        popGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        popNoise.connect(popFilter);
        popFilter.connect(popGain);
        popGain.connect(this.masterCompressor);

        popNoise.start(now);
    }

    triggerNitroPurge() {
        if (!this.ctx || !this.initialized) return;
        const now = this.ctx.currentTime;

        // Pressurized Nitrous Blow-off Valve Dump & Hiss ("Psssshh-Krrch!")
        const purgeDuration = 0.42;
        const bufferSize = Math.floor(purgeDuration * this.ctx.sampleRate);
        const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
        const left = noiseBuffer.getChannelData(0);
        const right = noiseBuffer.getChannelData(1);

        for (let i = 0; i < bufferSize; i++) {
            const env = Math.exp(-i / (bufferSize * 0.28));
            left[i] = (Math.random() * 2 - 1) * env;
            right[i] = (Math.random() * 2 - 1) * env;
        }

        const purgeSource = this.ctx.createBufferSource();
        purgeSource.buffer = noiseBuffer;

        const purgeHighpass = this.ctx.createBiquadFilter();
        purgeHighpass.type = 'highpass';
        purgeHighpass.frequency.setValueAtTime(1800, now);
        purgeHighpass.frequency.exponentialRampToValueAtTime(3200, now + purgeDuration);

        const purgeGain = this.ctx.createGain();
        purgeGain.gain.setValueAtTime(0.55, now);
        purgeGain.gain.exponentialRampToValueAtTime(0.01, now + purgeDuration);

        purgeSource.connect(purgeHighpass);
        purgeHighpass.connect(purgeGain);
        purgeGain.connect(this.masterCompressor);

        purgeSource.start(now);
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
        const powertrain = vehicle.acceleratingSystem || null;
        const throttleInput = powertrain ? (powertrain.throttleInput || 0) : (speedKmh > 2.5 ? 1 : 0);
        const isThrottle = powertrain ? !!powertrain.isThrottle : throttleInput > 0;

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
        // 5. AAA NITRO BOOST AUDIO (Blast + Dual Turbine Screech + NOS Jet + Purge)
        // =============================================
        if (this.nitroJetGain && this.nitroSubGain && this.nitroTurbineGain) {
            if (isNitro) {
                if (!this.wasNitroActive) {
                    this._triggerNitroBlast(); // Explosive initial blast thud on NOS engagement
                    this.wasNitroActive = true;
                }

                // High-pressure NOS gas rush (Sweeping resonant bandpass 1.8kHz -> 5.5kHz)
                const jetCutoff = 2200 + this.smoothedRpm * 3800;
                this.nitroJetFilter.frequency.setTargetAtTime(jetCutoff, now, 0.04);
                this.nitroJetGain.gain.setTargetAtTime(0.50, now, 0.04);

                // High-speed turbine scream (Sine 1100Hz to 2400Hz)
                const turbineFreq = 1100 + this.smoothedRpm * 1300;
                this.nitroTurbineOsc.frequency.setTargetAtTime(turbineFreq, now, 0.04);
                this.nitroTurbineGain.gain.setTargetAtTime(0.28, now, 0.04);

                // Deep sub-bass thruster pulse (45Hz)
                this.nitroSubGain.gain.setTargetAtTime(0.35, now, 0.04);
            } else {
                if (this.wasNitroActive) {
                    this.triggerNitroPurge(); // Pressurized blow-off purge ("Pssss-Krrch!") on release
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
        // 7. STEREO RAIN CABIN AMBIANCE ENGINE
        // =============================================
        if (!this.stormRainSource || !this.drizzleRainSource) {
            this._startRainLoops();
        }

        if (this.stormRainGain && this.drizzleRainGain && this.rainLowpass) {
            // Weather presets: 0 = STORM, 1 = DRIZZLE, 2 = CLOUDY DAY (OVERCAST RAIN), 3 = CLEAR
            let targetStormVol = 0.0;
            let targetDrizzleVol = 0.0;

            if (weatherType === 0) { // STORM
                targetStormVol = 0.75;
                targetDrizzleVol = 0.25;
            } else if (weatherType === 1) { // DRIZZLE
                targetStormVol = 0.12;
                targetDrizzleVol = 0.65;
            } else if (weatherType === 2) { // CLOUDY DAY (OVERCAST DAYTIME RAIN)
                targetStormVol = 0.50;
                targetDrizzleVol = 0.35;
            }

            // Speed-based rain impact frequency modulation:
            // Stopped/Idle (0 KM/H) -> 3200Hz filter cutoff (crisp rain drops on stationary windshield)
            // Driving (200 KM/H) -> sweeps lowpass filter up to 8500Hz (intense windshield impact)
            const speedRatio = Math.max(0, Math.min(1.0, speedKmh / 200));
            const targetCutoff = 3200 + speedRatio * 5300;

            this.stormRainGain.gain.setTargetAtTime(targetStormVol, now, 0.08);
            this.drizzleRainGain.gain.setTargetAtTime(targetDrizzleVol, now, 0.08);
            this.rainLowpass.frequency.setTargetAtTime(targetCutoff, now, 0.08);
        }
    }
}