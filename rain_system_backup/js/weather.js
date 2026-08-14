import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { createRainPass } from './rainShader.js';
import { Raindrops } from './raindrops.js';

/**
 * WeatherSystem — Driveclub Screen-Space Weather Engine powered by Lucas Bebber's Raindrops Engine
 * with 3D Circular Rain Ripples on ground asphalt and car hood.
 */
export class WeatherSystem {
    constructor(scene, vehicle, world, composer, skyController = null) {
        this.scene = scene;
        this.vehicle = vehicle;
        this.world = world;
        this.composer = composer;
        this.skyController = skyController;

        // 1. Add GLSL Rain Refraction Pass to EffectComposer
        this.rainPass = createRainPass();
        this.rainPass.uniforms.uRenderShine.value = false;
        this.composer.addPass(this.rainPass);

        // 2. Initialize Lucas Bebber 2D Raindrops Physics Canvas & Textures
        this._initRaindropsPhysics();

        // 3. Add tire splash mist
        this._initTireMist();

        // 4. Apply wet asphalt mirror look
        this._applyWetRoad();

        // 6. Volumetric Night Cloud Layer
        this._initVolumetricClouds();

        this.clockTime = 0;
        this.gForce = new THREE.Vector2(0, 0);

        // Weather Modes: 0 = Heavy Storm, 1 = Drizzle, 3 = Clear
        this.weatherType = 0;
        this.lightningTimer = 0;
        this.lightningFlash = 0;
        this.lightningTimeoutId = null;
        this.lightningIntervalId = null;

        window.addEventListener('resize', () => {
            if (this.rainPass) {
                this.rainPass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
            }
        });
    }

    _initRaindropsPhysics() {
        const placeholderCanvas = document.createElement('canvas');
        placeholderCanvas.width = 1;
        placeholderCanvas.height = 1;
        this.waterTexture = new THREE.CanvasTexture(placeholderCanvas);
        this.rainPass.uniforms.uWaterMap.value = this.waterTexture;

        const textureLoader = new THREE.TextureLoader();
        let dropAlphaImg = null;
        let dropColorImg = null;

        textureLoader.load('assets/rain/drop-shine.png', (tex) => {
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            this.rainPass.uniforms.uTextureShine.value = tex;
            this.rainPass.uniforms.uRenderShine.value = true;
        });

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

        // Fixed high-performance physics resolution (512 width, scaled height)
        const simW = 512;
        const simH = Math.round(512 * (window.innerHeight / window.innerWidth));

        this.raindrops = new Raindrops(
            simW,
            simH,
            1,
            dropAlphaImg,
            dropColorImg,
            {
                minR: 8,
                maxR: 35,
                maxDrops: 500,
                rainChance: 0.60,
                rainLimit: 7,
                dropletsRate: 60,
                dropletsSize: [2.0, 7.0],
                trailRate: 1,
                trailScaleRange: [0.15, 0.3],
                spawnArea: [-0.1, 1.0],
                windSpread: 0.8,
            },
        );

        this.waterTexture = new THREE.CanvasTexture(this.raindrops.canvas);
        this.waterTexture.minFilter = THREE.LinearFilter;
        this.waterTexture.magFilter = THREE.LinearFilter;
        this.rainPass.uniforms.uWaterMap.value = this.waterTexture;

        this._setupLightningFlicker();
    }

    _initTireMist() {
        this.mistCount = 450;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.mistCount * 3);

        for (let i = 0; i < this.mistCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 4;
            positions[i * 3 + 1] = Math.random() * 0.5;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            size: 2.0,
            color: 0x88ccff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.mist = new THREE.Points(geo, mat);
        this.scene.add(this.mist);
    }

    _updateTireMist(dt, carPos, speed) {
        if (!this.mist) return;

        const isMovingOnWet = speed > 2.0 && this.weatherType !== 3;
        const targetOpacity = isMovingOnWet ? Math.min((speed / 40.0) * 0.45, 0.45) : 0.0;

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
            positions[idx + 1] += dt * (1.2 + speed * 0.07);

            if (positions[idx + 1] > 2.4) {
                positions[idx] = carPos.x + (Math.random() - 0.5) * 2.4;
                positions[idx + 1] = carPos.y + 0.1;
                positions[idx + 2] = carPos.z + Math.cos(heading) * 2.0 + (Math.random() - 0.5) * 1.8;
            }
        }
        this.mist.geometry.attributes.position.needsUpdate = true;
    }

    _applyWetRoad() {
        if (this.world.roadMat) {
            this.world.roadMat.roughness = 0.04;
            this.world.roadMat.metalness = 0.95;
        }
        if (this.world.sidewalkMat) {
            this.world.sidewalkMat.roughness = 0.15;
        }
    }

    _setupLightningFlicker() {
        if (this.lightningIntervalId) clearInterval(this.lightningIntervalId);

        const scheduleFlicker = () => {
            if (this.weatherType === 0) { // Storm
                const flicker = Math.random() * 2.0;
                this.lightningFlash = flicker;
                this.rainPass.uniforms.uLightningFlash.value = flicker;

                this.lightningTimeoutId = setTimeout(() => {
                    this.lightningFlash = 0.0;
                    this.rainPass.uniforms.uLightningFlash.value = 0.0;
                }, 100 + Math.random() * 200);
            } else {
                this.lightningFlash = 0.0;
                this.rainPass.uniforms.uLightningFlash.value = 0.0;
            }
        };

        this.lightningIntervalId = setInterval(scheduleFlicker, 2000 + Math.random() * 3000);
    }

    setWeather(type) {
        this.weatherType = type;
        if (this.rainPass) {
            this.rainPass.uniforms.uWeatherType.value = type;
        }

        if (this.skyController) {
            const { skyParameters, skyUniforms, updateSun } = this.skyController;
            if (type === 0) { // STORM
                skyParameters.elevation = -4.0;
                skyParameters.azimuth = 180;
                skyParameters.exposure = 0.005;
                skyUniforms['turbidity'].value = 20;
                skyUniforms['rayleigh'].value = 0.15;
                skyUniforms['mieCoefficient'].value = 0.02;
                skyUniforms['mieDirectionalG'].value = 0.3;
            } else if (type === 1) { // DRIZZLE
                skyParameters.elevation = -3.0;
                skyParameters.azimuth = 180;
                skyParameters.exposure = 0.008;
                skyUniforms['turbidity'].value = 15;
                skyUniforms['rayleigh'].value = 0.8;
                skyUniforms['mieCoefficient'].value = 0.01;
                skyUniforms['mieDirectionalG'].value = 0.35;
            } else { // CLEAR
                skyParameters.elevation = -2.0;
                skyParameters.azimuth = 180;
                skyParameters.exposure = 0.012;
                skyUniforms['turbidity'].value = 10;
                skyUniforms['rayleigh'].value = 2.0;
                skyUniforms['mieCoefficient'].value = 0.005;
                skyUniforms['mieDirectionalG'].value = 0.4;
            }
            if (updateSun) updateSun();
        }

        if (this.raindrops) {
            this.raindrops.clearDrops();

            if (type === 0) { // STORM
                this.raindrops.options.raining = true;
                this.raindrops.options.minR = 8.5;
                this.raindrops.options.maxR = 38;
                this.raindrops.options.rainChance = 0.65;
                this.raindrops.options.rainLimit = 8;
                this.raindrops.options.dropletsRate = 70;
                this.raindrops.options.dropletsSize = [2.2, 7.5];
                this.raindrops.options.trailRate = 1;
                this.raindrops.options.trailScaleRange = [0.15, 0.3];
                this.raindrops.options.spawnArea = [-0.1, 1.0];
            } else if (type === 1) { // DRIZZLE
                this.raindrops.options.raining = true;
                this.raindrops.options.minR = 5.5;
                this.raindrops.options.maxR = 24;
                this.raindrops.options.rainChance = 0.30;
                this.raindrops.options.rainLimit = 4;
                this.raindrops.options.dropletsRate = 35;
                this.raindrops.options.dropletsSize = [1.5, 4.5];
                this.raindrops.options.trailRate = 1;
                this.raindrops.options.trailScaleRange = [0.2, 0.35];
                this.raindrops.options.spawnArea = [-0.1, 1.0];
            } else { // CLEAR
                this.raindrops.options.raining = false;
            }
        }
    }

    update(dt) {
        this.clockTime += dt;
        const carPos = this.vehicle.mesh.position;
        const speed = Math.abs(this.vehicle.speed);
        const speedRatio = Math.min(speed / 70.0, 1.8);

        // Dynamic Speed & Wind Rain Physics Tuning
        if (this.raindrops) {
            // Stationary / low speed: windSpread = 0.0 -> drops fall TOP TO BOTTOM under gravity
            // Moving fast: windSpread scales up rapidly -> drops hit windshield fast & blow outward radially!
            this.raindrops.options.windSpread = speedRatio > 0.05 ? (speedRatio * 4.5) : 0.0;

            if (this.weatherType === 0) { // STORM
                this.raindrops.options.raining = true;
                this.raindrops.options.rainChance = 0.45 + speedRatio * 0.45;
                this.raindrops.options.dropletsRate = 45 + speedRatio * 80;
                this.raindrops.options.dropFallMultiplier = 1.0 + speedRatio * 4.5;
                this.raindrops.options.globalTimeScale = 0.8 + speedRatio * 3.2;

                if (speedRatio < 0.08) {
                    this.raindrops.options.spawnArea = [-0.15, 0.85]; // Top-to-bottom gravity fall across screen when static
                } else {
                    this.raindrops.options.spawnArea = [0.0, 1.0];     // Full face-on windshield impact when fast!
                }
            } else if (this.weatherType === 1) { // DRIZZLE
                this.raindrops.options.raining = true;
                this.raindrops.options.rainChance = 0.20 + speedRatio * 0.25;
                this.raindrops.options.dropletsRate = 20 + speedRatio * 35;
                this.raindrops.options.dropFallMultiplier = 0.8 + speedRatio * 2.5;
                this.raindrops.options.globalTimeScale = 0.7 + speedRatio * 2.0;

                if (speedRatio < 0.08) {
                    this.raindrops.options.spawnArea = [-0.15, 0.85];
                } else {
                    this.raindrops.options.spawnArea = [0.0, 1.0];
                }
            } else {
                this.raindrops.options.raining = false;
            }
        }

        // Droplet G-Force Physics
        const targetGForceX = (this.vehicle.steerAngle || 0) * (speed / 30.0);
        const targetGForceY = (this.vehicle.speed > 0 ? 0.05 : -0.05) * (speed / 40.0);

        this.gForce.x = THREE.MathUtils.lerp(this.gForce.x, targetGForceX, dt * 6.0);
        this.gForce.y = THREE.MathUtils.lerp(this.gForce.y, targetGForceY, dt * 6.0);

        // Update Raindrops 2D Physics Canvas Texture
        if (this.raindrops && this.waterTexture) {
            this.raindrops.update(dt);
            this.waterTexture.needsUpdate = true;
        }

        // Update GLSL Shader Uniforms for Rain Refraction Pass
        this.rainPass.uniforms.uTime.value = this.clockTime;
        this.rainPass.uniforms.uSpeed.value = speed;
        this.rainPass.uniforms.uGForce.value.copy(this.gForce);
        this.rainPass.uniforms.uWeatherType.value = this.weatherType;

        // Update cloud dome position & drifting texture
        if (this.cloudDome) {
            this.cloudDome.position.copy(carPos);
            if (this.cloudTex) {
                this.cloudTex.offset.x += dt * 0.005;
                this.cloudTex.offset.y += dt * 0.002;
            }
            if (this.cloudMat) {
                const baseEmissive = this.weatherType === 0 ? 0.3 : 0.6;
                this.cloudMat.emissiveIntensity = baseEmissive + this.lightningFlash * 2.5;
            }
        }

        // Update tire spray mist
        this._updateTireMist(dt, carPos, speed);
    }

    _initVolumetricClouds() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#050712';
        ctx.fillRect(0, 0, 512, 512);

        // Soft cloud puff gradients
        for (let i = 0; i < 40; i++) {
            const cx = Math.random() * 512;
            const cy = Math.random() * 512;
            const cr = 60 + Math.random() * 120;
            const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, cr);
            grad.addColorStop(0, 'rgba(40, 50, 75, 0.45)');
            grad.addColorStop(0.5, 'rgba(20, 25, 40, 0.25)');
            grad.addColorStop(1, 'rgba(5, 7, 18, 0.0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, cr, 0, Math.PI * 2);
            ctx.fill();
        }

        const cloudTex = new THREE.CanvasTexture(canvas);
        cloudTex.wrapS = THREE.RepeatWrapping;
        cloudTex.wrapT = THREE.RepeatWrapping;
        cloudTex.repeat.set(4, 4);
        this.cloudTex = cloudTex;

        this.cloudMat = new THREE.MeshStandardMaterial({
            map: cloudTex,
            transparent: true,
            opacity: 0.65,
            emissive: 0x111528,
            emissiveIntensity: 0.5,
            side: THREE.BackSide,
            depthWrite: false,
        });

        const cloudGeo = new THREE.SphereGeometry(1800, 32, 16);
        this.cloudDome = new THREE.Mesh(cloudGeo, this.cloudMat);
        this.scene.add(this.cloudDome);
    }
}

