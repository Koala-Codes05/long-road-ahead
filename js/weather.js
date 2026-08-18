import * as THREE from 'three';
import { createRainPass } from './rainShader.js';
import { Raindrops } from './raindrops.js';
import { RainVolume3D } from './weather/particles/RainVolume3D.js';
import { FarRainPoints } from './weather/particles/FarRainPoints.js';
import { RainLighting } from './weather/lighting/RainLighting.js';

/**
 * WeatherSystem — Driveclub Screen-Space Weather Engine powered by Lucas Bebber's Raindrops Engine.
 * Features:
 *  - Radial Wind Outward Physics (high speed blows droplets UP, LEFT, RIGHT, & OUTWARD from center)
 *  - Weather Presets (Storm: high density, Drizzle: gentle low density)
 *  - Dynamic 2D canvas raindrop physics simulation (waterMap)
 *  - G-Force Droplet Inertia Physics (droplets slide sideways during cornering)
 *  - Wet Asphalt Specular Reflections & Tire Spray Mist
 */
export class WeatherSystem {
    constructor(scene, vehicle, world, composer) {
        this.scene = scene;
        this.vehicle = vehicle;
        this.world = world;
        this.composer = composer;

        // Weather Modes & State Variables (Must be defined first!)
        this.weatherType = 0; // 0 = Heavy Storm, 1 = Drizzle, 2 = Cloudy Day, 3 = Clear
        this.lightningTimer = 0;
        this.lightningFlash = 0;
        this.rainModeIndex = 0;
        this.rainModes = ['thirdPerson', 'classic', 'light'];
        this.rainModeNames = ['3RD CAMERA RAIN', 'CLASSIC GLASS', 'LIGHT DROPS'];

        this.clockTime = 0;
        this.gForce = new THREE.Vector2(0, 0);
        this.windVector = new THREE.Vector2(0.5, 0.2);

        // 1. Add GLSL Rain Refraction Pass to EffectComposer
        this.rainPass = createRainPass();
        if (this.composer) {
            this.composer.addPass(this.rainPass);
        }

        // 2. Initialize Lucas Bebber 2D Raindrops Physics Canvas
        this._initRaindropsPhysics();

        // 3. Add tire splash mist
        this._initTireMist();

        // 4. Apply wet asphalt mirror look
        this._applyWetRoad();

        this.rainLighting = new RainLighting(this.vehicle, this.world);
        this.rainVolume3D = new RainVolume3D(this.scene, this.rainLighting);
        this.farRainPoints = new FarRainPoints(this.scene);
    }

    _createProceduralDropAlpha() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
        g.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        g.addColorStop(0.7, 'rgba(255, 255, 255, 0.85)');
        g.addColorStop(0.95, 'rgba(255, 255, 255, 0.3)');
        g.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
        return canvas;
    }

    _createProceduralDropColor() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(64, 64);
        const data = imgData.data;
        for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 64; x++) {
                const idx = (y * 64 + x) * 4;
                const nx = (x - 32) / 32;
                const ny = (y - 32) / 32;
                const dist = Math.sqrt(nx * nx + ny * ny);
                if (dist <= 1.0) {
                    const nz = Math.sqrt(Math.max(0.0, 1.0 - dist * dist));
                    data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
                    data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
                    data[idx + 2] = Math.floor(nz * 255);
                    data[idx + 3] = 255;
                } else {
                    data[idx] = 128; data[idx + 1] = 128; data[idx + 2] = 255; data[idx + 3] = 0;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return canvas;
    }

    _initRaindropsPhysics() {
        // Start immediately with procedural drop textures so raindrops render from second 0
        const procAlpha = this._createProceduralDropAlpha();
        const procColor = this._createProceduralDropColor();
        this._tryStartRaindrops(procAlpha, procColor);

        // Optionally upgrade to PNG assets if loaded successfully
        const textureLoader = new THREE.TextureLoader();
        let dropAlphaImg = null;
        let dropColorImg = null;

        textureLoader.load('assets/rain/drop-alpha.png', (tex) => {
            dropAlphaImg = tex.image;
            if (dropColorImg && this.raindrops) {
                this.raindrops.dropAlpha = dropAlphaImg;
                this.raindrops.dropColor = dropColorImg;
                this.raindrops.renderDropsGfx();
            }
        });

        textureLoader.load('assets/rain/drop-color.png', (tex) => {
            dropColorImg = tex.image;
            if (dropAlphaImg && this.raindrops) {
                this.raindrops.dropAlpha = dropAlphaImg;
                this.raindrops.dropColor = dropColorImg;
                this.raindrops.renderDropsGfx();
            }
        });
    }

    _tryStartRaindrops(dropAlphaImg, dropColorImg) {
        if (!dropAlphaImg || !dropColorImg || this.raindrops) return;

        this.raindrops = new Raindrops(
            window.innerWidth,
            window.innerHeight,
            1,
            dropAlphaImg,
            dropColorImg,
            {
                minR: 12,
                maxR: 38,
                maxDrops: 650,
                rainChance: 0.35,
                rainLimit: 3,
                dropletsRate: 30,
                spawnArea: [0.0, 1.0], // Full windshield coverage (top, center, sides)
                windSpread: 0.0,
            },
        );

        this.waterTexture = new THREE.CanvasTexture(this.raindrops.canvas);
        this.waterTexture.minFilter = THREE.LinearFilter;
        this.waterTexture.magFilter = THREE.LinearFilter;
        this.rainPass.uniforms.uWaterMap.value = this.waterTexture;
        this.setWeather(this.weatherType);
    }

    _initTireMist() {
        this.mistCount = 250;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.mistCount * 3);

        for (let i = 0; i < this.mistCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 4;
            positions[i * 3 + 1] = Math.random() * 0.5;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            size: 1.4,
            color: 0x99ccff,
            transparent: true,
            opacity: 0.0, // Invisible when car is stationary at start
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.mist = new THREE.Points(geo, mat);
        this.scene.add(this.mist);
    }

    _updateTireMist(dt, carPos, speed) {
        if (!this.mist) return;

        // Mist particles only spawn when the car is actively moving on wet roads
        const isMovingOnWet = speed > 2.0 && this.weatherType !== 3;
        const targetOpacity = isMovingOnWet ? Math.min((speed / 40.0) * 0.3, 0.3) : 0.0;

        // Smooth opacity transition
        this.mist.material.opacity = THREE.MathUtils.lerp(
            this.mist.material.opacity,
            targetOpacity,
            dt * 8.0
        );

        if (this.mist.material.opacity < 0.01) return;

        const positions = this.mist.geometry.attributes.position.array;
        const heading = this.vehicle.heading;

        for (let i = 0; i < this.mistCount; i++) {
            const idx = i * 3;
            positions[idx + 1] += dt * (1 + speed * 0.05);

            if (positions[idx + 1] > 2.2) {
                positions[idx] = carPos.x + (Math.random() - 0.5) * 2.2;
                positions[idx + 1] = carPos.y + 0.1;
                positions[idx + 2] = carPos.z + Math.cos(heading) * 2.0 + (Math.random() - 0.5) * 1.5;
            }
        }
        this.mist.geometry.attributes.position.needsUpdate = true;
    }

    _applyWetRoad() {
        if (this.world.roadMat) {
            this.world.roadMat.roughness = 0.06;
            this.world.roadMat.metalness = 0.92;
        }
        if (this.world.sidewalkMat) {
            this.world.sidewalkMat.roughness = 0.20;
        }
    }

    setWeather(type) {
        this.weatherType = type;
        if (this.rainPass) {
            this.rainPass.uniforms.uWeatherType.value = type;
        }
        if (this.raindrops) {
            this.raindrops.options.raining = (type === 0 || type === 1 || type === 2);
            this._applyRainModePreset();
        }
    }

    setRainMode(index = null) {
        if (index === null) {
            this.rainModeIndex = (this.rainModeIndex + 1) % this.rainModes.length;
        } else {
            this.rainModeIndex = Math.max(0, Math.min(this.rainModes.length - 1, index));
        }
        this._applyRainModePreset();
        return this.getRainModeName();
    }

    getRainModeName() {
        return this.rainModeNames[this.rainModeIndex] || this.rainModeNames[0];
    }

    _applyRainModePreset() {
        if (!this.raindrops) return;

        const rainModes = this.rainModes || ['thirdPerson', 'classic', 'light'];
        const index = typeof this.rainModeIndex === 'number' ? this.rainModeIndex : 0;
        const mode = rainModes[index] || 'thirdPerson';
        if (mode === 'classic') {
            this.raindrops.options.minR = 1.8;
            this.raindrops.options.maxR = 12.0;
            this.raindrops.options.maxDrops = 300;
            this.raindrops.options.rainLimit = 4;
            this.raindrops.options.dropletsSize = [0.6, 2.2];
            this.raindrops.options.trailRate = 0.8;
        } else if (mode === 'light') {
            this.raindrops.options.minR = 1.0;
            this.raindrops.options.maxR = 7.0;
            this.raindrops.options.maxDrops = 150;
            this.raindrops.options.rainLimit = 2;
            this.raindrops.options.dropletsSize = [0.4, 1.4];
            this.raindrops.options.trailRate = 0.5;
        } else {
            this.raindrops.options.minR = 1.4;
            this.raindrops.options.maxR = 10.0;
            this.raindrops.options.maxDrops = 250;
            this.raindrops.options.rainLimit = 3;
            this.raindrops.options.dropletsSize = [0.5, 1.8];
            this.raindrops.options.trailRate = 0.7;
        }
    }

    update(dt, cameraMode = 0, camera = null) {
        this.clockTime += dt;
        if (!this.vehicle) return;
        const carMesh = this.vehicle.mesh || (this.vehicle.position ? this.vehicle : null);
        if (!carMesh || !carMesh.position) return;

        const carPos = carMesh.position;
        const speed = Math.abs(this.vehicle.speed || 0);
        const speedRatio = Math.min(speed / 70.0, 1.6); // Wind speed ratio
        const windIntensity = this.weatherType === 0 ? 0.85 : (this.weatherType === 1 ? 0.45 : (this.weatherType === 2 ? 0.65 : 0.0));
        const targetWindX = Math.sin(this.clockTime * 0.18) * 0.75 * windIntensity;
        const targetWindY = Math.cos(this.clockTime * 0.25) * 0.35 * windIntensity;

        this.windVector.x = THREE.MathUtils.lerp(this.windVector.x, targetWindX, dt * 1.5);
        this.windVector.y = THREE.MathUtils.lerp(this.windVector.y, targetWindY, dt * 1.5);

        // 1. Dynamic Speed & Wind Rain Physics Tuning
        if (this.raindrops) {
            // Wind Outward Radial Spread scales directly with car speed!
            this.raindrops.options.windSpread = 0.5 + speedRatio * 3.5;

            if (this.weatherType === 0) { // STORM
                this.raindrops.options.raining = true;
                // High speed = more droplets hitting glass + faster falling/sliding wind momentum
                const isLightMode = this.rainModes[this.rainModeIndex] === 'light';
                this.raindrops.options.rainChance = (isLightMode ? 0.18 : 0.28) + speedRatio * (isLightMode ? 0.20 : 0.32);
                this.raindrops.options.dropletsRate = (isLightMode ? 16 : 28) + speedRatio * (isLightMode ? 24 : 42);
                this.raindrops.options.dropFallMultiplier = 1.5 + speedRatio * 3.5;
                this.raindrops.options.globalTimeScale = 1.2 + speedRatio * 2.0;
            } else if (this.weatherType === 1) { // DRIZZLE
                this.raindrops.options.raining = true;
                // Drizzle = fewer droplets, gentle falling
                const isLightMode = this.rainModes[this.rainModeIndex] === 'light';
                this.raindrops.options.rainChance = (isLightMode ? 0.06 : 0.10) + speedRatio * (isLightMode ? 0.08 : 0.14);
                this.raindrops.options.dropletsRate = (isLightMode ? 5 : 9) + speedRatio * (isLightMode ? 8 : 14);
                this.raindrops.options.dropFallMultiplier = 1.0 + speedRatio * 2.0;
                this.raindrops.options.globalTimeScale = 1.0 + speedRatio * 1.5;
            } else if (this.weatherType === 2) { // CLOUDY DAY (DAYTIME STORM)
                this.raindrops.options.raining = true;
                const isLightMode = this.rainModes[this.rainModeIndex] === 'light';
                this.raindrops.options.rainChance = (isLightMode ? 0.15 : 0.24) + speedRatio * (isLightMode ? 0.18 : 0.28);
                this.raindrops.options.dropletsRate = (isLightMode ? 14 : 24) + speedRatio * (isLightMode ? 20 : 36);
                this.raindrops.options.dropFallMultiplier = 1.2 + speedRatio * 3.0;
                this.raindrops.options.globalTimeScale = 1.1 + speedRatio * 1.8;
            } else {
                this.raindrops.options.raining = false;
            }
        }

        // 2. Calculate Droplet G-Force Physics
        const targetGForceX = (this.vehicle.steerAngle || 0) * (speed / 30.0);
        const targetGForceY = (this.vehicle.speed > 0 ? 0.05 : -0.05) * (speed / 40.0);

        this.gForce.x = THREE.MathUtils.lerp(this.gForce.x, targetGForceX, dt * 6.0);
        this.gForce.y = THREE.MathUtils.lerp(this.gForce.y, targetGForceY, dt * 6.0);

        // 3. Storm Lightning Flashes
        if (this.weatherType === 0) {
            this.lightningTimer += dt;
            if (this.lightningTimer > 7.0 + Math.random() * 7.0) {
                this.lightningFlash = 1.0;
                this.lightningTimer = 0;
            }
            if (this.lightningFlash > 0.0) {
                this.lightningFlash = Math.max(0.0, this.lightningFlash - dt * 4.0);
            }
        } else {
            this.lightningFlash = 0.0;
        }

        // 4. Update 3D falling rain volume so weather still reads as rain in the world
        this.rainLighting.update(dt);
        const highSpeedOpacity = 1.0 - Math.min(speedRatio, 1.0) * 0.2;
        const targetIntensity = (this.weatherType === 0 ? 0.75 : (this.weatherType === 1 ? 0.28 : (this.weatherType === 2 ? 0.55 : 0.0))) * highSpeedOpacity;
        this.rainVolume3D.update(dt, camera, this.clockTime, targetIntensity, this.windVector, cameraMode);
        this.farRainPoints.update(dt, camera, this.clockTime, targetIntensity, this.windVector, cameraMode);

        // 5. Update Raindrops 2D Physics Canvas Texture
        if (this.raindrops && this.waterTexture) {
            this.raindrops.update();
            this.waterTexture.needsUpdate = true;
        }

        // 6. Update GLSL Shader Uniforms for Rain Refraction Pass
        this.rainPass.uniforms.uTime.value = this.clockTime;
        this.rainPass.uniforms.uSpeed.value = speed;
        this.rainPass.uniforms.uGForce.value.copy(this.gForce);
        this.rainPass.uniforms.uWeatherType.value = this.weatherType;
        this.rainPass.uniforms.uLightningFlash.value = this.lightningFlash;

        // 7. Update tire spray mist
        this._updateTireMist(dt, carPos, speed);

        // 8. Dynamic Wet Road Line Emissive Glow Physics (Triggers ONLY when raining AND speed >= 200 KM/H)
        if (this.world && this.world.whiteLineMat && this.world.yellowLineMat) {
            const isRaining = (this.weatherType === 0 || this.weatherType === 1);
            const speedKmh = this.vehicle && this.vehicle.getSpeedKmh ? this.vehicle.getSpeedKmh() : (speed * 3.6);

            // Smooth ramp between 180 KM/H and 200+ KM/H
            const speedRamp = THREE.MathUtils.clamp((speedKmh - 180.0) / 20.0, 0.0, 1.0);
            const isGlowActive = isRaining && speedKmh >= 180.0;

            let targetWhiteIntensity = 0.0;
            let targetYellowIntensity = 0.0;
            let targetWhiteEmissive = 0x222222;
            let targetYellowEmissive = 0x442200;

            if (isGlowActive) {
                if (this.weatherType === 0) { // Heavy Storm Rain at 200+ KM/H
                    targetWhiteIntensity = 1.8 * speedRamp;
                    targetYellowIntensity = 2.0 * speedRamp;
                    targetWhiteEmissive = 0xffffff;
                    targetYellowEmissive = 0xffaa00;
                } else if (this.weatherType === 1) { // Drizzle Light Rain at 200+ KM/H
                    targetWhiteIntensity = 1.1 * speedRamp;
                    targetYellowIntensity = 1.3 * speedRamp;
                    targetWhiteEmissive = 0xdddddd;
                    targetYellowEmissive = 0xff9900;
                }
            }

            const lerpSpeed = dt * 4.0;
            this.world.whiteLineMat.emissiveIntensity = THREE.MathUtils.lerp(
                this.world.whiteLineMat.emissiveIntensity,
                targetWhiteIntensity,
                lerpSpeed
            );
            this.world.yellowLineMat.emissiveIntensity = THREE.MathUtils.lerp(
                this.world.yellowLineMat.emissiveIntensity,
                targetYellowIntensity,
                lerpSpeed
            );
            this.world.whiteLineMat.emissive.lerp(new THREE.Color(targetWhiteEmissive), lerpSpeed);
            this.world.yellowLineMat.emissive.lerp(new THREE.Color(targetYellowEmissive), lerpSpeed);
        }
    }
}
