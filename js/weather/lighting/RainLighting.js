import * as THREE from 'three';

/**
 * RainLighting — Computes dynamic lighting samples (vehicle headlights, ambient moon,
 * and streetlamp light pools) for rain particle illumination.
 */
export class RainLighting {
    constructor(vehicle, world) {
        this.vehicle = vehicle;
        this.world = world;

        this.headlightPos = new THREE.Vector3();
        this.headlightDir = new THREE.Vector3(0, 0, -1);
        this.headlightColor = new THREE.Color(0xfff2dc);

        this.streetPositions = Array.from({ length: 6 }, () => new THREE.Vector3());
        this.streetColors = Array.from({ length: 6 }, () => new THREE.Color());
        this.streetCount = 0;
    }

    update(dt) {
        // Vehicle Headlight Position & Direction calculation
        if (this.vehicle && this.vehicle.mesh) {
            const carPos = this.vehicle.mesh.position;
            const heading = this.vehicle.heading;

            this.headlightPos.set(
                carPos.x - Math.sin(heading) * 1.8,
                carPos.y + 0.6,
                carPos.z - Math.cos(heading) * 1.8
            );

            this.headlightDir.set(
                -Math.sin(heading),
                -0.08,
                -Math.cos(heading)
            ).normalize();
        }

        // Query Closest Streetlights from World Light Pool (up to 6 lights)
        this.streetCount = 0;
        if (this.world && this.world.lightPool) {
            this.world.lightPool.forEach(pl => {
                if (pl.visible && this.streetCount < 6) {
                    this.streetPositions[this.streetCount].copy(pl.position);
                    this.streetColors[this.streetCount].copy(pl.color);
                    this.streetCount++;
                }
            });
        }
    }
}
