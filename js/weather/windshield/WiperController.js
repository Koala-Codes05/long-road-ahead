import * as THREE from 'three';
import { Raindrops } from '../../raindrops.js';

/**
 * WiperController — Manages 2D screen-space glass droplet physics (Raindrops),
 * wiper sweep clearance physics, and vehicle body paint clearcoat wetness.
 */
export class WiperController {
    constructor(windshieldPass, vehicle, rainModeNames, rainModes) {
        this.windshieldPass = windshieldPass;
        this.vehicle = vehicle;
        this.rainModeNames = rainModeNames;
        this.rainModes = rainModes;

        this.raindrops = null;
        this.waterTexture = null;

        this.wiperTimer = 0;
        this.wiperAngle = 0;
        this.wiperState = 'idle';
        this.wiperSpeed = 4.5;
        this.wetness = 0.0;

        this._initRaindropsPhysics();
    }

    _initRaindropsPhysics() {
        const placeholderCanvas = document.createElement('canvas');
        placeholderCanvas.width = 1;
        placeholderCanvas.height = 1;
        this.waterTexture = new THREE.CanvasTexture(placeholderCanvas);

        if (this.windshieldPass && this.windshieldPass.rainPass) {
            this.windshieldPass.rainPass.uniforms.uWaterMap.value = this.waterTexture;
        }

        const textureLoader = new THREE.TextureLoader();
        let dropAlphaImg = null;
        let dropColorImg = null;

        textureLoader.load('assets/rain/drop-shine.png', (tex) => {
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            if (this.windshieldPass && this.windshieldPass.rainPass) {
                this.windshieldPass.rainPass.uniforms.uTextureShine.value = tex;
                this.windshieldPass.rainPass.uniforms.uRenderShine.value = true;
            }
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

        const simW = 512;
        const simH = Math.round(512 * (window.innerHeight / window.innerWidth));

        this.raindrops = new Raindrops(
            simW,
            simH,
            1,
            dropAlphaImg,
            dropColorImg,
            {
                minR: 3.5,
                maxR: 24.0,
                maxDrops: 450,
                rainChance: 0.55,
                rainLimit: 8,
                dropletsRate: 50,
                dropletsSize: [1.2, 4.5],
                trailRate: 0.85,
                trailScaleRange: [0.22, 0.48],
                spawnArea: [-0.05, 1.05],
                windSpread: 0.8,
                rainMode: 'hybrid',
            },
        );

        this.waterTexture = new THREE.CanvasTexture(this.raindrops.canvas);
        this.waterTexture.minFilter = THREE.LinearFilter;
        this.waterTexture.magFilter = THREE.LinearFilter;

        if (this.windshieldPass && this.windshieldPass.rainPass) {
            this.windshieldPass.rainPass.uniforms.uWaterMap.value = this.waterTexture;
        }
    }

    applyWeatherPreset(type, rainMode) {
        if (!this.raindrops) return;

        this.raindrops.clearDrops();
        this.raindrops.options.rainMode = rainMode;

        if (type === 0 || type === 2) { // STORM or CLOUDY DAY
            this.raindrops.options.raining = true;
            if (rainMode === 'classic') {
                this.raindrops.options.minR = 1.8;
                this.raindrops.options.maxR = 12.0;
                this.raindrops.options.rainChance = 0.50;
                this.raindrops.options.rainLimit = 6;
                this.raindrops.options.dropletsRate = 35;
                this.raindrops.options.dropletsSize = [0.6, 2.2];
                this.raindrops.options.maxDrops = 300;
            } else if (rainMode === 'dynamic') {
                this.raindrops.options.minR = 1.0;
                this.raindrops.options.maxR = 8.0;
                this.raindrops.options.rainChance = 0.30;
                this.raindrops.options.rainLimit = 4;
                this.raindrops.options.dropletsRate = 20;
                this.raindrops.options.dropletsSize = [0.4, 1.4];
                this.raindrops.options.maxDrops = 180;
            } else { // HYBRID
                this.raindrops.options.minR = 1.4;
                this.raindrops.options.maxR = 10.0;
                this.raindrops.options.rainChance = 0.40;
                this.raindrops.options.rainLimit = 5;
                this.raindrops.options.dropletsRate = 30;
                this.raindrops.options.dropletsSize = [0.5, 1.8];
                this.raindrops.options.maxDrops = 250;
            }
            this.raindrops.options.trailRate = 0.75;
            this.raindrops.options.trailScaleRange = [0.15, 0.35];
            this.raindrops.options.spawnArea = [-0.1, 1.0];
        } else if (type === 1) { // DRIZZLE
            this.raindrops.options.raining = true;
            if (rainMode === 'classic') {
                this.raindrops.options.minR = 1.2;
                this.raindrops.options.maxR = 8.0;
                this.raindrops.options.rainChance = 0.30;
                this.raindrops.options.rainLimit = 3;
                this.raindrops.options.dropletsRate = 22;
                this.raindrops.options.dropletsSize = [0.4, 1.6];
                this.raindrops.options.maxDrops = 200;
            } else if (rainMode === 'dynamic') {
                this.raindrops.options.minR = 0.8;
                this.raindrops.options.maxR = 6.0;
                this.raindrops.options.rainChance = 0.15;
                this.raindrops.options.rainLimit = 2;
                this.raindrops.options.dropletsRate = 12;
                this.raindrops.options.dropletsSize = [0.3, 1.2];
                this.raindrops.options.maxDrops = 120;
            } else { // HYBRID
                this.raindrops.options.minR = 1.0;
                this.raindrops.options.maxR = 7.0;
                this.raindrops.options.rainChance = 0.22;
                this.raindrops.options.rainLimit = 3;
                this.raindrops.options.dropletsRate = 18;
                this.raindrops.options.dropletsSize = [0.4, 1.4];
                this.raindrops.options.maxDrops = 160;
            }
            this.raindrops.options.trailRate = 0.45;
            this.raindrops.options.trailScaleRange = [0.12, 0.28];
            this.raindrops.options.spawnArea = [-0.1, 1.0];
        } else { // CLEAR
            this.raindrops.options.raining = false;
        }
    }

    update(dt, weatherType, cameraMode, speed, speedRatio, windVector) {
        const isThirdPerson = cameraMode === 0;

        if (this.raindrops) {
            this.raindrops.options.ambientWind = windVector;
            this.raindrops.options.carSpeedKmh = speed * 3.6;
            this.raindrops.options.speedRatio = speedRatio;
            this.raindrops.options.steerAngle = this.vehicle ? (this.vehicle.steerAngle || 0) : 0;
            this.raindrops.options.windSpread = speedRatio > 0.04 ? (speedRatio * 3.8) : 0.0;

            if (weatherType === 0) { // STORM
                this.raindrops.options.raining = true;
                this.raindrops.options.rainChance = isThirdPerson ? (0.40 + speedRatio * 0.30) : (0.50 + speedRatio * 0.25);
                this.raindrops.options.dropletsRate = isThirdPerson ? Math.max(18, 40 - speedRatio * 12) : Math.max(20, 45 - speedRatio * 15);
                this.raindrops.options.dropFallMultiplier = 1.0 + speedRatio * 4.2;
                this.raindrops.options.globalTimeScale = 0.95 + speedRatio * 2.2;
                this.raindrops.options.spawnArea = [-0.05, 1.05];
                this.raindrops.options.trailRate = 0.75;
                this.raindrops.options.trailScaleRange = [0.22, 0.48];
            } else if (weatherType === 2) { // CLOUDY DAY
                this.raindrops.options.raining = true;
                this.raindrops.options.rainChance = isThirdPerson ? (0.10 + speedRatio * 0.05) : (0.35 + speedRatio * 0.10);
                this.raindrops.options.dropletsRate = isThirdPerson ? Math.max(4, 10 - speedRatio * 5) : Math.max(10, 25 - speedRatio * 12);
                this.raindrops.options.dropFallMultiplier = 0.9 + speedRatio * 3.0;
                this.raindrops.options.globalTimeScale = 0.90 + speedRatio * 1.8;
                this.raindrops.options.spawnArea = [-0.05, 1.05];
                this.raindrops.options.trailRate = 0.35;
                this.raindrops.options.trailScaleRange = [0.15, 0.32];
            } else if (weatherType === 1) { // DRIZZLE
                this.raindrops.options.raining = true;
                this.raindrops.options.rainChance = isThirdPerson ? (0.20 + speedRatio * 0.15) : (0.28 + speedRatio * 0.15);
                this.raindrops.options.dropletsRate = isThirdPerson ? Math.max(10, 22 - speedRatio * 8) : Math.max(12, 25 - speedRatio * 10);
                this.raindrops.options.dropFallMultiplier = 0.8 + speedRatio * 2.5;
                this.raindrops.options.globalTimeScale = 0.85 + speedRatio * 1.5;
                this.raindrops.options.spawnArea = [-0.05, 1.05];
                this.raindrops.options.trailRate = 0.45;
                this.raindrops.options.trailScaleRange = [0.18, 0.38];
            } else { // CLEAR
                this.raindrops.options.raining = false;
                this.raindrops.clearDrops();
            }

            if (this.waterTexture) {
                this.raindrops.update(dt);
                this.waterTexture.needsUpdate = true;
            }
        }

        this._updateWiperSystem(dt, weatherType, cameraMode);
        this._updateVehicleWetness(dt, weatherType);
    }

    _updateWiperSystem(dt, weatherType, cameraMode) {
        if (!this.raindrops || weatherType === 3 || cameraMode !== 1) return;

        const rainDensity = this.raindrops.options.dropletsRate || 40;
        const autoInterval = Math.max(0.6, 3.5 - (rainDensity * 0.05));

        this.wiperTimer += dt;
        if (this.wiperState === 'idle' && this.wiperTimer >= autoInterval) {
            this.wiperState = 'sweep_out';
            this.wiperTimer = 0;
        }

        const maxAngle = Math.PI * 0.42;
        if (this.wiperState === 'sweep_out') {
            this.wiperAngle += dt * this.wiperSpeed;
            if (this.wiperAngle >= maxAngle) {
                this.wiperAngle = maxAngle;
                this.wiperState = 'sweep_back';
            }
        } else if (this.wiperState === 'sweep_back') {
            this.wiperAngle -= dt * (this.wiperSpeed * 0.9);
            if (this.wiperAngle <= 0) {
                this.wiperAngle = 0;
                this.wiperState = 'idle';
                this.wiperTimer = 0;
            }
        }

        if (this.wiperState !== 'idle') {
            const simW = this.raindrops.width / this.raindrops.scale;
            const simH = this.raindrops.height / this.raindrops.scale;

            const leftPivotX = simW * 0.30;
            const leftPivotY = simH * 1.15;
            const rightPivotX = simW * 0.70;
            const rightPivotY = simH * 1.15;

            const sweepStartAngle = -Math.PI * 0.5 - this.wiperAngle;
            const sweepEndAngle = sweepStartAngle + 0.15;

            this.raindrops.clearWiperArc(leftPivotX, leftPivotY, sweepStartAngle, sweepEndAngle, simH * 0.25, simH * 1.10);
            this.raindrops.clearWiperArc(rightPivotX, rightPivotY, sweepStartAngle, sweepEndAngle, simH * 0.25, simH * 1.10);
        }
    }

    _updateVehicleWetness(dt, weatherType) {
        if (!this.vehicle || !this.vehicle.bodyMaterial) return;

        const isRaining = (weatherType === 0 || weatherType === 1 || weatherType === 2);
        const targetWetness = isRaining ? 1.0 : 0.0;
        this.wetness = THREE.MathUtils.lerp(this.wetness, targetWetness, dt * (isRaining ? 0.3 : 0.1));

        const mat = this.vehicle.bodyMaterial;
        mat.roughness = THREE.MathUtils.lerp(0.25, 0.04, this.wetness);
        mat.clearcoat = THREE.MathUtils.lerp(0.70, 1.00, this.wetness);
        mat.clearcoatRoughness = THREE.MathUtils.lerp(0.15, 0.02, this.wetness);
    }
}
