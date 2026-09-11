import * as THREE from 'three';
import { WindshieldPass } from './windshield/WindshieldPass.js';
import { WiperController } from './windshield/WiperController.js';
import { RainVolume3D } from './particles/RainVolume3D.js';
import { FarRainPoints } from './particles/FarRainPoints.js';
import { TireMist } from './particles/TireMist.js';
import { RoadImpactSplashes } from './particles/RoadImpactSplashes.js';
import { WetRoadManager } from './materials/WetRoadManager.js';
import { VolumetricClouds } from './materials/VolumetricClouds.js';
import { LightningSystem } from './lighting/LightningSystem.js';
import { RainLighting } from './lighting/RainLighting.js';
import { VolumetricAtmosphericFog } from './lighting/VolumetricAtmosphericFog.js';

/**
 * WeatherSystem — AAA Driveclub-style Multi-Tiered Weather Engine Orchestrator.
 * Composes specialized modular subsystems across 5 Rain Layers:
 *  1. Distant Rain (FarRainPoints & Background Rain Sheets)
 *  2. Midground Rain (RainVolume3D & Ambient Particle Droplets)
 *  3. Foreground Streaks (High-Velocity Camera Rain Needles)
 *  4. Camera Droplets (WindshieldPass 2D Screen Refraction & Wiper Physics)
 *  5. Road Impact (RoadImpactSplashes Instanced Road Surface Splashes & Water Ripples)
 */
export class WeatherSystem {
    constructor(scene, vehicle, world, composer, skyController = null) {
        this.scene = scene;
        this.vehicle = vehicle;
        this.world = world;
        this.composer = composer;
        this.skyController = skyController;

        this.clockTime = 0;
        this.gForce = new THREE.Vector2(0, 0);
        this.windVector = new THREE.Vector2(0.5, 0.2);

        // Weather Preset Types: 0 = Heavy Storm, 1 = Drizzle, 2 = Cloudy Day, 3 = Clear
        this.weatherType = 0;

        // Rain FX Modes: 0 = HYBRID (OLD + NEW), 1 = CLASSIC GLASS, 2 = DRIVECLUB 3D
        this.rainModeIndex = 0;
        this.rainModes = ['hybrid', 'classic', 'dynamic'];
        this.rainModeNames = ['HYBRID (OLD + NEW)', 'CLASSIC GLASS', 'DRIVECLUB 3D'];

        // 1. Windshield Post-Processing Pass
        this.windshieldPass = new WindshieldPass(this.composer);
        this.rainPass = this.windshieldPass.rainPass; // Exposed for main.js camera controller

        // 2. Lighting & Storm Controller
        this.rainLighting = new RainLighting(this.vehicle, this.world);
        this.lightningSystem = new LightningSystem(this.rainPass);
        this.atmosphericFog = new VolumetricAtmosphericFog(this.scene, this.vehicle);

        // 3. PBR Wet Surface & Cloud Layer
        this.wetRoadManager = new WetRoadManager(this.world);
        this.cloudSystem = new VolumetricClouds(this.scene);

        // 4. Multi-Tiered Rain Systems
        this.rainVolume3D = new RainVolume3D(this.scene, this.rainLighting);
        this.farRainPoints = new FarRainPoints(this.scene);
        this.roadSplashes = new RoadImpactSplashes(this.scene);
        this.tireMist = new TireMist(this.scene, this.vehicle, this.world);

        // 5. 2D Glass Droplets & Auto-Wiper Physics
        this.wiperController = new WiperController(
            this.windshieldPass,
            this.vehicle,
            this.rainModeNames,
            this.rainModes
        );
    }

    /** Re-attach the windshield pass to a freshly created composer (WebGL recovery). */
    reattachComposer(composer) {
        this.composer = composer;
        if (this.windshieldPass) {
            this.windshieldPass.composer = composer;
            if (composer && this.rainPass) {
                composer.addPass(this.rainPass);
            }
        }
    }

    setRainMode(index = null) {
        if (index === null) {
            this.rainModeIndex = (this.rainModeIndex + 1) % this.rainModes.length;
        } else {
            this.rainModeIndex = Math.max(0, Math.min(this.rainModes.length - 1, index));
        }

        const mode = this.rainModes[this.rainModeIndex];
        this.wiperController.applyWeatherPreset(this.weatherType, mode);
        return this.getRainModeName();
    }

    getRainModeName() {
        return this.rainModeNames[this.rainModeIndex] || 'HYBRID (OLD + NEW)';
    }

    /**
     * Apply a weather preset to every weather subsystem.
     *
     * NOTE: Scene lighting, fog color/density, sky dome and renderer exposure
     * are owned by main.js `applyWeatherEnvironment()` (single authority —
     * the old duplicating light-traversal block was removed during the
     * weather-engine consolidation). This method only drives the modular
     * weather stack: windshield refraction, lightning, wet-road optics,
     * wiper physics, fog volume, clouds and vehicle clearcoat wetness.
     */
    setWeather(type) {
        this.weatherType = type;
        this._gltfMatUpdated = false;

        this.windshieldPass.setWeatherType(type);
        this.lightningSystem.setWeatherType(type);
        this.wetRoadManager.updatePreset(type);
        if (this.atmosphericFog) {
            this.atmosphericFog.updatePreset(type);
        }

        const currentMode = this.rainModes[this.rainModeIndex];
        this.wiperController.applyWeatherPreset(type, currentMode);
        if (this.cloudSystem && this.cloudSystem.setWeather) {
            this.cloudSystem.setWeather(type);
        }

        // Vehicle clearcoat / paint response per preset
        let vehicleEnvIntensity = 1.0;
        let vehiclePaintDarkening = 1.0;
        let coolFillInt = 2.2;
        let warmBounceInt = 1.8;

        if (type === 0) {       // STORM
            vehicleEnvIntensity = 0.75; // Preserve rich car body specular reflection highlights
            vehiclePaintDarkening = 0.88;
            coolFillInt = 2.5;
            warmBounceInt = 2.1;
        } else if (type === 1) { // DRIZZLE
            vehicleEnvIntensity = 0.85;
            vehiclePaintDarkening = 0.92;
            coolFillInt = 2.2;
            warmBounceInt = 1.8;
        } else if (type === 2) { // CLOUDY DAY
            vehicleEnvIntensity = 1.25;
            vehiclePaintDarkening = 0.95;
            coolFillInt = 1.8;
            warmBounceInt = 1.4;
        } else {                 // CLEAR
            vehicleEnvIntensity = 1.0;
            vehiclePaintDarkening = 1.0;
            coolFillInt = 2.0;
            warmBounceInt = 1.6;
        }

        this._updateVehicleMaterials(vehicleEnvIntensity, vehiclePaintDarkening, coolFillInt, warmBounceInt);

        // Update Sky Controller if present
        if (this.skyController) {
            const { skyParameters, skyUniforms, updateSun } = this.skyController;
            if (type === 0) { // STORM
                skyParameters.elevation = -4.0;
                skyParameters.azimuth = 180;
                skyParameters.exposure = 0.005;
                if (skyUniforms) {
                    skyUniforms['turbidity'].value = 20;
                    skyUniforms['rayleigh'].value = 0.15;
                    skyUniforms['mieCoefficient'].value = 0.02;
                    skyUniforms['mieDirectionalG'].value = 0.3;
                }
            } else if (type === 1) { // DRIZZLE
                skyParameters.elevation = -3.0;
                skyParameters.azimuth = 180;
                skyParameters.exposure = 0.008;
                if (skyUniforms) {
                    skyUniforms['turbidity'].value = 15;
                    skyUniforms['rayleigh'].value = 0.8;
                    skyUniforms['mieCoefficient'].value = 0.01;
                    skyUniforms['mieDirectionalG'].value = 0.35;
                }
            } else { // CLEAR
                skyParameters.elevation = -2.0;
                skyParameters.azimuth = 180;
                skyParameters.exposure = 0.012;
                if (skyUniforms) {
                    skyUniforms['turbidity'].value = 10;
                    skyUniforms['rayleigh'].value = 2.0;
                    skyUniforms['mieCoefficient'].value = 0.005;
                    skyUniforms['mieDirectionalG'].value = 0.4;
                }
            }
            if (updateSun) updateSun();
        }
    }

    _updateVehicleMaterials(envIntensity, paintDarkening, coolFillInt = 2.2, warmBounceInt = 1.8) {
        if (!this.vehicle || !this.vehicle.mesh) return;

        if (this.vehicle.coolTopFrontFill) {
            this.vehicle.coolTopFrontFill.intensity = coolFillInt;
        }
        if (this.vehicle.warmRoadBounce) {
            this.vehicle.warmRoadBounce.intensity = warmBounceInt;
        }

        this.vehicle.mesh.traverse((child) => {
            if (child.isMesh && child.material) {
                // Skip vehicle headlight lenses and red taillights so lights stay crisp and bright
                if (child.name === 'lights' || child.name === 'lights_red') return;

                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((mat) => {
                    if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                        mat.envMapIntensity = envIntensity;
                        if (!mat.userData.baseColor) {
                            mat.userData.baseColor = mat.color.clone();
                        }
                        mat.color.copy(mat.userData.baseColor).multiplyScalar(paintDarkening);
                    }
                });
            }
        });
    }

    update(dt, cameraMode = 0, camera = null, renderer = null) {
        this.clockTime += dt;

        // Ensure car materials are updated if GLTF model finishes loading asynchronously
        if (this.vehicle && this.vehicle.isGltfLoaded && !this._gltfMatUpdated) {
            const envInt = this.weatherType === 0 ? 0.75 : (this.weatherType === 1 ? 0.85 : 1.0);
            const paintDark = this.weatherType === 0 ? 0.88 : (this.weatherType === 1 ? 0.92 : 1.0);
            const coolFill = this.weatherType === 0 ? 2.5 : (this.weatherType === 1 ? 2.2 : 2.0);
            const warmBounce = this.weatherType === 0 ? 2.1 : (this.weatherType === 1 ? 1.8 : 1.6);
            this._updateVehicleMaterials(envInt, paintDark, coolFill, warmBounce);
            this._gltfMatUpdated = true;
        }

        const carPos = this.vehicle.mesh.position;
        const speed = Math.abs(this.vehicle.speed || 0);
        const speedRatio = Math.min(speed / 70.0, 1.8);

        // Environmental Wind Oscillation
        const windIntensity = this.weatherType === 0 ? 0.85 : (this.weatherType === 1 ? 0.45 : 0.15);
        const targetWindX = Math.sin(this.clockTime * 0.18) * 0.75 * windIntensity;
        const targetWindY = Math.cos(this.clockTime * 0.25) * 0.35 * windIntensity;

        this.windVector.x = THREE.MathUtils.lerp(this.windVector.x, targetWindX, dt * 1.5);
        this.windVector.y = THREE.MathUtils.lerp(this.windVector.y, targetWindY, dt * 1.5);

        // Droplet G-Force Physics
        const steer = this.vehicle.steerAngle || 0;
        const targetGForceX = steer * (speed / 30.0);
        const targetGForceY = ((this.vehicle.speed || 0) > 0 ? 0.05 : -0.05) * (speed / 40.0);

        this.gForce.x = THREE.MathUtils.lerp(this.gForce.x, targetGForceX, dt * 6.0);
        this.gForce.y = THREE.MathUtils.lerp(this.gForce.y, targetGForceY, dt * 6.0);

        // Update Subsystems
        this.rainLighting.update(dt);
        if (this.wetRoadManager) {
            this.wetRoadManager.update(dt, renderer, camera);
        }
        if (this.atmosphericFog) {
            this.atmosphericFog.update(dt, camera, this.weatherType, this.windVector);
        }

        const targetIntensity = this.weatherType === 0 ? 1.0 : (this.weatherType === 1 ? 0.45 : 0.0);
        this.rainVolume3D.update(dt, camera, this.clockTime, targetIntensity, this.windVector, cameraMode);
        this.farRainPoints.update(dt, camera, this.clockTime, targetIntensity, this.windVector, cameraMode);
        if (this.roadSplashes) {
            this.roadSplashes.update(dt, camera, this.clockTime, targetIntensity);
        }

        this.tireMist.update(dt, this.weatherType, this.windVector);
        this.cloudSystem.update(dt, camera ? camera.position : carPos);
        this.windshieldPass.updateUniforms(speed, this.gForce, this.windVector, this.clockTime);
        this.wiperController.update(dt, this.weatherType, cameraMode, speed, speedRatio, this.windVector);

        // Adjust glass refraction blur based on 3rd vs 1st person perspective
        const isThirdPerson = cameraMode === 0;
        if (this.rainPass) {
            if (this.rainPass.uniforms.uCameraMode) {
                this.rainPass.uniforms.uCameraMode.value = cameraMode;
            }
            this.rainPass.uniforms.uDropBlurAmount.value = isThirdPerson ? 0.005 : 0.03;
            this.rainPass.uniforms.uMinRefraction.value = isThirdPerson ? 0.002 : 0.005;
            this.rainPass.uniforms.uRefractionDelta.value = isThirdPerson ? 0.008 : 0.020;
        }
    }
}
