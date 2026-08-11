import * as THREE from 'three';
import { createRainPass } from './rainShader.js';
import { Raindrops } from './raindrops.js';

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

        // 1. Add GLSL Rain Refraction Pass to EffectComposer
        this.rainPass = createRainPass();
        this.composer.addPass(this.rainPass);

        // 2. Initialize Lucas Bebber 2D Raindrops Physics Canvas
        this._initRaindropsPhysics();

        // 3. Add tire splash mist
        this._initTireMist();

        // 4. Apply wet asphalt mirror look
        this._applyWetRoad();

        this.clockTime = 0;
        this.gForce = new THREE.Vector2(0, 0);

        // Weather Modes: 0 = Heavy Storm, 1 = Drizzle, 2 = Snow, 3 = Clear
        this.weatherType = 0;
        this.lightningTimer = 0;
        this.lightningFlash = 0;
    }

    _initRaindropsPhysics() {
        // Create initial placeholder texture
        const placeholderCanvas = document.createElement('canvas');
        placeholderCanvas.width = 1;
        placeholderCanvas.height = 1;
        this.waterTexture = new THREE.CanvasTexture(placeholderCanvas);
        this.rainPass.uniforms.uWaterMap.value = this.waterTexture;

        const textureLoader = new THREE.TextureLoader();
        let dropAlphaImg = null;
        let dropColorImg = null;

        textureLoader.load('assets/rain/drop-alpha.png', (tex) => {
            dropAlphaImg = tex.image;
            this._tryStartRaindrops(dropAlphaImg, dropColorImg);
        });

        textureLoader.load('assets/rain/drop-color.png', (tex) => {
            dropColorImg = tex.image;
            this._tryStartRaindrops(dropAlphaImg, dropColorImg);
        });
    }

    _tryStartRaindrops(dropAlphaImg, dropColorImg) {
        if (!dropAlphaImg || !dropColorImg || this.raindrops) return;

        this.raindrops = new Raindrops(
            512,
            288,
            1,
            dropAlphaImg,
            dropColorImg,
            {
                minR: 12,
                maxR: 38,
                maxDrops: 1000,
                rainChance: 0.35,
                rainLimit: 4,
                dropletsRate: 40,
                spawnArea: [0.0, 1.0], // Full windshield coverage (top, center, sides)
                windSpread: 0.0,
            },
        );

        this.waterTexture = new THREE.CanvasTexture(this.raindrops.canvas);
        this.waterTexture.minFilter = THREE.LinearFilter;
        this.waterTexture.magFilter = THREE.LinearFilter;
        this.rainPass.uniforms.uWaterMap.value = this.waterTexture;
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
            this.raindrops.options.raining = (type === 0 || type === 1);
        }
    }

    update(dt) {
        this.clockTime += dt;
        const carPos = this.vehicle.mesh.position;
        const speed = Math.abs(this.vehicle.speed);
        const speedRatio = Math.min(speed / 70.0, 1.6); // Wind speed ratio

        // 1. Dynamic Speed & Wind Rain Physics Tuning
        if (this.raindrops) {
            // Wind Outward Radial Spread scales directly with car speed!
            this.raindrops.options.windSpread = speedRatio * 2.2;

            if (this.weatherType === 0) { // STORM
                this.raindrops.options.raining = true;
                // High speed = more droplets hitting glass + faster falling/sliding wind momentum
                this.raindrops.options.rainChance = 0.35 + speedRatio * 0.45;
                this.raindrops.options.dropletsRate = 40 + speedRatio * 60;
                this.raindrops.options.dropFallMultiplier = 1.0 + speedRatio * 2.8;
                this.raindrops.options.globalTimeScale = 1.0 + speedRatio * 1.6;
            } else if (this.weatherType === 1) { // DRIZZLE
                this.raindrops.options.raining = true;
                // Drizzle = fewer droplets, gentle falling
                this.raindrops.options.rainChance = 0.12 + speedRatio * 0.18;
                this.raindrops.options.dropletsRate = 12 + speedRatio * 20;
                this.raindrops.options.dropFallMultiplier = 0.7 + speedRatio * 1.5;
                this.raindrops.options.globalTimeScale = 0.8 + speedRatio * 1.0;
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

        // 4. Update Raindrops 2D Physics Canvas Texture (Only when raining)
        if (this.raindrops && this.waterTexture && this.weatherType !== 3) {
            this.raindrops.update();
            this.waterTexture.needsUpdate = true;
        }

        // 5. Update GLSL Shader Uniforms for Rain Refraction Pass
        this.rainPass.uniforms.uTime.value = this.clockTime;
        this.rainPass.uniforms.uSpeed.value = speed;
        this.rainPass.uniforms.uGForce.value.copy(this.gForce);
        this.rainPass.uniforms.uWeatherType.value = this.weatherType;
        this.rainPass.uniforms.uLightningFlash.value = this.lightningFlash;

        // 6. Update tire spray mist
        this._updateTireMist(dt, carPos, speed);
    }
}
