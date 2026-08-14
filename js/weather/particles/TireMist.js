import * as THREE from 'three';

function createWetSprayParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0.0, 'rgba(235, 245, 255, 1.0)');
    grad.addColorStop(0.35, 'rgba(200, 225, 255, 0.65)');
    grad.addColorStop(0.70, 'rgba(160, 200, 245, 0.18)');
    grad.addColorStop(1.0, 'rgba(120, 175, 235, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

function createSmokeParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
    grad.addColorStop(0.0, 'rgba(240, 242, 248, 0.95)');
    grad.addColorStop(0.25, 'rgba(215, 220, 228, 0.65)');
    grad.addColorStop(0.55, 'rgba(180, 185, 195, 0.25)');
    grad.addColorStop(0.85, 'rgba(150, 155, 165, 0.08)');
    grad.addColorStop(1.0, 'rgba(120, 125, 135, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

/**
 * TireMist — Dual-Mode AAA Tire Trail Subsystem:
 *  1. Wet Trail (Water spray mist plume behind tires on DRIZZLE & STORM)
 *  2. Smoke Trail (Volumetric tire/exhaust smoke trail behind tires on CLEAR)
 */
export class TireMist {
    constructor(scene, vehicle) {
        this.scene = scene;
        this.vehicle = vehicle;

        this.wetParticleCount = 1200;
        this.smokeParticleCount = 1000;

        this.wetTex = createWetSprayParticleTexture();
        this.smokeTex = createSmokeParticleTexture();

        // 1. Wet Water Spray System (DRIZZLE & STORM)
        this.wetMist = this._initWetMist();
        this.scene.add(this.wetMist);

        this.wetLifetimes = new Float32Array(this.wetParticleCount);
        this.wetMaxLifetimes = new Float32Array(this.wetParticleCount);
        this.wetVelocities = new Float32Array(this.wetParticleCount * 3);

        for (let i = 0; i < this.wetParticleCount; i++) {
            this.wetLifetimes[i] = Math.random() * 0.8;
            this.wetMaxLifetimes[i] = 0.5 + Math.random() * 0.6;
        }

        // 2. Smoke Trail System (CLEAR)
        this.smokeTrail = this._initSmokeTrail();
        this.scene.add(this.smokeTrail);

        this.smokeLifetimes = new Float32Array(this.smokeParticleCount);
        this.smokeMaxLifetimes = new Float32Array(this.smokeParticleCount);
        this.smokeVelocities = new Float32Array(this.smokeParticleCount * 3);
        this.smokeBaseSizes = new Float32Array(this.smokeParticleCount);

        for (let i = 0; i < this.smokeParticleCount; i++) {
            this.smokeLifetimes[i] = Math.random() * 1.0;
            this.smokeMaxLifetimes[i] = 0.7 + Math.random() * 0.8;
            this.smokeBaseSizes[i] = 2.0 + Math.random() * 2.5;
        }
    }

    _initWetMist() {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.wetParticleCount * 3);
        const sizes = new Float32Array(this.wetParticleCount);

        for (let i = 0; i < this.wetParticleCount; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = -100;
            positions[i * 3 + 2] = 0;
            sizes[i] = 1.8 + Math.random() * 2.2;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            size: 3.5,
            map: this.wetTex,
            color: 0xc8ddf5,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        return new THREE.Points(geo, mat);
    }

    _initSmokeTrail() {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.smokeParticleCount * 3);
        const sizes = new Float32Array(this.smokeParticleCount);

        for (let i = 0; i < this.smokeParticleCount; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = -100;
            positions[i * 3 + 2] = 0;
            sizes[i] = 2.5 + Math.random() * 2.5;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            size: 4.5,
            map: this.smokeTex,
            color: 0xe6ecf2,
            transparent: true,
            opacity: 0.0,
            blending: THREE.NormalBlending,
            depthWrite: false,
        });

        return new THREE.Points(geo, mat);
    }

    update(dt, weatherType, windVector) {
        if (!this.vehicle || !this.vehicle.mesh) return;

        const carPos = this.vehicle.mesh.position;
        const speed = Math.abs(this.vehicle.speed || 0);
        const heading = this.vehicle.heading || 0;
        const speedRatio = Math.min(speed / 60.0, 1.5);

        const isClear = (weatherType === 3);
        const isWet = (weatherType === 0 || weatherType === 1);
        const isMoving = speed > 1.2;
        const isDrifting = this.vehicle.driftingSystem && this.vehicle.driftingSystem.isDrifting;
        const isNitro = !!this.vehicle.isNitro;

        // ----------------------------------------------------
        // 1. WET TRAIL UPDATE (DRIZZLE & STORM)
        // ----------------------------------------------------
        let targetWetOpacity = 0.0;
        if (isWet && isMoving) {
            const baseOp = (weatherType === 0) ? 0.30 : 0.18; // STORM higher spray density than DRIZZLE
            const boost = isNitro ? 0.25 : 0.0;
            targetWetOpacity = Math.min(baseOp + speedRatio * 0.40 + boost, 0.75);
        }

        this.wetMist.material.opacity = THREE.MathUtils.lerp(
            this.wetMist.material.opacity,
            targetWetOpacity,
            dt * 6.0
        );

        if (this.wetMist.material.opacity >= 0.01) {
            const positions = this.wetMist.geometry.attributes.position.array;
            const cosH = Math.cos(heading);
            const sinH = Math.sin(heading);

            const wheelHalfTrack = 0.95;
            const wheelBackOffset = 1.35;

            for (let i = 0; i < this.wetParticleCount; i++) {
                const idx = i * 3;
                this.wetLifetimes[i] += dt;

                if (this.wetLifetimes[i] >= this.wetMaxLifetimes[i]) {
                    this.wetLifetimes[i] = 0;
                    this.wetMaxLifetimes[i] = 0.45 + Math.random() * 0.65;

                    const isLeft = (i % 2 === 0);
                    const sideSign = isLeft ? -1.0 : 1.0;
                    const sideSpread = (Math.random() - 0.5) * 0.35;

                    const localX = (wheelHalfTrack * sideSign) + sideSpread;
                    const localZ = wheelBackOffset + (Math.random() - 0.5) * 0.4;

                    positions[idx] = carPos.x + cosH * localX + sinH * localZ;
                    positions[idx + 1] = carPos.y + 0.12 + Math.random() * 0.15;
                    positions[idx + 2] = carPos.z - sinH * localX + cosH * localZ;

                    const sprayBackSpeed = (12.0 + speed * 0.65) * (0.8 + Math.random() * 0.4);
                    const sprayOutSpeed = sideSign * (1.5 + Math.random() * 2.5);
                    const sprayUpSpeed = 1.8 + Math.random() * 3.2;

                    this.wetVelocities[idx] = sinH * sprayBackSpeed + cosH * sprayOutSpeed + windVector.x * 4.0;
                    this.wetVelocities[idx + 1] = sprayUpSpeed;
                    this.wetVelocities[idx + 2] = cosH * sprayBackSpeed - sinH * sprayOutSpeed + windVector.y * 3.0;
                } else {
                    positions[idx] += this.wetVelocities[idx] * dt;
                    positions[idx + 1] += this.wetVelocities[idx + 1] * dt;
                    positions[idx + 2] += this.wetVelocities[idx + 2] * dt;

                    this.wetVelocities[idx] *= Math.pow(0.85, dt * 60);
                    this.wetVelocities[idx + 1] += (0.6 + speedRatio * 1.5) * dt;
                    this.wetVelocities[idx + 2] *= Math.pow(0.85, dt * 60);
                }
            }
            this.wetMist.geometry.attributes.position.needsUpdate = true;
        }

        // ----------------------------------------------------
        // 2. SMOKE TRAIL UPDATE (CLEAR WEATHER)
        // ----------------------------------------------------
        let targetSmokeOpacity = 0.0;
        if (isClear && (isMoving || isDrifting)) {
            const baseOp = isDrifting ? 0.55 : 0.22;
            const boost = isNitro ? 0.30 : 0.0;
            targetSmokeOpacity = Math.min(baseOp + speedRatio * 0.40 + boost, 0.75);
        }

        this.smokeTrail.material.opacity = THREE.MathUtils.lerp(
            this.smokeTrail.material.opacity,
            targetSmokeOpacity,
            dt * 6.0
        );

        if (this.smokeTrail.material.opacity >= 0.01) {
            const positions = this.smokeTrail.geometry.attributes.position.array;
            const sizes = this.smokeTrail.geometry.attributes.size.array;
            const cosH = Math.cos(heading);
            const sinH = Math.sin(heading);

            const wheelHalfTrack = 0.92;
            const wheelBackOffset = 1.30;

            for (let i = 0; i < this.smokeParticleCount; i++) {
                const idx = i * 3;
                this.smokeLifetimes[i] += dt;

                if (this.smokeLifetimes[i] >= this.smokeMaxLifetimes[i]) {
                    this.smokeLifetimes[i] = 0;
                    this.smokeMaxLifetimes[i] = 0.65 + Math.random() * 0.75;

                    const isLeft = (i % 2 === 0);
                    const sideSign = isLeft ? -1.0 : 1.0;
                    const sideSpread = (Math.random() - 0.5) * 0.4;

                    const localX = (wheelHalfTrack * sideSign) + sideSpread;
                    const localZ = wheelBackOffset + (Math.random() - 0.5) * 0.4;

                    positions[idx] = carPos.x + cosH * localX + sinH * localZ;
                    positions[idx + 1] = carPos.y + 0.15 + Math.random() * 0.20;
                    positions[idx + 2] = carPos.z - sinH * localX + cosH * localZ;

                    this.smokeBaseSizes[i] = 2.2 + Math.random() * 2.0;
                    sizes[i] = this.smokeBaseSizes[i];

                    const smokeBackSpeed = (5.0 + speed * 0.35) * (0.7 + Math.random() * 0.5);
                    const smokeOutSpeed = sideSign * (0.8 + Math.random() * 1.8);
                    const smokeUpSpeed = 1.2 + Math.random() * 2.2;

                    this.smokeVelocities[idx] = sinH * smokeBackSpeed + cosH * smokeOutSpeed + windVector.x * 2.0;
                    this.smokeVelocities[idx + 1] = smokeUpSpeed;
                    this.smokeVelocities[idx + 2] = cosH * smokeBackSpeed - sinH * smokeOutSpeed + windVector.y * 1.5;
                } else {
                    const progress = this.smokeLifetimes[i] / this.smokeMaxLifetimes[i];

                    positions[idx] += this.smokeVelocities[idx] * dt;
                    positions[idx + 1] += this.smokeVelocities[idx + 1] * dt;
                    positions[idx + 2] += this.smokeVelocities[idx + 2] * dt;

                    sizes[i] = this.smokeBaseSizes[i] * (1.0 + progress * 2.2);

                    this.smokeVelocities[idx] *= Math.pow(0.88, dt * 60);
                    this.smokeVelocities[idx + 1] += 0.8 * dt;
                    this.smokeVelocities[idx + 2] *= Math.pow(0.88, dt * 60);
                }
            }
            this.smokeTrail.geometry.attributes.position.needsUpdate = true;
            this.smokeTrail.geometry.attributes.size.needsUpdate = true;
        }
    }
}
