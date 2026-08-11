import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * Vehicle – Builds procedural car model and loads Ferrari 458 Italia 3D model.
 * Features: arcade physics, 6-gear transmission, 300km/h top speed,
 * sleek & realistic car lighting system (Low/High Beam, Taillights, Brake, Reverse, Signals/Hazards, Underglow).
 */
export class Vehicle {
    constructor(scene) {
        this.scene = scene;

        // Physics
        this.speed = 0;
        this.heading = 0; // radians, 0 = facing -Z
        this.maxSpeed = 300 / 3.6; // 83.33 m/s = 300 km/h top speed
        this.baseAcceleration = 5.2; // m/s^2 (0-100 km/h in ~3.8 seconds)
        this.brakeForce = 25;
        this.reverseMaxSpeed = 25; // ~90 km/h reverse
        this.turnSpeed = 2.2;
        this.drag = 0.995;
        this.nitroBoost = 1.35;
        this.isNitro = false;
        this.steerAngle = 0;
        this.currentSteer = 0;
        this.lateralVelocity = 0;
        this.rollAngle = 0;
        this.pitchAngle = 0;

        // Internals
        this.wheels = [];
        this.frontWheels = [];
        this.isGltfLoaded = false;

        // Root vehicle container group
        this.mesh = new THREE.Group();
        this.mesh.position.set(0, 0, 0);
        this.scene.add(this.mesh);

        // Hardware Lighting Container
        this._initLightingSystem();

        // Procedural fallback car model
        this.proceduralMesh = this._createCarModel();
        this.mesh.add(this.proceduralMesh);

        this._loadFerrariModel();
    }

    /* ------------------------------------------------
       CAR LIGHTING SYSTEM SETUP (Clean, Photorealistic)
       ------------------------------------------------ */
    _initLightingSystem() {
        this.lightsGroup = new THREE.Group();
        this.mesh.add(this.lightsGroup);

        this.blinkerTimer = 0;
        this.blinkerState = false;

        // ---- 1. Headlights (Photorealistic SpotLights) ----
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

        // ---- 2. Rear Brake & Taillight Ground Projection ----
        this.rearBrakeSpot = new THREE.SpotLight(0xff1100, 0, 15, Math.PI / 3, 0.7, 1.2);
        this.rearBrakeSpot.position.set(0, 0.3, 2.3);
        const rearTarget = new THREE.Object3D();
        rearTarget.position.set(0, -0.6, 8);
        this.lightsGroup.add(rearTarget);
        this.rearBrakeSpot.target = rearTarget;
        this.lightsGroup.add(this.rearBrakeSpot);

        // ---- 3. Reverse Light Point ----
        this.reverseLightPoint = new THREE.PointLight(0xffffff, 0, 8);
        this.reverseLightPoint.position.set(0, 0.5, 2.4);
        this.lightsGroup.add(this.reverseLightPoint);

        // ---- 4. Underglow Neon System ----
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
        this.underGlowMat = ugMat;

        this.underLight = new THREE.PointLight(0x0088ff, 2.0, 6.0);
        this.underLight.position.set(0, 0.15, 0);
        this.lightsGroup.add(this.underLight);
    }

    /* ------------------------------------------------
       CAR MODEL (procedural fallback)
       ------------------------------------------------ */
    _createCarModel() {
        const group = new THREE.Group();

        // Body (Wet glossy coat)
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xff2200,
            metalness: 0.95,
            roughness: 0.06,
        });

        // Main body
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 4.8), bodyMat);
        body.position.y = 0.55;
        body.castShadow = true;
        group.add(body);

        // Hood
        const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 1.5), bodyMat);
        hood.position.set(0, 0.9, -1.2);
        hood.rotation.x = 0.15;
        hood.castShadow = true;
        group.add(hood);

        // Cabin
        const cabinMat = new THREE.MeshStandardMaterial({
            color: 0x111122,
            metalness: 1.0,
            roughness: 0.05,
            transparent: true,
            opacity: 0.7,
        });
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 1.8), cabinMat);
        cabin.position.set(0, 1.07, 0.2);
        cabin.castShadow = true;
        group.add(cabin);

        // Rear spoiler
        const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.3), bodyMat);
        spoiler.position.set(0, 1.15, 2.1);
        group.add(spoiler);
        const legGeo = new THREE.BoxGeometry(0.08, 0.3, 0.08);
        [[-0.8, 1.0, 2.1], [0.8, 1.0, 2.1]].forEach(p => {
            const leg = new THREE.Mesh(legGeo, bodyMat);
            leg.position.set(...p);
            group.add(leg);
        });

        // Wheels
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

        // Integrated Procedural Headlight/Taillight Materials
        const hlMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 1.5,
        });
        [-0.75, 0.75].forEach(x => {
            const hl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), hlMat);
            hl.position.set(x, 0.6, -2.4);
            group.add(hl);
        });

        const tlMat = new THREE.MeshStandardMaterial({
            color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.2,
        });
        [-0.8, 0.8].forEach(x => {
            const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), tlMat);
            tl.position.set(x, 0.55, 2.4);
            group.add(tl);
        });

        this.brakeLightMat = tlMat;
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

                        // Tone down metallic & roughness specular glare across GLTF materials
                        if (child.material) {
                            const name = child.name ? child.name.toLowerCase() : '';
                            if (name.includes('glass') || name.includes('window')) {
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0x0a1020,
                                    metalness: 0.1,
                                    roughness: 0.2,
                                    transmission: 0.8,
                                    transparent: true,
                                    opacity: 0.65,
                                    clearcoat: 0.5,
                                    clearcoatRoughness: 0.1,
                                });
                            } else if (name !== 'body' && name !== 'lights' && name !== 'lights_red' && name !== 'leds') {
                                if (child.material.metalness !== undefined) {
                                    child.material.metalness = Math.min(child.material.metalness, 0.4);
                                }
                                if (child.material.roughness !== undefined) {
                                    child.material.roughness = Math.max(child.material.roughness, 0.25);
                                }
                            }
                        }

                        // Bind materials for light nodes in GLTF
                        if (child.name === 'lights') {
                            this.gltfHeadlightMat = new THREE.MeshStandardMaterial({
                                color: 0xffffff,
                                emissive: 0xffffff,
                                emissiveIntensity: 1.2,
                                metalness: 0.5,
                                roughness: 0.2,
                            });
                            child.material = this.gltfHeadlightMat;
                        }
                        if (child.name === 'lights_red') {
                            this.gltfTaillightMat = new THREE.MeshStandardMaterial({
                                color: 0xff0000,
                                emissive: 0xff0000,
                                emissiveIntensity: 0.8,
                                roughness: 0.2,
                            });
                            child.material = this.gltfTaillightMat;
                        }
                        if (child.name === 'leds') {
                            this.gltfLedMat = new THREE.MeshStandardMaterial({
                                color: 0xffffff,
                                emissive: 0x99ccff,
                                emissiveIntensity: 1.0,
                            });
                            child.material = this.gltfLedMat;
                        }
                    }
                });

                // Find Ferrari wheel meshes
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
                    bodyMesh.material = new THREE.MeshPhysicalMaterial({
                        color: 0xd11a2a,
                        metalness: 0.45,
                        roughness: 0.25,
                        clearcoat: 0.7,
                        clearcoatRoughness: 0.15,
                    });
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
       PHYSICS & LIGHTING UPDATE
       ------------------------------------------------ */
    update(dt, input) {
        // Sensitivity scale (Right Ctrl held = 25% precision, Right Shift held = 50% precision)
        let sensMult = 1.0;
        if (input.precision25) {
            sensMult = 0.25;
        } else if (input.precision) {
            sensMult = 0.5;
        }

        // Dynamic gear acceleration scaling across 6 gears (0-300 km/h)
        const kmh = Math.abs(this.speed * 3.6);
        let gearMult = 1.25;
        if (kmh >= 250) gearMult = 0.35;      // Gear 6 (250-300 km/h)
        else if (kmh >= 200) gearMult = 0.50; // Gear 5 (200-250 km/h)
        else if (kmh >= 150) gearMult = 0.70; // Gear 4 (150-200 km/h)
        else if (kmh >= 100) gearMult = 0.88; // Gear 3 (100-150 km/h)
        else if (kmh >= 50)  gearMult = 1.05; // Gear 2 (50-100 km/h)
        else                 gearMult = 1.25; // Gear 1 (0-50 km/h)

        // Nitro
        this.isNitro = input.nitro && this.speed > 3;
        const boost = this.isNitro ? this.nitroBoost : 1;

        // Acceleration / brake with sensitivity scaling
        const accelRate = this.baseAcceleration * gearMult * boost * sensMult;
        const brakeRate = this.brakeForce * sensMult;

        if (input.forward) {
            if (this.speed < -0.5) {
                // Apply brakes when reversing
                this.speed += brakeRate * dt;
            } else {
                this.speed += accelRate * dt;
            }
        }
        if (input.backward) {
            if (this.speed > 0.5) {
                // Apply brakes when moving forward
                this.speed -= brakeRate * dt;
            } else {
                // Accelerate in reverse
                this.speed -= accelRate * 0.75 * dt;
            }
        }

        // Clamp to top speed 300 km/h (or ~330 km/h with nitro)
        const cap = this.isNitro ? this.maxSpeed * 1.1 : this.maxSpeed;
        this.speed = Math.max(-this.reverseMaxSpeed, Math.min(this.speed, cap));

        // Drag friction
        if (!input.forward && !input.backward) this.speed *= this.drag;

        // Dead zone for near-zero speed
        if (Math.abs(this.speed) < 0.15 && !input.forward && !input.backward) {
            this.speed = 0;
        }

        // Steering input smoothing
        const targetSteer = input.left ? 1 : input.right ? -1 : 0;
        this.currentSteer = THREE.MathUtils.lerp(this.currentSteer, targetSteer, dt * 12.0);
        this.steerAngle = this.currentSteer;

        // Turning physics calculation (works at low speed, high speed, and standstill roll)
        const speedFactor = Math.min(1.0, Math.abs(this.speed) / 4.0); // allows turning even at low speed
        const isMoving = Math.abs(this.speed) > 0.15 || input.forward || input.backward;

        if (isMoving && Math.abs(this.currentSteer) > 0.01) {
            const highSpeedDamp = 1.0 - (Math.abs(this.speed) / this.maxSpeed) * 0.35;
            const handbrakeTurnBoost = input.handbrake ? 1.6 : 1.0;
            const turnRate = this.turnSpeed * sensMult * Math.max(speedFactor, 0.45) * highSpeedDamp * handbrakeTurnBoost;
            const dir = this.speed >= 0 ? 1 : -1;
            this.heading += this.currentSteer * turnRate * dir * dt;
        }

        // Handbrake & Drift lateral slip angle physics
        let grip = 0.88;
        if (input.handbrake && Math.abs(this.speed) > 3) {
            grip = 0.25; // Drift mode: low side grip
            this.speed *= (1.0 - 0.4 * dt); // Moderate speed bleed during drift
        }

        // Lateral acceleration / drift side-velocity
        const latForce = -Math.sin(this.currentSteer * 0.5) * this.speed * 0.45;
        this.lateralVelocity = THREE.MathUtils.lerp(this.lateralVelocity, latForce, dt * (10.0 * grip));

        // World movement update: combines forward velocity + lateral drift displacement
        const forwardX = -Math.sin(this.heading) * this.speed;
        const forwardZ = -Math.cos(this.heading) * this.speed;
        const rightX = Math.cos(this.heading) * this.lateralVelocity;
        const rightZ = -Math.sin(this.heading) * this.lateralVelocity;

        this.mesh.position.x += (forwardX + rightX) * dt;
        this.mesh.position.z += (forwardZ + rightZ) * dt;

        // Visual Chassis Body Dynamics (Roll on cornering & Pitch on accel/brake)
        const targetRoll = -this.currentSteer * Math.min(Math.abs(this.speed) / 30.0, 1.0) * 0.08;
        const accelState = input.forward ? -1 : (input.backward && this.speed > 1) ? 1.5 : 0;
        const targetPitch = accelState * (Math.abs(this.speed) / 60.0) * 0.035;

        this.rollAngle = THREE.MathUtils.lerp(this.rollAngle, targetRoll, dt * 8.0);
        this.pitchAngle = THREE.MathUtils.lerp(this.pitchAngle, targetPitch, dt * 8.0);

        this.mesh.rotation.y = this.heading;
        this.mesh.rotation.z = this.rollAngle;
        this.mesh.rotation.x = this.pitchAngle;

        // Wheel spin animation
        const spin = -this.speed * dt * 3;
        if (this.isGltfLoaded && this.gltfWheels) {
            this.gltfWheels.forEach(w => {
                w.rotation.x += spin;
            });
        } else {
            this.wheels.forEach(w => {
                if (w.children[0]) w.children[0].rotation.x += spin;
                if (w.children[1]) w.children[1].rotation.x += spin;
            });
        }

        // Front-wheel steer visual turning animation
        const maxSteerVisualAngle = 0.45 * sensMult;
        const visualSteerAngle = this.currentSteer * maxSteerVisualAngle;
        if (this.isGltfLoaded && this.gltfFrontWheels) {
            this.gltfFrontWheels.forEach(w => (w.rotation.y = visualSteerAngle));
        } else {
            this.frontWheels.forEach(w => (w.rotation.y = visualSteerAngle));
        }

        // Dynamic Car Lighting Update
        this._updateLights(dt, input);

        // Soft boundary (keep car in playable area)
        if (Math.abs(this.mesh.position.x) > 50) {
            this.mesh.position.x *= 0.995;
            this.speed *= 0.98;
        }
    }

    _updateLights(dt, input) {
        // 1. Headlights (0: OFF, 1: LOW BEAM, 2: HIGH BEAM)
        const mode = input.headlightMode !== undefined ? input.headlightMode : 1;
        let spotIntensity = 0;
        let spotDistance = 60;
        let spotAngle = Math.PI / 5.5;

        if (mode === 1) { // Low Beam
            spotIntensity = 8.0;
            spotDistance = 60;
            spotAngle = Math.PI / 5.5;
        } else if (mode === 2) { // High Beam
            spotIntensity = 18.0;
            spotDistance = 120;
            spotAngle = Math.PI / 7;
        }

        this.headlightSpots.forEach(s => {
            s.intensity = spotIntensity;
            s.distance = spotDistance;
            s.angle = spotAngle;
        });

        if (this.gltfHeadlightMat) {
            this.gltfHeadlightMat.emissiveIntensity = mode === 2 ? 2.5 : (mode === 1 ? 1.2 : 0.05);
        }
        if (this.gltfLedMat) {
            this.gltfLedMat.emissiveIntensity = mode > 0 ? 1.0 : 0.1;
        }

        // 2. Taillights & Brake Lights
        const isBraking = (input.backward && this.speed > 0.5) || input.handbrake;
        const baseTailIntensity = mode > 0 ? 0.8 : 0.2;
        const brakeIntensity = isBraking ? 3.5 : baseTailIntensity;

        this.rearBrakeSpot.intensity = isBraking ? 6.0 : (mode > 0 ? 0.8 : 0);

        if (this.gltfTaillightMat) {
            this.gltfTaillightMat.emissiveIntensity = brakeIntensity;
        }
        if (this.brakeLightMat) {
            this.brakeLightMat.emissiveIntensity = brakeIntensity;
        }

        // 3. Reverse Lights
        const isReversing = (this.speed < -0.1) || (input.backward && Math.abs(this.speed) < 0.5);
        this.reverseLightPoint.intensity = isReversing ? 2.5 : 0;

        // 4. Turn Signals & Hazard Flashers
        this.blinkerTimer += dt;
        if (this.blinkerTimer >= 0.35) {
            this.blinkerTimer = 0;
            this.blinkerState = !this.blinkerState;
        }

        // 5. Underglow Neon
        const ugActive = input.underglow !== undefined ? input.underglow : true;
        if (ugActive) {
            this.underGlowMesh.visible = true;
            if (this.isNitro) {
                this.underGlowMat.emissive.setHex(0xff4400);
                this.underGlowMat.emissiveIntensity = 2.0;
                this.underGlowMat.opacity = 0.35;
                this.underLight.color.setHex(0xff4400);
                this.underLight.intensity = 4.5;
            } else {
                this.underGlowMat.emissive.setHex(0x0088ff);
                this.underGlowMat.emissiveIntensity = 1.0;
                this.underGlowMat.opacity = 0.2;
                this.underLight.color.setHex(0x0088ff);
                this.underLight.intensity = 2.0;
            }
        } else {
            this.underGlowMesh.visible = false;
            this.underLight.intensity = 0;
        }
    }

    /** Calculates current gear (N, R, 1-6) */
    getGear() {
        if (Math.abs(this.speed) < 0.2) return 'N';
        if (this.speed < 0) return 'R';
        const kmh = this.getSpeedKmh();
        if (kmh < 50) return 1;
        if (kmh < 100) return 2;
        if (kmh < 150) return 3;
        if (kmh < 200) return 4;
        if (kmh < 250) return 5;
        return 6;
    }

    /** Calculates RPM (0.0 to 1.0) normalized for current 6-gear range */
    getRpm() {
        const kmh = this.getSpeedKmh();
        if (kmh < 0.5) return 0;
        const gearSpeed = kmh % 50;
        const minRpm = 0.25;
        return minRpm + (1 - minRpm) * (gearSpeed / 50);
    }

    /** Speed in km/h for the HUD */
    getSpeedKmh() {
        return Math.abs(Math.round(this.speed * 3.6));
    }
}
