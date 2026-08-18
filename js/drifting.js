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
        this.handbrakeTimer = 0;
        this.releaseTimer = 0;
    }

    update(dt, input, weatherGripFactor = 1.0) {
        const isHandbrake = input.handbrake && Math.abs(this.v.vLong) > 2;
        const vLongAbs = Math.max(0.2, Math.abs(this.v.vLong));
        const kmh = Math.abs(this.v.vLong * 3.6);

        // 1. Calculate Front and Rear Tire Slip Angles
        this.alphaF = Math.atan2(this.vLat + this.v.yawRate * this.v.cgToFront, vLongAbs) - this.v.steerAngle * Math.sign(this.v.vLong || 1);
        this.alphaR = Math.atan2(this.vLat - this.v.yawRate * this.v.cgToRear, vLongAbs);

        // 2. Handbrake Timer for Gradual Drift Initiation & Exit
        if (isHandbrake) {
            this.handbrakeTimer = Math.min(0.2, this.handbrakeTimer + dt);
            this.releaseTimer = 0;
        } else {
            if (this.handbrakeTimer > 0) {
                this.releaseTimer = 0.5;
            }
            this.handbrakeTimer = Math.max(0, this.handbrakeTimer - dt);
            this.releaseTimer = Math.max(0, this.releaseTimer - dt);
        }

        // 3. Pacejka-Style Simplified Lateral Tire Force
        // Fy = D * sin(C * atan(B * alpha - E * (B * alpha)))
        const pacejka = (alpha, B, C, D, E) => {
            return D * Math.sin(C * Math.atan(B * alpha - E * (B * alpha)));
        };
        const FyRear = pacejka(this.alphaR, 8.0, 1.4, 1.0, 0.2);
        const targetLateralVelocity = this.v.turningSystem ? this.v.turningSystem.targetLateralVelocity : 0;
        const tireScrub = this.v.turningSystem ? this.v.turningSystem.tireScrub : 0;
        const brakeLockRatio = this.v.turningSystem ? this.v.turningSystem.brakeLockRatio : 0;

        // 4. Rear Grip Factor: smooth controlled handbrake rear traction release
        const handbrakeGripBreak = 0.25 * weatherGripFactor;
        let rearGripFactor;
        if (isHandbrake) {
            rearGripFactor = handbrakeGripBreak;
        } else if (this.releaseTimer > 0) {
            rearGripFactor = THREE.MathUtils.lerp(handbrakeGripBreak, 1.0, 1.0 - this.releaseTimer / 0.5);
        } else {
            rearGripFactor = 1.0;
        }

        // 5. Calculate Sideways Slip Velocity (vLat)
        const dvLat = -this.v.vLong * this.v.yawRate;
        const canDrift = kmh >= 6.0;

        if (isHandbrake && canDrift) {
            // Handbrake drift: rear tires lose grip, vLat evolves naturally from yaw rotation and momentum
            this.vLat += dvLat * dt * 1.4 * (1.0 - rearGripFactor);
            this.isDrifting = true;
        } else if (Math.abs(this.alphaR) > 0.12 && vLongAbs > 4.0 && canDrift) {
            // Sustained drift via high rear slip angle with pacejka grip
            const slipGrip = Math.abs(FyRear) * rearGripFactor;
            this.vLat = THREE.MathUtils.lerp(this.vLat, dvLat * 0.2, dt * 8.0 * (1.0 - slipGrip * 0.5));
            this.isDrifting = true;
        } else {
            // Normal driving: all four tires follow the bicycle-model arc instead of pivoting around one axle.
            const lowSpeedBite = THREE.MathUtils.lerp(1.9, 1.0, THREE.MathUtils.smoothstep(kmh, 0, 85));
            const gripStrength = 13.0 * lowSpeedBite * Math.max(0.45, Math.abs(FyRear)) * rearGripFactor * (1.0 - brakeLockRatio * 0.45);
            const pushSign = Math.sign(targetLateralVelocity || this.v.steerAngle || this.v.yawRate || 1);
            const highSpeedPush = THREE.MathUtils.smoothstep(kmh, 55.0, 110.0);
            const tirePush = pushSign * Math.abs(this.v.vLong) * highSpeedPush * (tireScrub * 0.08 + brakeLockRatio * 0.16);
            this.vLat = THREE.MathUtils.lerp(this.vLat, targetLateralVelocity + tirePush, dt * gripStrength);
            this.isDrifting = false;
        }

        // 6. Counter-Steer Support: steering opposite to drift reduces vLat faster
        if (this.isDrifting && Math.abs(this.driftAngle) > 0.05) {
            const steerAngle = this.v.steerAngle;
            const driftSign = Math.sign(this.driftAngle);
            const counterSteerEffect = Math.max(0, -steerAngle * driftSign) * 0.8;
            if (counterSteerEffect > 0) {
                this.vLat = THREE.MathUtils.lerp(this.vLat, 0.0, dt * counterSteerEffect * 10.0);
            }
        }

        this.v.vLat = this.vLat;

        // 7. Drift Angle Calculation (capped at 45°)
        if (Math.abs(this.v.vLong) > 1.0) {
            this.driftAngle = Math.atan2(this.vLat, Math.abs(this.v.vLong));
            const maxDriftAngle = isHandbrake ? 1.22 : Math.PI / 4; // ~70 degrees on handbrake
            this.driftAngle = THREE.MathUtils.clamp(this.driftAngle, -maxDriftAngle, maxDriftAngle);
        } else {
            this.driftAngle = 0;
        }

        // 8. Drift Scoring System
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
