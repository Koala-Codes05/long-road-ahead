import * as THREE from 'three';
import { WindshieldPass } from './windshield/WindshieldPass.js';
import { WiperController } from './windshield/WiperController.js';
import { RainVolume3D } from './particles/RainVolume3D.js';
import { FarRainPoints } from './particles/FarRainPoints.js';
import { TireMist } from './particles/TireMist.js';
import { WetRoadManager } from './materials/WetRoadManager.js';
import { VolumetricClouds } from './materials/VolumetricClouds.js';
import { LightningSystem } from './lighting/LightningSystem.js';
import { RainLighting } from './lighting/RainLighting.js';

/**
 * WeatherSystem — AAA Driveclub-style Multi-Tiered Weather Engine Orchestrator.
 * Composes specialized modular subsystems:
 *  - 3D Camera-Relative Rain Particle Volume (RainVolume3D & FarRainPoints)
 *  - Dynamic Lighting & Headlight Cones (RainLighting & LightningSystem)
 *  - PBR Wet Asphalt Optics & Porosity Darkening (WetRoadManager)
 *  - 2D Screen-Space Glass Refraction & Wiper Swath Physics (WindshieldPass & WiperController)
 *  - Tire Splash Spray & Volumetric Night Cloud Layer (TireMist & VolumetricClouds)
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

        // 3. PBR Wet Surface & Cloud Layer
        this.wetRoadManager = new WetRoadManager(this.world);
        this.cloudSystem = new VolumetricClouds(this.scene);

        // 4. 3D Particle Volume Systems
        this.rainVolume3D = new RainVolume3D(this.scene, this.rainLighting);
        this.farRainPoints = new FarRainPoints(this.scene);
        this.tireMist = new TireMist(this.scene, this.vehicle, this.world);

        // 5. 2D Glass Droplets & Auto-Wiper Physics
        this.wiperController = new WiperController(
            this.windshieldPass,
            this.vehicle,
            this.rainModeNames,
            this.rainModes
        );
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

    setWeather(type) {
        this.weatherType = type;
        this._gltfMatUpdated = false;
        this.windshieldPass.setWeatherType(type);
        this.lightningSystem.setWeatherType(type);
        this.wetRoadManager.updatePreset(type);

        const currentMode = this.rainModes[this.rainModeIndex];
        this.wiperController.applyWeatherPreset(type, currentMode);

        // Dynamic Atmosphere, Scene Lighting & Fog Tuning per Preset
        let lightMul = 1.0;
        let vehicleEnvIntensity = 1.0;
        let vehiclePaintDarkening = 1.0;

        if (this.scene) {
            if (type === 0) { // STORM
                this.scene.background.setHex(0x090f1a);
                if (this.scene.fog) {
                    this.scene.fog.color.setHex(0x090f1a);
                    this.scene.fog.density = 0.0068;
                }
                lightMul = 0.35;             // Dim global scene lighting for heavy storm
                vehicleEnvIntensity = 0.22;   // 78% reduction in car body HDRI reflection glow
                vehiclePaintDarkening = 0.50; // Darken car paint to match wet storm asphalt absorption
            } else if (this.weatherType === 1) { // DRIZZLE
                this.scene.background.setHex(0x0c1424);
                if (this.scene.fog) {
                    this.scene.fog.color.setHex(0x0c1424);
                    this.scene.fog.density = 0.0050;
                }
                lightMul = 0.60;
                vehicleEnvIntensity = 0.45;
                vehiclePaintDarkening = 0.72;
            } else if (this.weatherType === 2) { // CLOUDY DAY (DAYTIME STORM)
                this.scene.background.setHex(0x8093a4);
                if (this.scene.fog) {
                    this.scene.fog.color.setHex(0x8093a4);
                    this.scene.fog.density = 0.0050;
                }
                lightMul = 1.6;
                vehicleEnvIntensity = 1.35;
                vehiclePaintDarkening = 0.65;
            } else { // CLEAR
                this.scene.background.setHex(0x04060c);
                if (this.scene.fog) {
                    this.scene.fog.color.setHex(0x04060c);
                    this.scene.fog.density = 0.0030;
                }
                lightMul = 1.0;
                vehicleEnvIntensity = 1.0;
                vehiclePaintDarkening = 1.0;
            }

            // Scale global scene lights (Ambient, Hemisphere, Directional Moonlight)
            this.scene.traverse((obj) => {
                if (obj.isLight) {
                    // Skip headlights and taillights
                    if (obj.isSpotLight || obj.isPointLight) return;

                    if (!obj.userData.baseIntensity) {
                        obj.userData.baseIntensity = obj.intensity;
                    }
                    obj.intensity = obj.userData.baseIntensity * lightMul;
                }
            });

            // Adjust Three.js Environment Map Reflection Intensity if supported
            if ('environmentIntensity' in this.scene) {
                this.scene.environmentIntensity = vehicleEnvIntensity;
            }
        }

        // Adjust Vehicle Materials (Body paint, carbon, chassis)
        this._updateVehicleMaterials(vehicleEnvIntensity, vehiclePaintDarkening);

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

    _updateVehicleMaterials(envIntensity, paintDarkening) {
        if (!this.vehicle || !this.vehicle.mesh) return;

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
                        mat.needsUpdate = true;
                    }
                });
            }
        });
    }

    update(dt, cameraMode = 0, camera = null) {
        this.clockTime += dt;

        // Ensure car materials are updated if GLTF model finishes loading asynchronously
        if (this.vehicle && this.vehicle.isGltfLoaded && !this._gltfMatUpdated) {
            const envInt = this.weatherType === 0 ? 0.22 : (this.weatherType === 1 ? 0.45 : 1.0);
            const paintDark = this.weatherType === 0 ? 0.50 : (this.weatherType === 1 ? 0.72 : 1.0);
            this._updateVehicleMaterials(envInt, paintDark);
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

        const targetIntensity = this.weatherType === 0 ? 1.0 : (this.weatherType === 1 ? 0.45 : 0.0);
        this.rainVolume3D.update(dt, camera, this.clockTime, targetIntensity, this.windVector, cameraMode);
        this.farRainPoints.update(dt, camera, this.clockTime, targetIntensity, this.windVector, cameraMode);

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

        // Animate water ripple normal map offset
        if (this.wetRoadManager.rippleNormalTex) {
            this.wetRoadManager.rippleNormalTex.offset.x += dt * 0.02;
            this.wetRoadManager.rippleNormalTex.offset.y += dt * 0.015;
        }
    }
}
