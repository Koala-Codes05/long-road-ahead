import * as THREE from 'three';
import {
    createSmokeParticleTexture,
    createFlameParticleTexture,
    createSparkParticleTexture
} from '../textures/ProceduralTextures.js';

/**
 * ExhaustVFX — High-Fidelity Vehicle Exhaust & Burnout Particle Engine.
 * Tailpipe smoke, backfire nitro flames, tire drift burnout smoke, and road sparks.
 */
export class ExhaustVFX {
    constructor(scene) {
        this.scene = scene;
        this.maxParticles = 120;
        this.particles = [];
        this.pIndex = 0;

        // Procedural particle textures (offline, 0 network latency, 0 asset 404s)
        const smokeTex = createSmokeParticleTexture();
        const flameTex = createFlameParticleTexture();
        const sparkTex = createSparkParticleTexture();

        // Instanced Geometry & Material for Volumetric Particle Billboards
        const quadGeo = new THREE.PlaneGeometry(1, 1);

        this.smokeMat = new THREE.MeshStandardMaterial({
            map: smokeTex,
            transparent: true,
            opacity: 0.65,
            roughness: 0.9,
            metalness: 0.1,
            color: 0xddeeff,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.flameMat = new THREE.MeshBasicMaterial({
            map: flameTex,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.sparkMat = new THREE.MeshBasicMaterial({
            map: sparkTex,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.smokeMesh = new THREE.InstancedMesh(quadGeo, this.smokeMat, this.maxParticles);
        this.flameMesh = new THREE.InstancedMesh(quadGeo, this.flameMat, 30);
        this.sparkMesh = new THREE.InstancedMesh(quadGeo, this.sparkMat, 40);

        this.smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.flameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        this.scene.add(this.smokeMesh);
        this.scene.add(this.flameMesh);
        this.scene.add(this.sparkMesh);

        // Pre-allocate particle pool objects
        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push({
                active: false,
                type: 'smoke', // 'smoke', 'flame', 'spark'
                pos: new THREE.Vector3(),
                vel: new THREE.Vector3(),
                scale: 1.0,
                maxScale: 2.5,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 2.0,
                life: 0.0,
                maxLife: 1.0
            });
        }

        this.dummy = new THREE.Object3D();
    }

    emitExhaust(carPos, carRotY, speedKmh, isAccelerating) {
        if (!isAccelerating && speedKmh < 5) return;

        // Tailpipe offsets relative to car frame
        const cosY = Math.cos(carRotY);
        const sinY = Math.sin(carRotY);

        const backX = carPos.x - sinY * 2.2;
        const backZ = carPos.z - cosY * 2.2;
        const posY = carPos.y + 0.35;

        // Emit tailpipe smoke
        const p = this.particles[this.pIndex];
        p.active = true;
        p.type = isAccelerating && speedKmh > 80 ? 'flame' : 'smoke';
        p.pos.set(backX + (Math.random() - 0.5) * 0.4, posY, backZ + (Math.random() - 0.5) * 0.4);
        p.vel.set(
            -sinY * (speedKmh * 0.05 + 1.5) + (Math.random() - 0.5) * 0.5,
            Math.random() * 0.6 + 0.3,
            -cosY * (speedKmh * 0.05 + 1.5) + (Math.random() - 0.5) * 0.5
        );
        p.scale = 0.4;
        p.maxScale = isAccelerating ? 2.2 : 1.2;
        p.life = 0.0;
        p.maxLife = isAccelerating ? 0.8 : 0.5;

        this.pIndex = (this.pIndex + 1) % this.maxParticles;

        // Emit sparks if drifting/skidding
        if (speedKmh > 60 && Math.random() < 0.4) {
            const sp = this.particles[this.pIndex];
            sp.active = true;
            sp.type = 'spark';
            sp.pos.set(backX, carPos.y + 0.08, backZ);
            sp.vel.set(
                (Math.random() - 0.5) * 4.0,
                Math.random() * 2.5 + 1.0,
                (Math.random() - 0.5) * 4.0
            );
            sp.scale = 0.35;
            sp.maxScale = 0.6;
            sp.life = 0.0;
            sp.maxLife = 0.3;
            this.pIndex = (this.pIndex + 1) % this.maxParticles;
        }
    }

    update(dt) {
        let smokeCount = 0;
        let flameCount = 0;
        let sparkCount = 0;

        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.particles[i];
            if (!p.active) continue;

            p.life += dt;
            if (p.life >= p.maxLife) {
                p.active = false;
                continue;
            }

            const progress = p.life / p.maxLife;
            p.pos.addScaledVector(p.vel, dt);
            p.rot += p.rotSpeed * dt;
            const curScale = THREE.MathUtils.lerp(p.scale, p.maxScale, progress);

            this.dummy.position.copy(p.pos);
            this.dummy.rotation.set(0, p.rot, 0);
            this.dummy.scale.setScalar(curScale);
            this.dummy.updateMatrix();

            if (p.type === 'smoke' && smokeCount < this.maxParticles) {
                this.smokeMesh.setMatrixAt(smokeCount++, this.dummy.matrix);
            } else if (p.type === 'flame' && flameCount < 30) {
                this.flameMesh.setMatrixAt(flameCount++, this.dummy.matrix);
            } else if (p.type === 'spark' && sparkCount < 40) {
                this.sparkMesh.setMatrixAt(sparkCount++, this.dummy.matrix);
            }
        }

        this.smokeMesh.count = smokeCount;
        this.flameMesh.count = flameCount;
        this.sparkMesh.count = sparkCount;

        if (smokeCount > 0) this.smokeMesh.instanceMatrix.needsUpdate = true;
        if (flameCount > 0) this.flameMesh.instanceMatrix.needsUpdate = true;
        if (sparkCount > 0) this.sparkMesh.instanceMatrix.needsUpdate = true;
    }
}
