import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { AcceleratingSystem } from './accelerating.js';
import { TurningSystem } from './turning.js';
import { DriftingSystem } from './drifting.js';
import { ManeuversSystem } from './maneuvers.js';
import { getRoadPoint } from './world.js';

/**
 * Vehicle — Modular Core Supercar Physics & Rendering Engine.
 * Integrates Accelerating, Turning, Drifting, and Maneuver systems with 3D suspension,
 * photorealistic GLTF model loading, hardware lighting, and particle effects.
 */
export class Vehicle {
    constructor(scene) {
        this.scene = scene;

        // Vehicle Telemetry & Mass Parameters (Ferrari 458 Italia Specs)
        this.mass = 1420;        // kg
        this.wheelbase = 2.65;   // meters
        this.cgToFront = 1.30;   // meters
        this.cgToRear = 1.35;    // meters
        this.trackWidth = 1.68;  // meters
        this.cgHeight = 0.42;    // meters
        this.wheelRadius = 0.38; // meters

        // 2-DOF Dynamic Motion State
        this.vLong = 0;     // Longitudinal velocity (m/s)
        this.vLat = 0;      // Lateral slip velocity (m/s)
        this.yawRate = 0;   // Angular yaw rotation rate (rad/s)
        this.heading = 0;   // Orientation angle in world space (radians, 0 = facing -Z)
        this.speed = 0;     // Telemetry alias
        this.maxSpeed = 315 / 3.6;

        // Dynamic Load Transfer & Suspension
        this.aLong = 0;
        this.aLat = 0;
        this.pitchAngle = 0;
        this.pitchVel = 0;
        this.rollAngle = 0;
        this.rollVel = 0;
        this.heaveDisplacement = 0;
        this.heaveVel = 0;

        // Modular Subsystems
        this.acceleratingSystem = new AcceleratingSystem(this);
        this.turningSystem = new TurningSystem(this);
        this.driftingSystem = new DriftingSystem(this);
        this.maneuversSystem = new ManeuversSystem(this);

        // Rendering & Lights Setup
        this.wheels = [];
        this.frontWheels = [];
        this.isGltfLoaded = false;

        this.mesh = new THREE.Group();
        this.mesh.position.set(0, 0, 0);
        this.scene.add(this.mesh);

        this._initLightingSystem();
        this._initParticleEffects();

        // Procedural fallback car model + Ferrari GLTF load
        this.proceduralMesh = this._createCarModel();
        this.mesh.add(this.proceduralMesh);
        this._loadFerrariModel();
    }

    // Telemetry Helpers for HUD
    getSpeedKmh() { return Math.round(Math.abs(this.vLong * 3.6)); }
    getRpm() { return (this.acceleratingSystem.engineRpm - 900) / (9000 - 900); }
    getGear() {
        if (this.acceleratingSystem.isReversing) return 'R';
        if (Math.abs(this.vLong) < 0.2) return 'N';
        return this.acceleratingSystem.gearIndex + 1;
    }
    get isNitro() { return this.acceleratingSystem.isNitro; }
    get steerAngle() { return this.turningSystem.steerAngle; }
    get currentSteer() { return this.turningSystem.currentSteer; }

    /* ------------------------------------------------
       CAR LIGHTING SYSTEM SETUP
       ------------------------------------------------ */
    _initLightingSystem() {
        this.lightsGroup = new THREE.Group();
        this.mesh.add(this.lightsGroup);

        this.blinkerTimer = 0;
        this.blinkerState = false;

        // Headlights (SpotLights)
        this.headlightSpots = [];
        const hlPos = [-0.70, 0.70];
        hlPos.forEach((x) => {
            const spot = new THREE.SpotLight(0xf0f5ff, 8.0, 60, Math.PI / 5.5, 0.8, 1.2);
            spot.position.set(x, 0.55, -2.0);
            spot.castShadow = false;

            const target = new THREE.Object3D();
            target.position.set(x, -0.4, -40);
            this.lightsGroup.add(target);
            spot.target = target;
            this.lightsGroup.add(spot);
            this.headlightSpots.push(spot);
        });

        // Rear Brake Light Spot
        this.rearBrakeSpot = new THREE.SpotLight(0xff1100, 0, 15, Math.PI / 3, 0.7, 1.2);
        this.rearBrakeSpot.position.set(0, 0.3, 2.3);
        const rearTarget = new THREE.Object3D();
        rearTarget.position.set(0, -0.6, 8);
        this.lightsGroup.add(rearTarget);
        this.rearBrakeSpot.target = rearTarget;
        this.lightsGroup.add(this.rearBrakeSpot);

        // Reverse Light Point
        this.reverseLightPoint = new THREE.PointLight(0xffffff, 0, 8);
        this.reverseLightPoint.position.set(0, 0.5, 2.4);
        this.lightsGroup.add(this.reverseLightPoint);

        // Underglow Neon
        const ugMat = new THREE.MeshStandardMaterial({
            color: 0x0088ff,
            emissive: 0x0088ff,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        this.underGlowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.0), ugMat);
        this.underGlowMesh.rotation.x = -Math.PI / 2;
        this.underGlowMesh.position.y = 0.03;
        this.lightsGroup.add(this.underGlowMesh);

        this.underLight = new THREE.PointLight(0x0088ff, 2.0, 6.0);
        this.underLight.position.set(0, 0.15, 0);
        this.lightsGroup.add(this.underLight);
    }

    /* ------------------------------------------------
       DYNAMIC TIRE SMOKE & SKID MARKS SYSTEM
       ------------------------------------------------ */
    _initParticleEffects() {
        const count = 160;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = 0; pos[i * 3 + 1] = -100; pos[i * 3 + 2] = 0;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
        grad.addColorStop(0, 'rgba(240, 245, 255, 0.7)');
        grad.addColorStop(0.35, 'rgba(210, 225, 245, 0.35)');
        grad.addColorStop(1, 'rgba(160, 180, 210, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);

        const smokeMat = new THREE.PointsMaterial({
            size: 2.8,
            map: new THREE.CanvasTexture(canvas),
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
            blending: THREE.NormalBlending,
        });

        this.smokeParticles = new THREE.Points(geo, smokeMat);
        this.scene.add(this.smokeParticles);

        this.smokeData = Array.from({ length: count }, () => ({
            vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1.0, opacity: 0
        }));
        this.nextSmokeIdx = 0;

        this.skidMarks = [];
        this.maxSkidMarks = 120;
        this.skidGeoGroup = new THREE.Group();
        this.scene.add(this.skidGeoGroup);
        this.skidMat = new THREE.MeshBasicMaterial({
            color: 0x111115,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    }

    _emitSmoke(x, z, intensity) {
        const data = this.smokeData[this.nextSmokeIdx];
        const pos = this.smokeParticles.geometry.attributes.position.array;
        const idx = this.nextSmokeIdx * 3;

        pos[idx] = x + (Math.random() - 0.5) * 0.3;
        pos[idx + 1] = 0.15 + Math.random() * 0.2;
        pos[idx + 2] = z + (Math.random() - 0.5) * 0.3;

        data.vx = (Math.random() - 0.5) * 1.8;
        data.vy = 1.0 + Math.random() * 1.6;
        data.vz = (Math.random() - 0.5) * 1.8;
        data.life = 0;
        data.maxLife = 0.5 + Math.random() * 0.5;
        data.opacity = 0.4 * intensity;

        this.nextSmokeIdx = (this.nextSmokeIdx + 1) % this.smokeData.length;
    }

    _addSkidMark(x, z, heading, width = 0.28) {
        if (this.skidMarks.length >= this.maxSkidMarks) {
            const old = this.skidMarks.shift();
            if (old.parent) old.parent.remove(old);
            if (old.geometry) old.geometry.dispose();
        }

        const geo = new THREE.PlaneGeometry(width, 0.6);
        const mesh = new THREE.Mesh(geo, this.skidMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = heading;
        mesh.position.set(x, 0.02, z);
        this.skidGeoGroup.add(mesh);
        this.skidMarks.push(mesh);
    }

    _updateParticles(dt, isSliding, isBurnout, speed) {
        if (isSliding || isBurnout) {
            const sinH = Math.sin(this.heading);
            const cosH = Math.cos(this.heading);
            const rlX = this.mesh.position.x - sinH * (-1.35) + cosH * (-0.85);
            const rlZ = this.mesh.position.z - cosH * (-1.35) - sinH * (-0.85);
            const rrX = this.mesh.position.x - sinH * (-1.35) + cosH * (0.85);
            const rrZ = this.mesh.position.z - cosH * (-1.35) - sinH * (0.85);

            const intensity = isBurnout ? 1.0 : (isSliding ? 0.75 : 0.4);
            this._emitSmoke(rlX, rlZ, intensity);
            this._emitSmoke(rrX, rrZ, intensity);

            if (speed > 3.0 && Math.random() < 0.6) {
                this._addSkidMark(rlX, rlZ, this.heading);
                this._addSkidMark(rrX, rrZ, this.heading);
            }
        }

        if (!this.smokeParticles) return;
        const pos = this.smokeParticles.geometry.attributes.position.array;
        for (let i = 0; i < this.smokeData.length; i++) {
            const d = this.smokeData[i];
            if (d.opacity > 0.001) {
                d.life += dt;
                if (d.life >= d.maxLife) {
                    d.opacity = 0;
                    pos[i * 3 + 1] = -100;
                } else {
                    const progress = d.life / d.maxLife;
                    pos[i * 3] += d.vx * dt;
                    pos[i * 3 + 1] += d.vy * dt;
                    pos[i * 3 + 2] += d.vz * dt;
                    d.opacity = (1.0 - progress) * 0.35;
                }
            }
        }
        this.smokeParticles.geometry.attributes.position.needsUpdate = true;
    }

    /* ------------------------------------------------
       PROCEDURAL CAR MODEL FALLBACK & GLTF LOADER
       ------------------------------------------------ */
    _createCarModel() {
        const group = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff2200, metalness: 0.95, roughness: 0.06 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 4.8), bodyMat);
        body.position.y = 0.55;
        body.castShadow = true;
        group.add(body);

        const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 1.5), bodyMat);
        hood.position.set(0, 0.9, -1.2);
        hood.rotation.x = 0.15;
        hood.castShadow = true;
        group.add(hood);

        const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 1.0, roughness: 0.05, transparent: true, opacity: 0.7 });
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 1.8), cabinMat);
        cabin.position.set(0, 1.07, 0.2);
        cabin.castShadow = true;
        group.add(cabin);

        const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.25, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.4 });
        const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.26, 8);
        const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.95, roughness: 0.1 });

        const wheelCfg = [
            { x: -1.1, z: -1.5, front: true },
            { x: 1.1, z: -1.5, front: true },
            { x: -1.1, z: 1.4, front: false },
            { x: 1.1, z: 1.4, front: false },
        ];
        wheelCfg.forEach(({ x, z, front }) => {
            const wg = new THREE.Group();
            const tire = new THREE.Mesh(wheelGeo, wheelMat);
            tire.rotation.z = Math.PI / 2;
            wg.add(tire);
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.z = Math.PI / 2;
            wg.add(rim);
            wg.position.set(x, 0.38, z);
            group.add(wg);
            this.wheels.push(wg);
            if (front) this.frontWheels.push(wg);
        });

        this.proceduralBodyGroup = group;
        return group;
    }

    _loadFerrariModel() {
        try {
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');

            const loader = new GLTFLoader();
            loader.setDRACOLoader(dracoLoader);

            loader.load('assets/ferrari.glb', (gltf) => {
                const carModel = gltf.scene;
                carModel.scale.set(1.0, 1.0, 1.0);
                carModel.position.set(0, 0, 0);

                carModel.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;

                        if (child.name === 'lights') {
                            this.gltfHeadlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 });
                            child.material = this.gltfHeadlightMat;
                        }
                        if (child.name === 'lights_red') {
                            this.gltfTaillightMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8 });
                            child.material = this.gltfTaillightMat;
                        }
                    }
                });

                const wheelFL = carModel.getObjectByName('wheel_fl');
                const wheelFR = carModel.getObjectByName('wheel_fr');
                const wheelRL = carModel.getObjectByName('wheel_rl');
                const wheelRR = carModel.getObjectByName('wheel_rr');
                if (wheelFL && wheelFR && wheelRL && wheelRR) {
                    this.gltfWheels = [wheelFL, wheelFR, wheelRL, wheelRR];
                    this.gltfFrontWheels = [wheelFL, wheelFR];
                }

                // Apply glossy Ferrari Red body paint with balanced moonlight sheen
                const bodyMesh = carModel.getObjectByName('body');
                if (bodyMesh) {
                    this.bodyMaterial = new THREE.MeshPhysicalMaterial({
                        color: 0xd11a2a,
                        metalness: 0.45,
                        roughness: 0.25,
                        clearcoat: 0.7,
                        clearcoatRoughness: 0.15,
                    });
                    bodyMesh.material = this.bodyMaterial;
                }

                // Hide procedural car body fallback
                if (this.proceduralMesh) {
                    this.proceduralMesh.visible = false;
                }
                this.mesh.add(carModel);
                this.isGltfLoaded = true;
            }, undefined, (err) => {
                console.warn('Ferrari 3D GLTF load warning (using procedural model fallback):', err);
            });
        } catch (e) {
            console.warn('GLTFLoader error:', e);
        }
    }

    /* ------------------------------------------------
       MAIN UNIFIED UPDATE LOOP
       ------------------------------------------------ */
    update(dt, input, weather) {
        dt = Math.min(dt, 1 / 30);

        // 1. Update Modular Subsystems
        this.acceleratingSystem.update(dt, input, weather);
        this.turningSystem.update(dt, input);
        this.driftingSystem.update(dt, input, weather);
        this.maneuversSystem.update(dt, input, weather);

        // 2. Integrated 3D World Movement
        const sinH = Math.sin(this.heading);
        const cosH = Math.cos(this.heading);
        const vxWorld = -sinH * this.vLong + cosH * this.vLat;
        const vzWorld = -cosH * this.vLong - sinH * this.vLat;

        this.mesh.position.x += vxWorld * dt;
        this.mesh.position.z += vzWorld * dt;

        // 3. Chassis Suspension Physics (Pitch, Roll, Heave)
        const targetPitch = -(this.acceleratingSystem.aLong / 9.81) * 0.045;
        const targetRoll = (this.turningSystem.aLat / 9.81) * 0.075;
        const roadBumpNoise = Math.sin(performance.now() * 0.018) * 0.006 * Math.min(Math.abs(this.vLong) / 25, 1.0);
        const targetHeave = -(Math.abs(this.acceleratingSystem.aLong) / 9.81) * 0.012 + roadBumpNoise;

        this.pitchVel += (targetPitch - this.pitchAngle) * 180.0 * dt - this.pitchVel * 12.0 * dt;
        this.pitchAngle += this.pitchVel * dt;
        this.rollVel += (targetRoll - this.rollAngle) * 180.0 * dt - this.rollVel * 12.0 * dt;
        this.rollAngle += this.rollVel * dt;
        this.heaveVel += (targetHeave - this.heaveDisplacement) * 200.0 * dt - this.heaveVel * 14.0 * dt;
        this.heaveDisplacement += this.heaveVel * dt;

        this.mesh.rotation.y = this.heading;
        this.mesh.rotation.z = this.rollAngle;
        this.mesh.rotation.x = this.pitchAngle;
        this.mesh.position.y = Math.max(-0.05, this.heaveDisplacement);

        // 4. Wheel Animations & Steering Angle
        const spin = -this.vLong * dt * 3.2;
        if (this.isGltfLoaded && this.gltfWheels) {
            this.gltfWheels.forEach(w => { w.rotation.x += spin; });
        } else {
            this.wheels.forEach(w => {
                if (w.children[0]) w.children[0].rotation.x += spin;
                if (w.children[1]) w.children[1].rotation.x += spin;
            });
        }

        const visualSteer = this.turningSystem.currentSteer * 0.85;
        if (this.isGltfLoaded && this.gltfFrontWheels) {
            this.gltfFrontWheels.forEach(w => (w.rotation.y = visualSteer));
        } else {
            this.frontWheels.forEach(w => (w.rotation.y = visualSteer));
        }

        // 5. Particle Effects & Lighting Updates
        const isBurnout = input.forward && Math.abs(this.vLong) < 3.0 && (input.backward || input.handbrake);
        const isSliding = this.driftingSystem.isDrifting || input.handbrake;
        this._updateParticles(dt, isSliding, isBurnout, Math.abs(this.vLong));

        this._updateLights(dt, input);

        // 6. Playable boundary constraint relative to curved road center
        const roadPt = getRoadPoint(this.mesh.position.z);
        const offsetFromRoad = this.mesh.position.x - roadPt.x;
        if (Math.abs(offsetFromRoad) > 60) {
            this.mesh.position.x = roadPt.x + Math.sign(offsetFromRoad) * 60;
            this.vLong *= 0.98;
        }
    }

    _updateLights(dt, input) {
        const mode = input.headlightMode !== undefined ? input.headlightMode : 1;
        const spotIntensity = mode === 2 ? 18.0 : (mode === 1 ? 8.0 : 0);
        const spotDistance = mode === 2 ? 120 : 60;

        this.headlightSpots.forEach(s => {
            s.intensity = spotIntensity;
            s.distance = spotDistance;
        });

        if (this.gltfHeadlightMat) {
            this.gltfHeadlightMat.emissiveIntensity = mode === 2 ? 2.5 : (mode === 1 ? 1.2 : 0.05);
        }

        const isBraking = (input.backward && this.vLong > 0.5) || input.handbrake;
        this.rearBrakeSpot.intensity = isBraking ? 6.0 : (mode > 0 ? 0.8 : 0);
        if (this.gltfTaillightMat) {
            this.gltfTaillightMat.emissiveIntensity = isBraking ? 3.5 : (mode > 0 ? 0.8 : 0.2);
        }

        const isReversing = (this.vLong < -0.1) || (input.backward && Math.abs(this.vLong) < 0.5);
        this.reverseLightPoint.intensity = isReversing ? 2.5 : 0;

        this.blinkerTimer += dt;
        if (this.blinkerTimer >= 0.35) {
            this.blinkerTimer = 0;
            this.blinkerState = !this.blinkerState;
        }
    }
}