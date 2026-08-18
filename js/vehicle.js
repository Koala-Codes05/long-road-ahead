import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { AcceleratingSystem } from './accelerating.js';
import { TurningSystem } from './turning.js';
import { DriftingSystem } from './drifting.js';
import { ManeuversSystem } from './maneuvers.js';
import { getRoadPoint, getRoadWidth } from './world.js';

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
        this.camera = null;

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

        this.mesh = new THREE.Group();
        this.mesh.position.set(0, 0, 0);
        this.scene.add(this.mesh);

        this._initLightingSystem();
        this._initParticleEffects();
        this._initContactShadow();
        this._initCarAmbientOcclusion();

        // Procedural fallback car model + Ferrari GLTF load
        this.proceduralMesh = this._createCarModel();
        this.proceduralMesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
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
            size: 1.5,
            map: new THREE.CanvasTexture(canvas),
            transparent: true,
            opacity: 0.35,
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
    /* ------------------------------------------------
       PROCEDURAL CAR MODEL FALLBACK & GLTF LOADER
       ------------------------------------------------ */
    _createCarModel() {
        const rootGroup = new THREE.Group();
        this.dissectedParts = [];
        this.wheels = [];
        this.frontWheels = [];
        this.wheelSpinGroups = [];

        // Photorealistic Materials
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd11a2a, metalness: 0.90, roughness: 0.12 });
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

        wheelCfg.forEach(({ x, z, front, side }) => {
            // Kingpin Steering Pivot Group (handles steering angle Y rotation)
            const steerPivot = new THREE.Group();

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

            const homePos = [x, 0.38, z];
            const explodedPos = [x + side * 1.6, 0.38, z];

            addDissectedPart(steerPivot, homePos, explodedPos);

            this.wheelSpinGroups.push(spinGroup);
            if (front) this.frontSteerPivots.push(steerPivot);
        });

        this.proceduralBodyGroup = rootGroup;
        return rootGroup;
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
                    this.gltfSpinWheels = [];
                    this.gltfSteerPivots = [];

                    const rawWheels = [
                        { mesh: wheelFL, isFront: true },
                        { mesh: wheelFR, isFront: true },
                        { mesh: wheelRL, isFront: false },
                        { mesh: wheelRR, isFront: false },
                    ];

                    rawWheels.forEach(({ mesh, isFront }) => {
                        const parent = mesh.parent;
                        const steerPivot = new THREE.Group();
                        steerPivot.position.copy(mesh.position);
                        parent.add(steerPivot);

                        const spinGroup = new THREE.Group();
                        steerPivot.add(spinGroup);

                        mesh.position.set(0, 0, 0);
                        spinGroup.add(mesh);

                        this.gltfSpinWheels.push(spinGroup);
                        if (isFront) {
                            this.gltfSteerPivots.push(steerPivot);
                        }
                    });
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

        // 3. Chassis Suspension Physics (Pitch, Roll, Heave) with Lag
        // Stronger pitch/roll multipliers + brake dive & acceleration squat bonuses
        const brakeDiveBonus = (input.backward && this.vLong > 0.5) ? 0.02 : 0;
        const squatBonus = (this.acceleratingSystem.aLong > 5) ? 0.006 : 0;
        const rawTargetPitch = -(this.acceleratingSystem.aLong / 9.81) * 0.032 + brakeDiveBonus - squatBonus;
        const targetPitch = THREE.MathUtils.clamp(rawTargetPitch, -0.035, 0.045);
        const targetRoll = (this.turningSystem.aLat / 9.81) * 0.090;
        const roadBumpNoise = Math.sin(performance.now() * 0.018) * 0.006 * Math.min(Math.abs(this.vLong) / 25, 1.0);
        const targetHeave = -(Math.abs(this.acceleratingSystem.aLong) / 9.81) * 0.012 + roadBumpNoise;

        // Suspension lag: slower spring-damper response (~200-350ms instead of instant)
        this.pitchVel += (targetPitch - this.pitchAngle) * 8.0 * dt - this.pitchVel * 5.6 * dt;
        this.pitchAngle += this.pitchVel * dt;
        this.rollVel += (targetRoll - this.rollAngle) * 8.0 * dt - this.rollVel * 5.6 * dt;
        this.rollAngle += this.rollVel * dt;
        this.heaveVel += (targetHeave - this.heaveDisplacement) * 10.0 * dt - this.heaveVel * 6.3 * dt;
        this.heaveDisplacement += this.heaveVel * dt;

        this.mesh.rotation.y = this.heading;
        this.mesh.rotation.z = this.rollAngle;
        this.mesh.rotation.x = this.pitchAngle;
        this.mesh.position.y = Math.max(-0.05, this.heaveDisplacement);

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
            this.contactShadow.material.uniforms.uOpacity.value = 0.62 * speedFade;
        }

        // 4. Wheel Animations & Steering Angle (Separated Transformations)
        const spin = -this.vLong * dt * 3.2;

        // Continuous wheel spin around axle (Pitch rotation.x on spinGroup)
        if (this.isGltfLoaded && this.gltfSpinWheels && this.gltfSpinWheels.length > 0) {
            this.gltfSpinWheels.forEach(w => { w.rotation.x += spin; });
        } else if (this.wheelSpinGroups) {
            this.wheelSpinGroups.forEach(w => { w.rotation.x += spin; });
        }

        // Smooth visual steering rotation around Kingpin pivot (Yaw rotation.y on steerPivot)
        const visualSteer = this.turningSystem.currentSteer * 0.85;
        if (this.isGltfLoaded && this.gltfSteerPivots && this.gltfSteerPivots.length > 0) {
            this.gltfSteerPivots.forEach(p => { p.rotation.y = visualSteer; });
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
        const currentRoadWidth = getRoadWidth(this.mesh.position.z);
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
