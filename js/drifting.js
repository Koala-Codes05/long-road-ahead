import * as THREE from 'three';

/**
 * DriftingSystem — Vehicle Tire Slip, Drift Dynamics & Scoring.
 * Handles handbrake drift initiation, lateral slip velocity, counter-steering feedback, and drift scoring.
 */
export class DriftingSystem {
    constructor(vehicle) {
        this.v = vehicle;

        this.vLat = 0;              // Sideways slip velocity (m/s)
        this.driftAngle = 0;        // Angle between velocity vector and chassis heading
        this.isDrifting = false;
        this.driftScore = 0;
        this.driftMultiplier = 1;
        this.alphaF = 0;
        this.alphaR = 0;
    }

    update(dt, input, weather) {
        const isHandbrake = input.handbrake && Math.abs(this.v.vLong) > 2;
        const vLongAbs = Math.max(0.2, Math.abs(this.v.vLong));

        // 1. Calculate Front and Rear Tire Slip Angles
        this.alphaF = Math.atan2(this.vLat + this.v.yawRate * this.v.cgToFront, vLongAbs) - this.v.steerAngle * Math.sign(this.v.vLong || 1);
        this.alphaR = Math.atan2(this.vLat - this.v.yawRate * this.v.cgToRear, vLongAbs);

        // 2. Calculate Sideways Slip Velocity (vLat)
        const dvLat = -this.v.vLong * this.v.yawRate;

        if (isHandbrake) {
            // Handbrake breaks rear traction -> initiates sideways slide
            this.vLat += dvLat * dt * 1.8;
            this.isDrifting = true;
        } else if (Math.abs(this.alphaR) > 0.12 && vLongAbs > 4.0) {
            // High rear slip angle at speed -> sustained drift
            this.vLat = THREE.MathUtils.lerp(this.vLat, dvLat * 0.2, dt * 8.0);
            this.isDrifting = true;
        } else {
            // Normal driving -> rear tires anchor vehicle to heading
            this.vLat = THREE.MathUtils.lerp(this.vLat, 0.0, dt * 14.0);
            this.isDrifting = false;
        }

        this.v.vLat = this.vLat;

        // 3. Drift Angle Calculation
        if (Math.abs(this.v.vLong) > 1.0) {
            this.driftAngle = Math.atan2(this.vLat, Math.abs(this.v.vLong));
        } else {
            this.driftAngle = 0;
        }

        // 4. Drift Scoring System
        if (this.isDrifting && Math.abs(this.driftAngle) > 0.06) {
            const angleDeg = Math.abs(this.driftAngle * (180 / Math.PI));
            const speedKmh = Math.abs(this.v.vLong * 3.6);

            this.driftMultiplier = Math.min(4, 1 + Math.floor(angleDeg / 15));
            this.driftScore += Math.round((angleDeg * 1.5 + speedKmh * 0.5) * this.driftMultiplier * dt * 10);
        } else {
            this.driftMultiplier = 1;
        }
    }
}
