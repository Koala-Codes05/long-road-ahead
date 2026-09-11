import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { AcceleratingSystem } from './accelerating.js';
import { TurningSystem } from './turning.js';
import { DriftingSystem } from './drifting.js';
import { ManeuversSystem } from './maneuvers.js';
import { getRoadPoint, getRoadWidth } from './world.js';

/** Car presentation + tuning definitions. The first entry is the default. */
const CAR_DEFINITIONS = [
    {
        id: 'ferrari', label: 'FERRARI 458', route: 'highway',
        asset: 'assets/ferrari.glb',
        mass: 1420, wheelbase: 2.65, wheelRadius: 0.38,
        torqueMultiplier: 1.0, brakeMultiplier: 1.0, gripMultiplier: 1.0,
        topSpeedKmh: 305, nitroTopSpeedKmh: 335,
    },
    {
        id: 'audi', label: 'AUDI NOVULARI', route: 'city',
        asset: 'assets/Cars/audi_novulari.glb',
        mass: 1580, wheelbase: 2.85, wheelRadius: 0.37,
        torqueMultiplier: 0.92, brakeMultiplier: 1.08, gripMultiplier: 1.14,
        topSpeedKmh: 280, nitroTopSpeedKmh: 305,
        wheelPartMatchers: ['tire', 'brake disk', 'brake_disk', 'metal_red'],
    },
];

/**
 * Vehicle — Modular Core Supercar Physics & Rendering Engine.
 * Integrates Accelerating, Turning, Drifting, and Maneuver systems with 3D suspension,
 * photorealistic GLTF model loading, hardware lighting, and particle effects.
 */
export class Vehicle {
    constructor(scene) {
        this.scene = scene;

        // NFS paint garage — clearcoat "paint" materials get color-cycled (KeyB)
        // (must be initialised before _createCarModel is invoked below)
        this.paintMats = new Set();
        this.paints = [
            { name: 'ROSSO CORSA', hex: 0xd11a2a },
            { name: 'MIDNIGHT PURPLE II', hex: 0x4527c9 },   // NFS R34 vibe
            { name: 'ELECTRIC BLUE', hex: 0x1d4fe0 },
            { name: 'GHOST BLACK', hex: 0x0b0b0e },          // NFS GHOST 86 vibe
            { name: 'SOLAR FLARE', hex: 0xff7a1a },
            { name: 'KAIDO MINT', hex: 0x2fd49b },
        ];
        this.paintIndex = 0;
        try { this.paintIndex = parseInt(localStorage.getItem('lra_paint') || '0', 10) || 0; } catch (e) { /* noop */ }

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

        // Dynamic Load Transfer & Four-Corner Suspension
        this.aLong = 0;
        this.aLat = 0;
        this.pitchAngle = 0;
        this.pitchVel = 0;
        this.rollAngle = 0;
        this.rollVel = 0;
        this.heaveDisplacement = 0;
        this.heaveVel = 0;
        this.camera = null;

        this.visualBody = new THREE.Group();
        this.visualBody.name = 'visual-chassis';
        this.visualBody.rotation.order = 'YXZ';
        this.mesh = new THREE.Group();
        this.mesh.position.set(0, 0, 0);
        this.mesh.add(this.visualBody);
        this.scene.add(this.mesh);

        this.wheelCornerData = [
            { id: 'fl', x: -1.05, z: -1.5, isFront: true },
            { id: 'fr', x: 1.05, z: -1.5, isFront: true },
            { id: 'rl', x: -1.05, z: 1.4, isFront: false },
            { id: 'rr', x: 1.05, z: 1.4, isFront: false },
        ];
        this.wheelStates = this.wheelCornerData.map((c) => ({
            ...c,
            compression: 0,
            velocity: 0,
            force: 0,
            travel: 0,
        }));
        this.suspensionSpring = 48.0;
        this.suspensionDamper = 9.0;
        this.suspensionTravelMax = 0.16;
        this.defaultSuspensionAxis = new THREE.Vector3(0, 1, 0);
        this.defaultSteerAxis = new THREE.Vector3(0, 1, 0);
        this.defaultWheelSpinAxis = new THREE.Vector3(1, 0, 0);

        // Modular Subsystems
        this.acceleratingSystem = new AcceleratingSystem(this);
        this.turningSystem = new TurningSystem(this);
        this.driftingSystem = new DriftingSystem(this);
        this.maneuversSystem = new ManeuversSystem(this);

        // Rendering & Lights Setup
        this.wheelSpinGroups = [];
        this.frontSteerPivots = [];
        this.gltfSpinWheels = [];
        this.gltfSteerPivots = [];
        this.isGltfLoaded = false;

        this._initLightingSystem();
        this._initVehicleFakeEnvironmentLights();
        this._initParticleEffects();
        this._initContactShadow();
        this._initCarAmbientOcclusion();

        // Procedural fallback car model + first car GLTF load
        this.proceduralMesh = this._createCarModel();
        this.proceduralMesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        this.visualBody.add(this.proceduralMesh);

        // Multi-car selection state
        this.activeCarIndex = 0;
        this.activeCarId = CAR_DEFINITIONS[0].id;
        this.driveTuning = CAR_DEFINITIONS[0];
        this._carModelCache = new Map(); // id -> THREE.Object3D
        this._carLoadPromises = new Map(); // id -> Promise

        // Start loading the default car
        this._activateCar(CAR_DEFINITIONS[0]);
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

        // Two Bright Hard Headlight Spotlights (Left and Right)
        this.headlightSpots = [];
        this.headlightTargets = [];

        const offsets = [-0.70, 0.70];
        offsets.forEach(() => {
            const spot = new THREE.SpotLight(0xfff2dc, 130.0, 190, Math.PI / 5.8, 0.48, 1.25);
            spot.castShadow = false;
            this.scene.add(spot);

            const target = new THREE.Object3D();
            this.scene.add(target);
            spot.target = target;

            this.headlightSpots.push(spot);
            this.headlightTargets.push(target);
        });

        // Two Soft Front Fill PointLights (Left and Right)
        this.headlightFillPoints = [];
        offsets.forEach(() => {
            const fillPoint = new THREE.PointLight(0xfff2dc, 4.0, 12, 2.0);
            this.lightsGroup.add(fillPoint);
            this.headlightFillPoints.push(fillPoint);
        });

        // Rear Brake Light Spot
        this.rearBrakeSpot = new THREE.SpotLight(0xff1100, 0, 20, Math.PI / 3, 0.7, 1.2);
        this.scene.add(this.rearBrakeSpot);
        this.rearBrakeTarget = new THREE.Object3D();
        this.scene.add(this.rearBrakeTarget);
        this.rearBrakeSpot.target = this.rearBrakeTarget;

        // Reverse Light Point
        this.reverseLightPoint = new THREE.PointLight(0xffffff, 0, 12);
        this.reverseLightPoint.position.set(0, 0.5, 2.4);
        this.lightsGroup.add(this.reverseLightPoint);
    }

    /* ------------------------------------------------
       VEHICLE FAKE ENVIRONMENT & ROAD BOUNCE LIGHT RIG
       Provides subtle top/front cool fill and road orange/red bounce
       isolated ONLY to the car mesh (Layer 1) without lighting the scene.
       ------------------------------------------------ */
    _initVehicleFakeEnvironmentLights() {
        // High-performance localized top/front cool fill (PointLight with 5.5m distance cutoff)
        // Positioned above the hood and windshield
        this.coolTopFrontFill = new THREE.PointLight(0x9cb5e0, 2.2, 5.5, 2.0);
        this.coolTopFrontFill.position.set(0, 1.8, -1.2);
        this.lightsGroup.add(this.coolTopFrontFill);

        // High-performance localized red/orange road bounce (PointLight with 4.0m distance cutoff)
        // Positioned underneath chassis to bounce onto side sills & wheel arches
        this.warmRoadBounce = new THREE.PointLight(0xff4411, 1.8, 4.0, 2.0);
        this.warmRoadBounce.position.set(0, -0.3, 0.2);
        this.lightsGroup.add(this.warmRoadBounce);
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
            size: 1.7,
            map: new THREE.CanvasTexture(canvas),
            transparent: true,
            opacity: 0.26,
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

        this.waterDropNormalMap = this._initWaterDropletNormalMap();
        this._initWaterSpraySystem();
    }

    _initWaterDropletNormalMap() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Base neutral normal vector (RGB 128, 128, 255)
        ctx.fillStyle = 'rgb(128, 128, 255)';
        ctx.fillRect(0, 0, 512, 512);

        // High-density micro water droplets with realistic radial surface normals
        for (let i = 0; i < 700; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const r = 1.2 + Math.random() * 4.2;

            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgb(128, 128, 255)');      // Center dome peak
            grad.addColorStop(0.5, 'rgb(180, 120, 240)');    // Curved water drop slope
            grad.addColorStop(0.85, 'rgb(225, 75, 195)');    // Drop edge refraction slope
            grad.addColorStop(1, 'rgb(128, 128, 255)');      // Flat panel join

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Elongated water streak channels for rear bodywork physics
        for (let j = 0; j < 50; j++) {
            const sx = Math.random() * 512;
            const sy = Math.random() * 512;
            const len = 14 + Math.random() * 38;
            const w = 1.0 + Math.random() * 2.0;

            const streakGrad = ctx.createLinearGradient(sx, sy, sx, sy + len);
            streakGrad.addColorStop(0, 'rgb(185, 105, 245)');
            streakGrad.addColorStop(0.5, 'rgb(155, 128, 250)');
            streakGrad.addColorStop(1, 'rgb(128, 128, 255)');

            ctx.fillStyle = streakGrad;
            ctx.fillRect(sx - w * 0.5, sy, w, len);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 4);
        return tex;
    }

    _initWaterSpraySystem() {
        const count = 140;
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
        grad.addColorStop(0, 'rgba(235, 245, 255, 0.70)');
        grad.addColorStop(0.35, 'rgba(195, 215, 240, 0.30)');
        grad.addColorStop(1, 'rgba(140, 165, 195, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);

        const sprayMat = new THREE.PointsMaterial({
            size: 0.85,
            map: new THREE.CanvasTexture(canvas),
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            blending: THREE.NormalBlending,
        });

        this.waterSprayParticles = new THREE.Points(geo, sprayMat);
        this.scene.add(this.waterSprayParticles);

        this.waterSprayData = Array.from({ length: count }, () => ({
            vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.35, opacity: 0
        }));
        this.nextSprayIdx = 0;
    }

    _emitWaterSpray(x, z, intensity) {
        if (!this.waterSprayData) return;
        if (this._mistV2Active()) return; // TireMist v2 handles wheel spray
        const data = this.waterSprayData[this.nextSprayIdx];
        const pos = this.waterSprayParticles.geometry.attributes.position.array;
        const idx = this.nextSprayIdx * 3;

        const sinH = Math.sin(this.heading);
        const cosH = Math.cos(this.heading);

        pos[idx] = x + (Math.random() - 0.5) * 0.25;
        pos[idx + 1] = 0.06 + Math.random() * 0.12;
        pos[idx + 2] = z + (Math.random() - 0.5) * 0.25;

        // Water mist blows backward relative to vehicle heading
        data.vx = sinH * (this.vLong * 0.35) + (Math.random() - 0.5) * 0.8;
        data.vy = 0.6 + Math.random() * 0.9;
        data.vz = cosH * (this.vLong * 0.35) + (Math.random() - 0.5) * 0.8;
        data.life = 0;
        data.maxLife = 0.25 + Math.random() * 0.20;
        data.opacity = 0.35 * intensity;

        this.nextSprayIdx = (this.nextSprayIdx + 1) % this.waterSprayData.length;
    }

    _initContactShadow() {
        const shadowMat = new THREE.ShaderMaterial({
            uniforms: {
                uOpacity: { value: 0.88 },
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uOpacity;
                varying vec2 vUv;

                float ellipse(vec2 p, vec2 c, vec2 r, float soft) {
                    vec2 q = (p - c) / r;
                    float d = dot(q, q);
                    return 1.0 - smoothstep(1.0 - soft, 1.0, d);
                }

                void main() {
                    float body = ellipse(vUv, vec2(0.5, 0.50), vec2(0.28, 0.48), 0.72) * 0.72;
                    float core = ellipse(vUv, vec2(0.5, 0.50), vec2(0.18, 0.34), 0.68) * 0.46;
                    float mask = max(body, core);
                    float alpha = mask * uOpacity;
                    if (alpha < 0.01) discard;
                    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 7.0), shadowMat);
        this.contactShadow.rotation.x = -Math.PI / 2;
        this.contactShadow.renderOrder = 4;
        this.scene.add(this.contactShadow);
    }

    _initCarAmbientOcclusion() {
        const aoMat = new THREE.ShaderMaterial({
            uniforms: {
                uOpacity: { value: 0.62 },
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uOpacity;
                varying vec2 vUv;

                float ellipse(vec2 p, vec2 c, vec2 r, float soft) {
                    vec2 q = (p - c) / r;
                    float d = dot(q, q);
                    return 1.0 - smoothstep(1.0 - soft, 1.0, d);
                }

                void main() {
                    float center = ellipse(vUv, vec2(0.5, 0.52), vec2(0.34, 0.50), 0.78) * 0.82;
                    float core = ellipse(vUv, vec2(0.5, 0.54), vec2(0.20, 0.36), 0.70) * 0.58;
                    float alpha = max(center, core) * uOpacity;
                    if (alpha < 0.01) discard;
                    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
        });

        this.carAO = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.35), aoMat);
        this.carAO.rotation.x = -Math.PI / 2;
        this.carAO.position.set(0, 0.08, 0.1);
        this.carAO.renderOrder = 30;
        this.mesh.add(this.carAO);
    }

    _getShadowLightVector() {
        const carPos = this.mesh.position;
        const lightVector = new THREE.Vector3(15, 0, -160).normalize().multiplyScalar(0.22);

        const carCycle = Math.round((-carPos.z) / 85.0);
        for (let cycle = carCycle - 2; cycle <= carCycle + 2; cycle++) {
            const lampZ = -cycle * 85.0;
            const lampPoint = getRoadPoint(lampZ);
            const lampNx = Math.cos(lampPoint.angle);
            const lampNz = Math.sin(lampPoint.angle);
            const sideSign = cycle % 2 === 0 ? -1 : 1;
            const lampX = lampPoint.x + lampNx * (sideSign * 11.6) - lampNx * sideSign * 2.35;
            const lampBulbZ = lampZ + lampNz * (sideSign * 11.6) - lampNz * sideSign * 2.35;

            const toLamp = new THREE.Vector3(lampX - carPos.x, 0, lampBulbZ - carPos.z);
            const distSq = Math.max(toLamp.lengthSq(), 1.0);
            if (distSq > 4200) continue;

            const weight = 145 / distSq;
            lightVector.add(toLamp.normalize().multiplyScalar(weight));
        }

        if (lightVector.lengthSq() < 0.0001) {
            lightVector.set(0, 0, -1);
        }
        return lightVector.normalize();
    }

    _mistV2Active() {
        return typeof window !== 'undefined' && window.__LRA_TIREMIST_V2;
    }

    _emitSmoke(x, z, intensity) {
        // Modular TireMist (weather/particles) renders tire smoke + spray with
        // proper alpha sheets — stand down to avoid double-covering the screen.
        if (this._mistV2Active()) return;
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
    /* ------------------------------------------------
       PROCEDURAL CAR MODEL FALLBACK & GLTF LOADER
       ------------------------------------------------ */
    _createCarModel() {
        const rootGroup = new THREE.Group();
        this.dissectedParts = [];
        this.wheels = [];
        this.frontWheels = [];
        this.wheelSpinGroups = [];

        // Photorealistic Materials with Enhanced Specular Response & Clearcoat
        const bodyMat = new THREE.MeshPhysicalMaterial({
            color: 0xd11a2a,
            metalness: 0.35,
            roughness: 0.16,
            clearcoat: 1.0,
            clearcoatRoughness: 0.06,
            reflectivity: 0.9,
        });
        this._registerPaint(bodyMat);
        const carbonMat = new THREE.MeshStandardMaterial({ color: 0x111115, metalness: 0.95, roughness: 0.15 });
        const chassisMat = new THREE.MeshStandardMaterial({ color: 0x22252a, metalness: 0.85, roughness: 0.30 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x112233, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.55 });
        const engineMat = new THREE.MeshStandardMaterial({ color: 0x555566, metalness: 0.92, roughness: 0.20 });
        const engineCoverMat = new THREE.MeshStandardMaterial({ color: 0xcc1100, metalness: 0.80, roughness: 0.25 });
        this.tireMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x1a1a1a,
            roughness: 0.65,
            metalness: 0.2,
            clearcoat: 0.0,
            clearcoatRoughness: 0.2,
        });
        const tireMat = this.tireMaterial;
        const rimMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.95, roughness: 0.08 });
        const rotorMat = new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.92, roughness: 0.25 });
        const caliperMat = new THREE.MeshStandardMaterial({ color: 0xee1100, metalness: 0.85, roughness: 0.18 });

        const addDissectedPart = (mesh, homePos, explodedPos, homeRot = [0, 0, 0], explodedRot = [0, 0, 0]) => {
            mesh.position.set(...homePos);
            mesh.rotation.set(...homeRot);
            rootGroup.add(mesh);
            const entry = {
                mesh,
                homePos: new THREE.Vector3(...homePos),
                explodedPos: new THREE.Vector3(...explodedPos),
                homeRot: new THREE.Euler(...homeRot),
                explodedRot: new THREE.Euler(...explodedRot),
            };
            this.dissectedParts.push(entry);
            return entry;
        };

        // 1. Chassis & Floorboard Frame
        const chassisGroup = new THREE.Group();
        const floor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 4.4), chassisMat);
        floor.position.y = 0.25;
        chassisGroup.add(floor);
        [-0.85, 0.85].forEach(x => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 4.2), chassisMat);
            rail.position.set(x, 0.35, 0);
            chassisGroup.add(rail);
        });
        addDissectedPart(chassisGroup, [0, 0.1, 0], [0, -0.6, 0]);

        // 2. Front Hood
        const hoodGroup = new THREE.Group();
        const hoodMesh = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.4), bodyMat);
        hoodGroup.add(hoodMesh);
        addDissectedPart(hoodGroup, [0, 0.85, -1.25], [0, 2.2, -2.6], [0.1, 0, 0], [0.4, 0, 0]);

        // 3. Left Scissor Door
        const doorLGroup = new THREE.Group();
        const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.65, 1.6), bodyMat);
        doorLGroup.add(doorL);
        const winL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 1.0), glassMat);
        winL.position.set(0, 0.45, 0);
        doorLGroup.add(winL);
        addDissectedPart(doorLGroup, [-1.02, 0.75, -0.1], [-2.4, 1.9, -0.1], [0, 0, 0], [0, 0, -0.45]);

        // 4. Right Scissor Door
        const doorRGroup = new THREE.Group();
        const doorR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.65, 1.6), bodyMat);
        doorRGroup.add(doorR);
        const winR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 1.0), glassMat);
        winR.position.set(0, 0.45, 0);
        doorRGroup.add(winR);
        addDissectedPart(doorRGroup, [1.02, 0.75, -0.1], [2.4, 1.9, -0.1], [0, 0, 0], [0, 0, 0.45]);

        // 5. Front Bumper & Splitter
        const fbGroup = new THREE.Group();
        const fbMesh = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.45, 0.6), bodyMat);
        fbGroup.add(fbMesh);
        const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.06, 0.7), carbonMat);
        splitter.position.set(0, -0.22, 0.05);
        fbGroup.add(splitter);
        addDissectedPart(fbGroup, [0, 0.45, -2.35], [0, 0.45, -3.8]);

        // 6. Rear Bumper & Diffuser
        const rbGroup = new THREE.Group();
        const rbMesh = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.50, 0.6), bodyMat);
        rbGroup.add(rbMesh);
        const diffuser = new THREE.Mesh(new THREE.BoxGeometry(2.10, 0.15, 0.65), carbonMat);
        diffuser.position.set(0, -0.22, 0.05);
        rbGroup.add(diffuser);
        addDissectedPart(rbGroup, [0, 0.48, 2.35], [0, 0.48, 3.8]);

        // 7. Active Aero Rear Spoiler
        const spoilerGroup = new THREE.Group();
        const wingMesh = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.06, 0.40), carbonMat);
        spoilerGroup.add(wingMesh);
        [-0.6, 0.6].forEach(sx => {
            const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.15), carbonMat);
            stanchion.position.set(sx, -0.18, 0);
            spoilerGroup.add(stanchion);
        });
        addDissectedPart(spoilerGroup, [0, 1.05, 2.15], [0, 2.6, 2.8]);
        this.spoilerPart = spoilerGroup;
        this.spoilerHomePos = new THREE.Vector3(0, 1.05, 2.15);

        // 8. Twin-Turbo V8 Engine Block
        const engGroup = new THREE.Group();
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 1.1), engineMat);
        engGroup.add(block);
        const valveCoverL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.95), engineCoverMat);
        valveCoverL.position.set(-0.35, 0.32, 0);
        engGroup.add(valveCoverL);
        const valveCoverR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.95), engineCoverMat);
        valveCoverR.position.set(0.35, 0.32, 0);
        engGroup.add(valveCoverR);
        addDissectedPart(engGroup, [0, 0.65, 0.8], [0, 2.5, 0.8]);

        // 9. Dashboard, Interior & Steering Wheel
        const intGroup = new THREE.Group();
        const dash = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 0.7), carbonMat);
        intGroup.add(dash);
        const swGroup = new THREE.Group();
        const swRim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 24), carbonMat);
        swGroup.add(swRim);
        swGroup.position.set(-0.42, 0.25, -0.35);
        intGroup.add(swGroup);
        this.steeringWheelMesh = swGroup;
        addDissectedPart(intGroup, [0, 0.95, -0.2], [0, 1.9, -0.2]);

        // 10. Carbon Roof Canopy
        const roofGroup = new THREE.Group();
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 1.6), carbonMat);
        roofGroup.add(roof);
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.05, 1.1), glassMat);
        windshield.position.set(0, -0.15, -1.0);
        windshield.rotation.x = 0.35;
        roofGroup.add(windshield);
        addDissectedPart(roofGroup, [0, 1.25, 0.1], [0, 3.3, 0.1]);

        // 11. Front Fenders (Left & Right)
        const fendFL = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.55, 1.5), bodyMat);
        addDissectedPart(fendFL, [-0.95, 0.70, -1.4], [-2.0, 1.1, -1.8]);
        const fendFR = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.55, 1.5), bodyMat);
        addDissectedPart(fendFR, [0.95, 0.70, -1.4], [2.0, 1.1, -1.8]);

        // 12. Rear Quarter Panels (Left & Right)
        const fendRL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.60, 1.5), bodyMat);
        addDissectedPart(fendRL, [-0.98, 0.72, 1.4], [-2.0, 1.1, 1.8]);
        const fendRR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.60, 1.5), bodyMat);
        addDissectedPart(fendRR, [0.98, 0.72, 1.4], [2.0, 1.1, 1.8]);

        // 13. Four Fully Dissected Wheel Assemblies (Tire, Rim, Rotor, Caliper)
        // 13. Four Fully Dissected Wheel Assemblies (Kingpin Pivot -> Spin Axle -> Wheel Geometry)
        const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.25, 24);
        const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.26, 12);
        const rotorGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16);
        const caliperGeo = new THREE.BoxGeometry(0.12, 0.18, 0.22);

        const wheelCfg = [
            { x: -1.05, z: -1.5, front: true, side: -1 },
            { x: 1.05, z: -1.5, front: true, side: 1 },
            { x: -1.05, z: 1.4, front: false, side: -1 },
            { x: 1.05, z: 1.4, front: false, side: 1 },
        ];

        this.wheelSpinGroups = [];
        this.frontSteerPivots = [];
        this.wheelAssemblyGroups = [];

        wheelCfg.forEach(({ x, z, front, side }) => {
            // Suspension pivot holds the full corner assembly and moves vertically
            const suspensionPivot = new THREE.Group();
            const restPosition = new THREE.Vector3(x, 0.38, z);
            suspensionPivot.position.copy(restPosition);
            rootGroup.add(suspensionPivot);
            this.wheelAssemblyGroups.push(suspensionPivot);

            // Kingpin Steering Pivot Group (handles steering angle Y rotation)
            const steerPivot = new THREE.Group();
            suspensionPivot.add(steerPivot);

            // Stationary Brake Caliper (Attached to steerPivot)
            const caliper = new THREE.Mesh(caliperGeo, caliperMat);
            caliper.position.set(0, 0.15, -0.05);
            steerPivot.add(caliper);

            // Wheel Spin Group (Child of steerPivot - handles forward axle rolling X rotation)
            const spinGroup = new THREE.Group();

            const tire = new THREE.Mesh(wheelGeo, tireMat);
            tire.rotation.z = Math.PI / 2;
            spinGroup.add(tire);

            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.z = Math.PI / 2;
            spinGroup.add(rim);

            const rotor = new THREE.Mesh(rotorGeo, rotorMat);
            rotor.rotation.z = Math.PI / 2;
            rotor.position.x = -side * 0.04;
            spinGroup.add(rotor);

            steerPivot.add(spinGroup);

            const entry = {
                mesh: suspensionPivot,
                homePos: restPosition.clone(),
                explodedPos: new THREE.Vector3(x + side * 1.6, 0.38, z),
            };
            this.dissectedParts.push(entry);
            suspensionPivot.userData.dissectEntry = entry;
            this._applyWheelDisplacement(suspensionPivot, entry, 0);

            this.wheelSpinGroups.push(spinGroup);
            if (front) this.frontSteerPivots.push(steerPivot);
        });

        this.proceduralBodyGroup = rootGroup;
        return rootGroup;
    }

    /** Register a material as paintable (clearcoat body work). */
    _registerPaint(mat) {
        if (mat && (mat.clearcoat > 0.3 || /paint|body|coat/i.test(mat.name || ''))) {
            if (this.paintMats.size === 0) { /* first registration */ }
            this.paintMats.add(mat);
            mat.color.setHex(this.paints[this.paintIndex].hex);
        }
    }

    /** Cycle the body paint (KeyB). Returns the chosen paint info. */
    cyclePaint() {
        if (!this.paintMats || this.paintMats.size === 0) return null;
        this.paintIndex = (this.paintIndex + 1) % this.paints.length;
        try { localStorage.setItem('lra_paint', String(this.paintIndex)); } catch (e) { /* noop */ }
        const p = this.paints[this.paintIndex];
        this.paintMats.forEach(m => m.color.setHex(p.hex));
        return p;
    }

    _loadFerrariModel() {
        // Legacy entry point — delegates to generic car loader for backwards compatibility
        return this._loadCarModel(CAR_DEFINITIONS[0]);
    }

    /**
     * Load and cache a GLTF car model by definition. Returns a promise that resolves
     * when the model is ready. The Ferrari gets special treatment for named wheel meshes
     * and body material; the Audi is normalized by bounding box and has shadow casting
     * disabled to stay within the triangle budget.
     */
    _loadCarModel(definition) {
        if (this._carLoadPromises.has(definition.id)) {
            return this._carLoadPromises.get(definition.id);
        }

        const promise = new Promise((resolve) => {
            try {
                const dracoLoader = new DRACOLoader();
                dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
                const loader = new GLTFLoader();
                loader.setDRACOLoader(dracoLoader);

                loader.load(definition.asset, (gltf) => {
                    const carModel = gltf.scene;

                    if (definition.id === 'ferrari') {
                        this._setupFerrariModel(carModel);
                    } else {
                        this._setupGenericModel(carModel, definition);
                    }

                    carModel.visible = false;
                    this.visualBody.add(carModel);
                    this._carModelCache.set(definition.id, carModel);
                    resolve(carModel);
                }, undefined, (err) => {
                    console.warn(`${definition.label} GLTF load warning (using procedural fallback):`, err);
                    resolve(null);
                });
            } catch (e) {
                console.warn('GLTFLoader error:', e);
                resolve(null);
            }
        });

        this._carLoadPromises.set(definition.id, promise);
        return promise;
    }

    /** Ferrari-specific model setup: named wheels, body paint material, headlight/taillight materials */
    _setupFerrariModel(carModel) {
        carModel.scale.set(1.0, 1.0, 1.0);
        // Ground the model: wheel bottoms must touch y=0 (fixes "car floats in air")
        const _bbox = new THREE.Box3().setFromObject(carModel);
        if (isFinite(_bbox.min.y)) carModel.position.y = -_bbox.min.y + 0.005;
        else carModel.position.set(0, 0, 0);

        carModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                // Collect body-paint materials for the garage (KeyB)
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => { if (child.name !== 'lights' && child.name !== 'lights_red') this._registerPaint(m); });

                if (child.name === 'lights') {
                    this.gltfHeadlightMat = new THREE.MeshStandardMaterial({
                        color: 0xdde8ff,
                        emissive: 0xdde8ff,
                        emissiveIntensity: 0.35,
                        transparent: true,
                        opacity: 0.55,
                        side: THREE.FrontSide,
                    });
                    this.gltfHeadlightMesh = child;
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
            const spinWheels = [];
            const steerPivots = [];

            const rawWheels = [
                { mesh: wheelFL, isFront: true },
                { mesh: wheelFR, isFront: true },
                { mesh: wheelRL, isFront: false },
                { mesh: wheelRR, isFront: false },
            ];

            rawWheels.forEach(({ mesh, isFront }) => {
                const parent = mesh.parent;
                const suspensionPivot = new THREE.Group();
                suspensionPivot.position.copy(mesh.position);
                parent.add(suspensionPivot);

                const steerPivot = new THREE.Group();
                suspensionPivot.add(steerPivot);

                const spinGroup = new THREE.Group();
                steerPivot.add(spinGroup);

                mesh.position.set(0, 0, 0);
                spinGroup.add(mesh);

                suspensionPivot.userData.restPosition = suspensionPivot.position.clone();
                suspensionPivot.userData.cornerIndex = spinWheels.length;

                spinWheels.push(spinGroup);
                if (isFront) {
                    steerPivots.push(steerPivot);
                }
            });

            carModel.userData.spinWheels = spinWheels;
            carModel.userData.steerPivots = steerPivots;
        } else {
            carModel.userData.spinWheels = [];
            carModel.userData.steerPivots = [];
        }

        const bodyMesh = carModel.getObjectByName('body');
        if (bodyMesh) {
            this.bodyMaterial = new THREE.MeshPhysicalMaterial({
                color: 0xd11a2a,
                metalness: 0.35,
                roughness: 0.16,
                clearcoat: 1.0,
                clearcoatRoughness: 0.06,
                reflectivity: 0.9,
            });
            bodyMesh.material = this.bodyMaterial;
            this._registerPaint(this.bodyMaterial);
        }
    }

    _buildTriangleGeometry(sourceGeometry, vertexIndices) {
        const geometry = new THREE.BufferGeometry();

        Object.entries(sourceGeometry.attributes).forEach(([name, attribute]) => {
            const ArrayType = attribute.array.constructor;
            const values = new ArrayType(vertexIndices.length * attribute.itemSize);

            for (let i = 0; i < vertexIndices.length; i++) {
                const sourceIndex = vertexIndices[i];
                for (let component = 0; component < attribute.itemSize; component++) {
                    values[i * attribute.itemSize + component] = attribute.getComponent
                        ? attribute.getComponent(sourceIndex, component)
                        : attribute.array[sourceIndex * attribute.itemSize + component];
                }
            }

            geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized));
        });

        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    _computeGenericWheelCenters(tireMesh) {
        if (!tireMesh || !tireMesh.geometry) return null;

        const position = tireMesh.geometry.attributes.position;
        const index = tireMesh.geometry.index;
        const triangleCount = index ? index.count : position.count;
        const buckets = [
            { name: 'fl', count: 0, x: 0, y: 0, z: 0 },
            { name: 'fr', count: 0, x: 0, y: 0, z: 0 },
            { name: 'rl', count: 0, x: 0, y: 0, z: 0 },
            { name: 'rr', count: 0, x: 0, y: 0, z: 0 },
        ];

        for (let i = 0; i < triangleCount; i += 3) {
            const ia = index ? index.getX(i) : i;
            const ib = index ? index.getX(i + 1) : i + 1;
            const ic = index ? index.getX(i + 2) : i + 2;
            const x = (position.getX(ia) + position.getX(ib) + position.getX(ic)) / 3;
            const y = (position.getY(ia) + position.getY(ib) + position.getY(ic)) / 3;
            const z = (position.getZ(ia) + position.getZ(ib) + position.getZ(ic)) / 3;

            const bucketIndex = x > 0 ? (y < 0 ? 0 : 1) : (y < 0 ? 2 : 3);
            const bucket = buckets[bucketIndex];
            bucket.count++;
            bucket.x += x;
            bucket.y += y;
            bucket.z += z;
        }

        if (buckets.some((bucket) => bucket.count === 0)) return null;
        return buckets.map((bucket) => new THREE.Vector3(
            bucket.x / bucket.count,
            bucket.y / bucket.count,
            bucket.z / bucket.count,
        ));
    }

    _setupGenericWheelPivots(carModel, definition) {
        const matchers = definition.wheelPartMatchers || [];
        if (matchers.length === 0) {
            return { spinWheels: [], steerPivots: [] };
        }

        const candidateMeshes = [];
        carModel.traverse((node) => {
            if (!node.isMesh) return;
            const nodeName = (node.name || '').toLowerCase();
            const materialName = (node.material && node.material.name ? node.material.name : '').toLowerCase();
            if (matchers.some((matcher) => nodeName.includes(matcher) || materialName.includes(matcher))) {
                candidateMeshes.push(node);
            }
        });

        const tireMesh = candidateMeshes.find((mesh) => (mesh.name || '').toLowerCase().includes('tire'));
        const centers = this._computeGenericWheelCenters(tireMesh) || [
            new THREE.Vector3(1.694, -1.181, 0.380),
            new THREE.Vector3(1.694, 1.181, 0.380),
            new THREE.Vector3(-1.662, -1.223, 0.417),
            new THREE.Vector3(-1.662, 1.223, 0.417),
        ];

        const wheelRoot = new THREE.Group();
        wheelRoot.name = 'generic-independent-wheels';
        carModel.add(wheelRoot);

        const spinWheels = [];
        const steerPivots = [];
        const suspensionAxis = new THREE.Vector3(0, 0, 1); // Audi source geometry is Z-up before model normalization
        const steerAxis = new THREE.Vector3(0, 0, 1);
        const spinAxis = new THREE.Vector3(0, 1, 0);

        centers.forEach((center, cornerIndex) => {
            const suspensionPivot = new THREE.Group();
            suspensionPivot.name = `audi_suspension_${cornerIndex}`;
            suspensionPivot.position.copy(center);
            suspensionPivot.userData.restPosition = center.clone();
            suspensionPivot.userData.suspensionAxis = suspensionAxis;
            suspensionPivot.userData.cornerIndex = cornerIndex;

            const steerPivot = new THREE.Group();
            steerPivot.userData.steerAxis = steerAxis;
            suspensionPivot.add(steerPivot);

            const spinGroup = new THREE.Group();
            spinGroup.userData.spinAxis = spinAxis;
            steerPivot.add(spinGroup);

            wheelRoot.add(suspensionPivot);
            spinWheels.push(spinGroup);
            if (cornerIndex < 2) steerPivots.push(steerPivot);
        });

        candidateMeshes.forEach((sourceMesh) => {
            const geometry = sourceMesh.geometry;
            const position = geometry.attributes.position;
            const index = geometry.index;
            const triangleCount = index ? index.count : position.count;
            const selectedIndices = centers.map(() => []);
            const leftoverIndices = [];
            const lowerName = (sourceMesh.name || '').toLowerCase();
            const maxDistance = lowerName.includes('metal_red') ? 0.75 : 0.90;

            for (let i = 0; i < triangleCount; i += 3) {
                const ia = index ? index.getX(i) : i;
                const ib = index ? index.getX(i + 1) : i + 1;
                const ic = index ? index.getX(i + 2) : i + 2;
                const x = (position.getX(ia) + position.getX(ib) + position.getX(ic)) / 3;
                const y = (position.getY(ia) + position.getY(ib) + position.getY(ic)) / 3;
                const z = (position.getZ(ia) + position.getZ(ib) + position.getZ(ic)) / 3;

                let bestIndex = -1;
                let bestDistance = Infinity;
                centers.forEach((center, centerIndex) => {
                    const distance = Math.hypot(x - center.x, y - center.y);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestIndex = centerIndex;
                    }
                });

                const target = (bestIndex >= 0 && bestDistance <= maxDistance && Math.abs(z - centers[bestIndex].z) <= 0.75)
                    ? selectedIndices[bestIndex]
                    : leftoverIndices;
                target.push(ia, ib, ic);
            }

            selectedIndices.forEach((indices, cornerIndex) => {
                if (indices.length === 0) return;
                const wheelGeometry = this._buildTriangleGeometry(geometry, indices);
                const center = centers[cornerIndex];
                wheelGeometry.translate(-center.x, -center.y, -center.z);

                const wheelPart = new THREE.Mesh(wheelGeometry, sourceMesh.material);
                wheelPart.name = `${sourceMesh.name || 'wheel_part'}_${cornerIndex}`;
                wheelPart.castShadow = false;
                wheelPart.receiveShadow = true;
                spinWheels[cornerIndex].add(wheelPart);
            });

            sourceMesh.visible = false;

            if (leftoverIndices.length > 0) {
                const leftoverGeometry = this._buildTriangleGeometry(geometry, leftoverIndices);
                const leftoverMesh = new THREE.Mesh(leftoverGeometry, sourceMesh.material);
                leftoverMesh.name = `${sourceMesh.name || 'wheel_part'}_body_remainder`;
                leftoverMesh.position.copy(sourceMesh.position);
                leftoverMesh.rotation.copy(sourceMesh.rotation);
                leftoverMesh.scale.copy(sourceMesh.scale);
                leftoverMesh.castShadow = false;
                leftoverMesh.receiveShadow = true;
                (sourceMesh.parent || carModel).add(leftoverMesh);
            }
        });

        return { spinWheels, steerPivots };
    }

    /** Generic model setup (Audi, etc): normalize by bounding box, disable shadow casting */
    _setupGenericModel(carModel, definition) {
        const wheelData = this._setupGenericWheelPivots(carModel, definition);
        carModel.userData.spinWheels = wheelData.spinWheels;
        carModel.userData.steerPivots = wheelData.steerPivots;

        // Normalize to ~4.9m longest axis
        const bounds = new THREE.Box3().setFromObject(carModel);
        const size = bounds.getSize(new THREE.Vector3());
        const scale = 4.9 / Math.max(size.x, size.z);
        carModel.scale.multiplyScalar(scale);
        carModel.rotation.y = Math.PI / 2;
        carModel.updateMatrixWorld(true);

        // Center and ground the model
        const aligned = new THREE.Box3().setFromObject(carModel);
        const center = aligned.getCenter(new THREE.Vector3());
        carModel.position.x -= center.x;
        carModel.position.z -= center.z;
        carModel.position.y -= aligned.min.y;

        // Disable per-mesh shadow casting to contain high-poly asset performance
        carModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = false;
                node.receiveShadow = true;
            }
        });
    }

    /**
     * Activate a car definition: load its model, apply physics, toggle visibility.
     * Returns a promise that resolves when the new car is visible.
     */
    async _activateCar(definition) {
        // Apply physics profile immediately
        this.mass = definition.mass;
        this.wheelbase = definition.wheelbase;
        this.wheelRadius = definition.wheelRadius;
        this.maxSpeed = definition.topSpeedKmh / 3.6;
        this.driveTuning = definition;
        this.activeCarId = definition.id;
        this.activeCarIndex = CAR_DEFINITIONS.indexOf(definition);

        // Load the model if not cached
        const model = await this._loadCarModel(definition);

        // Hide all cached car models
        for (const [, cachedModel] of this._carModelCache) {
            cachedModel.visible = false;
        }

        if (model) {
            model.visible = true;
            if (this.proceduralMesh) this.proceduralMesh.visible = false;

            this.gltfSpinWheels = model.userData.spinWheels || [];
            this.gltfSteerPivots = model.userData.steerPivots || [];
            this.isGltfLoaded = this.gltfSpinWheels.length > 0;
        } else {
            // Fallback to procedural model
            if (this.proceduralMesh) this.proceduralMesh.visible = true;
            this.gltfSpinWheels = [];
            this.gltfSteerPivots = [];
            this.isGltfLoaded = false;
        }
        this._resetWheelAssemblies();
    }

    /** Cycle to the next car in CAR_DEFINITIONS. Returns the new car id. */
    async selectNextCar() {
        const nextIndex = (this.activeCarIndex + 1) % CAR_DEFINITIONS.length;
        await this._activateCar(CAR_DEFINITIONS[nextIndex]);
        return this.activeCarId;
    }

    /** Get the active car's full definition record. */
    getActiveCar() {
        return CAR_DEFINITIONS.find((car) => car.id === this.activeCarId) || CAR_DEFINITIONS[0];
    }

    /** Zero all motion state for studio positioning. */
    resetMotion() {
        this.vLong = 0;
        this.vLat = 0;
        this.yawRate = 0;
        this.aLong = 0;
        this.aLat = 0;
        this.pitchAngle = 0;
        this.pitchVel = 0;
        this.rollAngle = 0;
        this.rollVel = 0;
        this.heaveDisplacement = 0;
        this.heaveVel = 0;
        this.speed = 0;

        this.wheelStates.forEach((corner) => {
            corner.compression = 0;
            corner.velocity = 0;
            corner.force = 0;
            corner.travel = 0;
        });
        this.visualBody.rotation.x = 0;
        this.visualBody.rotation.z = 0;
        this.visualBody.position.y = 0;

        this._resetWheelAssemblies();
    }

    _resetWheelAssemblies() {
        if (this.gltfSpinWheels.length > 0) {
            this.gltfSpinWheels.forEach((spinGroup) => {
                const assembly = spinGroup.parent ? spinGroup.parent.parent : null;
                if (assembly && assembly.userData.restPosition) {
                    const axis = assembly.userData.suspensionAxis || this.defaultSuspensionAxis;
                    assembly.position.copy(assembly.userData.restPosition).addScaledVector(axis, 0);
                }
            });
        } else if (this.wheelAssemblyGroups) {
            this.wheelAssemblyGroups.forEach((assembly) => {
                const entry = assembly.userData.dissectEntry;
                if (entry) this._applyWheelDisplacement(assembly, entry, 0);
            });
        }
    }

    /** Gentle visual-only update for studio showroom (no physics, no road boundary). */
    updateShowroom(dt) {
        this.mesh.rotation.y = this.heading;
        this.visualBody.rotation.x = 0;
        this.visualBody.rotation.z = 0;
        this.visualBody.position.y = 0;
    }

    _applyWheelDisplacement(assembly, entry, displacement) {
        assembly.position.x = THREE.MathUtils.lerp(entry.homePos.x, entry.explodedPos.x, this.dissectionFactor);
        assembly.position.y = THREE.MathUtils.lerp(entry.homePos.y, entry.explodedPos.y, this.dissectionFactor) + displacement;
        assembly.position.z = THREE.MathUtils.lerp(entry.homePos.z, entry.explodedPos.z, this.dissectionFactor);
    }

    _updateSuspension(dt, input) {
        const aLong = this.acceleratingSystem ? this.acceleratingSystem.aLong : 0;
        const aLat = this.turningSystem ? this.turningSystem.aLat : 0;
        const speedAbs = Math.abs(this.vLong);
        const speedRatio = THREE.MathUtils.clamp(speedAbs / 38.0, 0, 1);
        const distance = -this.mesh.position.z;
        const microBump = (Math.sin(distance * 1.17) * 0.45 + Math.sin(distance * 2.09) * 0.22)
            * 0.006 * speedRatio;

        this.wheelStates.forEach((corner, index) => {
            const frontLoad = aLong * 0.010;
            const sideLoad = aLat * 0.0065;
            const roadInput = microBump * (0.45 + index * 0.18);
            const targetCompression = THREE.MathUtils.clamp(
                (corner.isFront ? -frontLoad : frontLoad)
                + (corner.x < 0 ? -sideLoad : sideLoad)
                + roadInput,
                -this.suspensionTravelMax,
                this.suspensionTravelMax,
            );

            corner.velocity += ((targetCompression - corner.compression) * this.suspensionSpring
                - corner.velocity * this.suspensionDamper) * dt;
            corner.compression = THREE.MathUtils.clamp(
                corner.compression + corner.velocity * dt,
                -this.suspensionTravelMax,
                this.suspensionTravelMax,
            );
            corner.force = corner.compression * this.suspensionSpring;
            corner.travel = corner.compression;
        });

        const frontLift = -(this.wheelStates[0].travel + this.wheelStates[1].travel) * 0.5;
        const rearLift = -(this.wheelStates[2].travel + this.wheelStates[3].travel) * 0.5;
        const leftLift = -(this.wheelStates[0].travel + this.wheelStates[2].travel) * 0.5;
        const rightLift = -(this.wheelStates[1].travel + this.wheelStates[3].travel) * 0.5;

        const brakeDiveBonus = (input.backward && this.vLong > 0.5) ? 0.018 : 0;
        const squatBonus = (this.acceleratingSystem.aLong > 5) ? 0.006 : 0;
        const targetPitch = THREE.MathUtils.clamp(
            Math.atan2(frontLift - rearLift, this.wheelbase) * 1.35 - brakeDiveBonus + squatBonus,
            -0.075,
            0.075,
        );
        const targetRoll = THREE.MathUtils.clamp(
            Math.atan2(rightLift - leftLift, this.trackWidth) * 1.18 - (aLat / 9.81) * 0.010,
            -0.085,
            0.085,
        );
        const targetHeave = THREE.MathUtils.clamp(
            (frontLift + rearLift) * 0.5 - (Math.abs(aLong) / 9.81) * 0.006,
            -0.055,
            0.055,
        );

        this.pitchVel += (targetPitch - this.pitchAngle) * 7.2 * dt - this.pitchVel * 6.0 * dt;
        this.pitchAngle += this.pitchVel * dt;
        this.rollVel += (targetRoll - this.rollAngle) * 7.2 * dt - this.rollVel * 6.0 * dt;
        this.rollAngle += this.rollVel * dt;
        this.heaveVel += (targetHeave - this.heaveDisplacement) * 8.5 * dt - this.heaveVel * 6.8 * dt;
        this.heaveDisplacement += this.heaveVel * dt;

        this.mesh.rotation.y = this.heading;
        this.visualBody.rotation.x = this.pitchAngle;
        this.visualBody.rotation.z = this.rollAngle;
        this.visualBody.position.y = Math.max(-0.05, this.heaveDisplacement);

        if (this.isGltfLoaded && this.gltfSpinWheels.length > 0) {
            this.gltfSpinWheels.forEach((spinGroup, index) => {
                const assembly = spinGroup.parent ? spinGroup.parent.parent : null;
                const state = this.wheelStates[index];
                if (assembly && state && assembly.userData.restPosition) {
                    const axis = assembly.userData.suspensionAxis || this.defaultSuspensionAxis;
                    assembly.position.copy(assembly.userData.restPosition).addScaledVector(axis, state.travel);
                }
            });
        } else if (this.wheelAssemblyGroups.length > 0) {
            this.wheelAssemblyGroups.forEach((assembly, index) => {
                const state = this.wheelStates[index];
                const entry = assembly.userData.dissectEntry;
                if (state && entry) {
                    this._applyWheelDisplacement(assembly, entry, state.travel);
                }
            });
        }
    }

    _updateDissection(dt, input) {
        if (input.dissect) {
            this.dissectionTarget = 1.0;
        } else {
            this.dissectionTarget = 0.0;
        }

        const lerpSpeed = Math.min(1.0, 7.0 * dt);
        this.dissectionFactor += (this.dissectionTarget - this.dissectionFactor) * lerpSpeed;

        // Smoothly interpolate all dissected car components between home and exploded positions
        this.dissectedParts.forEach(p => {
            if (p.mesh) {
                p.mesh.position.lerpVectors(p.homePos, p.explodedPos, this.dissectionFactor);
                if (p.homeRot && p.explodedRot) {
                    p.mesh.rotation.x = THREE.MathUtils.lerp(p.homeRot.x, p.explodedRot.x, this.dissectionFactor);
                    p.mesh.rotation.y = THREE.MathUtils.lerp(p.homeRot.y, p.explodedRot.y, this.dissectionFactor);
                    p.mesh.rotation.z = THREE.MathUtils.lerp(p.homeRot.z, p.explodedRot.z, this.dissectionFactor);
                }
            }
        });

        // Rotate cockpit steering wheel with turning input
        if (this.steeringWheelMesh) {
            this.steeringWheelMesh.rotation.z = -this.turningSystem.currentSteer * 2.5;
        }

        // Active aero spoiler downforce animation when assembled
        if (this.spoilerPart && this.dissectionFactor < 0.1) {
            const isHighSpeed = Math.abs(this.vLong) > 18.0;
            const isBraking = (input.backward && this.vLong > 0.5) || input.handbrake;
            const lift = isBraking ? 0.20 : (isHighSpeed ? 0.10 : 0.0);
            const tilt = isBraking ? -0.22 : (isHighSpeed ? -0.08 : 0.0);

            this.spoilerPart.position.y = this.spoilerHomePos.y + lift;
            this.spoilerPart.rotation.x = tilt;
        }
    }

    /* ------------------------------------------------
       MAIN UNIFIED UPDATE LOOP
       ------------------------------------------------ */
    update(dt, input, weather) {
        dt = Math.min(dt, 1 / 30);

        // Compute weather grip factor from weather type
        const weatherType = weather ? weather.weatherType : 3;
        const weatherGripFactor = weatherType === 0 ? 0.65 : (weatherType === 1 ? 0.82 : 1.0);

        // 1. Update Modular Subsystems
        this.acceleratingSystem.update(dt, input, weatherGripFactor);
        this.turningSystem.update(dt, input, weatherGripFactor, weatherType);
        this.driftingSystem.update(dt, input, weatherGripFactor);
        this.maneuversSystem.update(dt, input, weather);

        this._updateDissection(dt, input);

        // 2. Integrated 3D World Movement
        const sinH = Math.sin(this.heading);
        const cosH = Math.cos(this.heading);
        const vxWorld = -sinH * this.vLong + cosH * this.vLat;
        const vzWorld = -cosH * this.vLong - sinH * this.vLat;

        this.mesh.position.x += vxWorld * dt;
        this.mesh.position.z += vzWorld * dt;

        // 3. Four-Corner Arcade Suspension (Load Transfer -> Wheel Travel -> Body Motion)
        this._updateSuspension(dt, input);

        if (this.contactShadow) {
            const toLight = this._getShadowLightVector();
            const shadowDir = toLight.clone().multiplyScalar(-1);
            const shadowOffset = 0.65;

            this.contactShadow.position.set(
                this.mesh.position.x + shadowDir.x * shadowOffset,
                0.055,
                this.mesh.position.z + shadowDir.z * shadowOffset
            );
            this.contactShadow.rotation.z = this.heading;
            const speedFade = THREE.MathUtils.clamp(1.0 - Math.abs(this.vLong) / 120.0, 0.72, 1.0);
            this.contactShadow.material.uniforms.uOpacity.value = (this.shadowBaseOpacity || 0.62) * speedFade;
        }

        // Dynamic car contrast & material wetness boost during storm
        this._updateStormContrast(dt, weatherType);

        // 4. Wheel Animations & Steering Angle (Separated Transformations)
        const spin = -this.vLong * dt * 3.2;

        // Continuous wheel spin around each model's axle axis
        if (this.isGltfLoaded && this.gltfSpinWheels && this.gltfSpinWheels.length > 0) {
            this.gltfSpinWheels.forEach((wheel) => {
                wheel.rotateOnAxis(wheel.userData.spinAxis || this.defaultWheelSpinAxis, spin);
            });
        } else if (this.wheelSpinGroups) {
            this.wheelSpinGroups.forEach(w => { w.rotation.x += spin; });
        }

        // Smooth visual steering rotation around each model's vertical axis
        const visualSteer = this.turningSystem.currentSteer * 0.85;
        if (this.isGltfLoaded && this.gltfSteerPivots && this.gltfSteerPivots.length > 0) {
            this.gltfSteerPivots.forEach((pivot) => {
                pivot.quaternion.setFromAxisAngle(pivot.userData.steerAxis || this.defaultSteerAxis, visualSteer);
            });
        } else if (this.frontSteerPivots) {
            this.frontSteerPivots.forEach(p => { p.rotation.y = visualSteer; });
        }

        // 5. Particle Effects & Lighting Updates
        const isBurnout = input.forward && Math.abs(this.vLong) < 3.0 && (input.backward || input.handbrake);
        const isSliding = this.driftingSystem.isDrifting || input.handbrake;
        this._updateParticles(dt, isSliding, isBurnout, Math.abs(this.vLong));

        this._updateLights(dt, input);

        // 6. Playable boundary constraint relative to dynamic road width
        const roadPt = getRoadPoint(this.mesh.position.z);
        const currentRoadWidth = getRoadWidth(this.mesh.position.z, this.driveTuning?.route);
        const maxOffset = (currentRoadWidth / 2) - 0.4;

        const offsetFromRoad = this.mesh.position.x - roadPt.x;

        if (Math.abs(offsetFromRoad) > maxOffset) {
            const sideSign = Math.sign(offsetFromRoad);
            this.mesh.position.x = roadPt.x + sideSign * maxOffset;

            // Guardrail collision friction & rebound velocity dampen
            this.vLong *= 0.95;
            this.vLat = -sideSign * 1.5; // Rebound pushback away from barrier

            // Emit barrier scrape smoke/sparks
            this._emitSmoke(this.mesh.position.x, this.mesh.position.z, 0.85);
        }

        // 7. Dynamic Vehicle Wetness Physics, Water Droplets Normal Map, Specular & Tire Spray
        this._updateVehicleWetnessAndSpray(dt, weather);
    }

    _updateVehicleWetnessAndSpray(dt, weather) {
        const weatherType = weather ? weather.weatherType : 3;
        const isRaining = (weatherType === 0 || weatherType === 1 || weatherType === 2);
        const targetWetness = weatherType === 0 ? 1.0 : (weatherType === 1 ? 0.75 : (weatherType === 2 ? 0.90 : 0.0));

        this.bodyWetness = THREE.MathUtils.lerp(this.bodyWetness || 0.0, targetWetness, dt * (isRaining ? 0.4 : 0.15));
        const wet = this.bodyWetness;
        const speedRatio = Math.min(Math.abs(this.vLong) / 45.0, 1.5);

        // 1. Body Panel Clearcoat & Specular & Droplet Normal Map Response
        if (this.bodyMaterial) {
            const mat = this.bodyMaterial;
            mat.roughness = THREE.MathUtils.lerp(0.25, 0.02, wet);
            mat.clearcoat = THREE.MathUtils.lerp(0.70, 1.00, wet);
            mat.clearcoatRoughness = THREE.MathUtils.lerp(0.15, 0.01, wet);

            // Slightly stronger specular response under sky/moon environment lighting
            mat.envMapIntensity = THREE.MathUtils.lerp(1.0, 2.6, wet);

            // Subtle procedural water droplets normal map on body panels
            if (this.waterDropNormalMap) {
                mat.normalMap = this.waterDropNormalMap;
                const normStrength = (weatherType === 2 ? 0.65 : 0.42) * wet;
                mat.normalScale.set(normStrength, normStrength);

                // Animate subtle water streaks on rear bodywork (especially Cloudy Day)
                if (isRaining && Math.abs(this.vLong) > 1.0) {
                    this.waterDropNormalMap.offset.y += dt * 0.14 * (speedRatio + 0.2);
                }
            }
        }

        // 2. Wet Tire Sidewalls (Glossy Slick Wet Rubber Sheen)
        if (this.tireMaterial) {
            const tMat = this.tireMaterial;
            tMat.roughness = THREE.MathUtils.lerp(0.65, 0.10, wet);
            tMat.clearcoat = THREE.MathUtils.lerp(0.0, 0.92, wet);
            tMat.clearcoatRoughness = THREE.MathUtils.lerp(0.20, 0.02, wet);
            tMat.envMapIntensity = THREE.MathUtils.lerp(1.0, 2.2, wet);
        }

        // 3. Tiny Tire Water Spray Particles Mist
        const isMoving = Math.abs(this.vLong) > 2.0;
        if (isRaining && isMoving) {
            const sinH = Math.sin(this.heading);
            const cosH = Math.cos(this.heading);
            const sprayIntensity = (weatherType === 0 ? 1.0 : (weatherType === 2 ? 0.85 : 0.50)) * Math.min(Math.abs(this.vLong) / 25.0, 1.2);

            if (Math.random() < sprayIntensity * 0.85) {
                const tireOffsets = [
                    { x: -0.88, z: -1.4 }, { x: 0.88, z: -1.4 },
                    { x: -0.88, z: 1.35 }, { x: 0.88, z: 1.35 }
                ];

                tireOffsets.forEach(t => {
                    const wx = this.mesh.position.x - sinH * t.z + cosH * t.x;
                    const wz = this.mesh.position.z - cosH * t.z - sinH * t.x;
                    this._emitWaterSpray(wx, wz, sprayIntensity);
                });
            }
        }

        // Update active water spray particle positions
        if (this.waterSprayParticles) {
            const pos = this.waterSprayParticles.geometry.attributes.position.array;
            for (let i = 0; i < this.waterSprayData.length; i++) {
                const d = this.waterSprayData[i];
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
            this.waterSprayParticles.geometry.attributes.position.needsUpdate = true;
        }
    }

    _updateStormContrast(dt, weatherType) {
        const isStorm = (weatherType === 0);
        const isDrizzle = (weatherType === 1);

        // Storm contrast targets:
        // - Subdued environment map reflections (0.35 in storm vs 1.00 in clear) so car reflects dark overcast atmosphere without overblowing
        // - High wet clearcoat gloss (clearcoat 0.95, clearcoatRoughness 0.02)
        // - Deepened base paint color (0xd11a2a -> 0x6a0a14) so vehicle low-lights are deep dark red under storm skies
        // - Deepened contact shadow (0.92) & AO opacity (0.95) under car for high visual contrast
        const targetWetness = isStorm ? 1.0 : (isDrizzle ? 0.45 : 0.0);
        const targetShadowBase = isStorm ? 0.92 : (isDrizzle ? 0.76 : 0.62);
        const targetAoBase = isStorm ? 0.95 : (isDrizzle ? 0.78 : 0.62);
        const targetEnvMapInt = isStorm ? 0.35 : (isDrizzle ? 0.65 : 1.00);

        if (this.currentWetness === undefined) this.currentWetness = 0;
        this.currentWetness = THREE.MathUtils.lerp(this.currentWetness, targetWetness, dt * 3.5);

        if (this.currentEnvMapInt === undefined) this.currentEnvMapInt = 1.0;
        this.currentEnvMapInt = THREE.MathUtils.lerp(this.currentEnvMapInt, targetEnvMapInt, dt * 3.5);

        // 1. High-Contrast Ferrari Body Paint (MeshPhysicalMaterial)
        if (this.bodyMaterial) {
            this.bodyMaterial.roughness = THREE.MathUtils.lerp(0.25, 0.04, this.currentWetness);
            this.bodyMaterial.clearcoat = THREE.MathUtils.lerp(0.70, 0.95, this.currentWetness);
            this.bodyMaterial.clearcoatRoughness = THREE.MathUtils.lerp(0.15, 0.02, this.currentWetness);
            this.bodyMaterial.envMapIntensity = this.currentEnvMapInt;

            // Rich deep paint tone for high-contrast storm low-lights (prevents vehicle over-brightness)
            const r = THREE.MathUtils.lerp(0xd1 / 255, 0x6a / 255, this.currentWetness);
            const g = THREE.MathUtils.lerp(0x1a / 255, 0x0a / 255, this.currentWetness);
            const b = THREE.MathUtils.lerp(0x2a / 255, 0x14 / 255, this.currentWetness);
            this.bodyMaterial.color.setRGB(r, g, b);
        }

        // 2. High-Contrast Procedural Body Materials (Fallback)
        if (this.proceduralBodyGroup) {
            this.proceduralBodyGroup.traverse((child) => {
                if (child.isMesh && child.material) {
                    if (child.material.envMapIntensity !== undefined) {
                        child.material.envMapIntensity = this.currentEnvMapInt;
                    }
                    if (child.material.roughness !== undefined && child.material.color && child.material.color.getHex() === 0xd11a2a) {
                        child.material.roughness = THREE.MathUtils.lerp(0.12, 0.04, this.currentWetness);
                    }
                }
            });
        }

        // 3. Deep Contact Shadow & Ambient Occlusion (AO) Under Car
        if (this.shadowBaseOpacity === undefined) this.shadowBaseOpacity = 0.62;
        this.shadowBaseOpacity = THREE.MathUtils.lerp(this.shadowBaseOpacity, targetShadowBase, dt * 3.5);

        if (this.carAO && this.carAO.material && this.carAO.material.uniforms && this.carAO.material.uniforms.uOpacity) {
            if (this.aoBaseOpacity === undefined) this.aoBaseOpacity = 0.62;
            this.aoBaseOpacity = THREE.MathUtils.lerp(this.aoBaseOpacity, targetAoBase, dt * 3.5);
            this.carAO.material.uniforms.uOpacity.value = this.aoBaseOpacity;
        }
    }

    _updateLights(dt, input) {
        const mode = input.headlightMode !== undefined ? input.headlightMode : 1;
        const spotIntensity = mode === 2 ? 260.0 : (mode === 1 ? 135.0 : 0);
        const spotDistance = mode === 2 ? 255 : 165;
        const fillIntensity = mode === 2 ? 7.0 : (mode === 1 ? 3.0 : 0);

        const sinH = Math.sin(this.heading);
        const cosH = Math.cos(this.heading);

        const carX = this.mesh.position.x;
        const carY = this.mesh.position.y;
        const carZ = this.mesh.position.z;
        const headlightViewFactor = this._getHeadlightViewFactor();

        const offsets = [-0.70, 0.70];

        // Update Left and Right Headlight Spotlights & Targets in World Coordinates
        offsets.forEach((sideOffset, idx) => {
            const spot = this.headlightSpots[idx];
            const target = this.headlightTargets[idx];

            if (spot && target) {
                spot.intensity = spotIntensity;
                spot.distance = spotDistance;

                // Spot position at vehicle headlights socket (0.70m height above ground)
                const sx = carX + cosH * sideOffset + sinH * (-1.8);
                const sy = carY + 0.70;
                const sz = carZ - sinH * sideOffset + cosH * (-1.8);
                spot.position.set(sx, sy, sz);

                // Spot target 70m straight down the road (0.40m height skimming above road)
                const tx = carX + cosH * sideOffset + sinH * (-85.0);
                const ty = carY + 0.25;
                const tz = carZ - sinH * sideOffset + cosH * (-85.0);
                target.position.set(tx, ty, tz);
                target.updateMatrixWorld();
            }

            // Fill PointLights in local space (0.65m height)
            if (this.headlightFillPoints && this.headlightFillPoints[idx]) {
                this.headlightFillPoints[idx].position.set(sideOffset, 0.65, -2.0);
                this.headlightFillPoints[idx].intensity = fillIntensity * headlightViewFactor;
            }
        });

        if (this.gltfHeadlightMat) {
            const cameraBehindFactor = this._getCameraBehindFactor();
            this.gltfHeadlightMat.emissiveIntensity = (mode === 2 ? 0.38 : (mode === 1 ? 0.16 : 0.015)) * headlightViewFactor * (1.0 - cameraBehindFactor);
            this.gltfHeadlightMat.opacity = (mode === 0 ? 0.06 : 0.24) * headlightViewFactor * (1.0 - cameraBehindFactor * 0.96);
            if (this.gltfHeadlightMesh) {
                this.gltfHeadlightMesh.visible = cameraBehindFactor < 0.98 || mode !== 0;
            }
        }

        // Brake Light Spot Update (rear is +2.3m in local Z, 0.50m height)
        const isBraking = (input.backward && this.vLong > 0.5) || input.handbrake;
        this.rearBrakeSpot.intensity = isBraking ? 15.0 : (mode > 0 ? 1.5 : 0);

        const rx = carX + sinH * 2.3;
        const ry = carY + 0.50;
        const rz = carZ + cosH * 2.3;
        this.rearBrakeSpot.position.set(rx, ry, rz);

        if (this.rearBrakeTarget) {
            const rtx = carX + sinH * 15.0;
            const rty = carY + 0.35;
            const rtz = carZ + cosH * 15.0;
            this.rearBrakeTarget.position.set(rtx, rty, rtz);
            this.rearBrakeTarget.updateMatrixWorld();
        }

        if (this.gltfTaillightMat) {
            this.gltfTaillightMat.emissiveIntensity = isBraking ? 5.0 : (mode > 0 ? 1.0 : 0.2);
        }

        const isReversing = (this.vLong < -0.1) || (input.backward && Math.abs(this.vLong) < 0.5);
        this.reverseLightPoint.intensity = isReversing ? 5.0 : 0;

        this.blinkerTimer += dt;
        if (this.blinkerTimer >= 0.35) {
            this.blinkerTimer = 0;
            this.blinkerState = !this.blinkerState;
        }
    }

    _getCameraBehindFactor() {
        if (!this.camera) return 0;

        const toCamera = this.camera.position.clone().sub(this.mesh.position);
        toCamera.y = 0;
        if (toCamera.lengthSq() < 0.001) return 0;
        toCamera.normalize();

        const forward = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
        const rearFacingDot = forward.dot(toCamera);
        return THREE.MathUtils.smoothstep(rearFacingDot, 0.05, 0.45);
    }

    _getHeadlightViewFactor() {
        if (!this.camera) return 1;

        const toCamera = this.camera.position.clone().sub(this.mesh.position);
        toCamera.y = 0;
        if (toCamera.lengthSq() < 0.001) return 1;
        toCamera.normalize();

        const forward = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
        const frontDot = forward.dot(toCamera);
        return THREE.MathUtils.smoothstep(frontDot, -0.05, -0.55);
    }
}
